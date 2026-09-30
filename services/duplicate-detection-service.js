const { db } = require('../db/database');

/**
 * Calculate Haversine distance between two coordinates in meters
 */
function getHaversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

/**
 * Check if a newly submitted complaint might be a duplicate of an existing open complaint
 */
function detectDuplicateComplaint({ latitude, longitude, locationId, assetId, issueType, excludeComplaintId = null }) {
  // Query all active complaints
  let query = `
    SELECT c.id, c.complaint_number, c.issue_type, c.severity, c.department, c.status,
           c.reported_at, c.asset_id, c.location_id,
           l.latitude, l.longitude, l.name as location_name, l.address,
           a.name as asset_name, a.asset_tag
    FROM complaints c
    LEFT JOIN locations l ON c.location_id = l.id
    LEFT JOIN assets a ON c.asset_id = a.id
    WHERE c.status IN ('REPORTED', 'ASSIGNED', 'IN_PROGRESS')
      AND c.merged_into_id IS NULL
  `;

  if (excludeComplaintId) {
    query += ` AND c.id != ${Number(excludeComplaintId)}`;
  }

  const activeComplaints = db.prepare(query).all();
  const duplicateMatches = [];

  for (const existing of activeComplaints) {
    let distanceMeters = 99999;
    let distanceMatch = false;

    // Check coordinate distance if coordinates provided
    if (latitude && longitude && existing.latitude && existing.longitude) {
      distanceMeters = getHaversineDistanceMeters(latitude, longitude, existing.latitude, existing.longitude);
      if (distanceMeters <= 120) {
        distanceMatch = true;
      }
    } else if (locationId && existing.location_id === Number(locationId)) {
      distanceMeters = 20; // Same location record
      distanceMatch = true;
    }

    // Check same asset
    const sameAsset = assetId && existing.asset_id && Number(assetId) === Number(existing.asset_id);
    if (sameAsset) {
      distanceMatch = true;
      if (distanceMeters > 50) distanceMeters = 15;
    }

    // Check issue type
    const issueMatch = (issueType || '').toLowerCase() === (existing.issue_type || '').toLowerCase();

    if (distanceMatch && issueMatch) {
      let similarityScore = 70;
      if (sameAsset) similarityScore += 25;
      if (distanceMeters < 30) similarityScore += 15;
      else if (distanceMeters < 60) similarityScore += 10;

      similarityScore = Math.min(similarityScore, 98);

      duplicateMatches.push({
        existingComplaintId: existing.id,
        complaintNumber: existing.complaint_number,
        distanceMeters,
        locationName: existing.location_name || existing.address || 'Nearby sector',
        assetName: existing.asset_name,
        issueType: existing.issue_type,
        severity: existing.severity,
        status: existing.status,
        reportedAt: existing.reported_at,
        similarity: similarityScore
      });
    }
  }

  // Sort descending by similarity
  duplicateMatches.sort((a, b) => b.similarity - a.similarity);

  if (duplicateMatches.length > 0) {
    const topMatch = duplicateMatches[0];
    return {
      isDuplicate: true,
      confidence: topMatch.similarity,
      topCandidate: topMatch,
      allCandidates: duplicateMatches,
      message: 'Possible duplicate complaint detected.'
    };
  }

  return {
    isDuplicate: false,
    confidence: 0,
    topCandidate: null,
    allCandidates: [],
    message: 'No duplicate complaints detected.'
  };
}

/**
 * Merge duplicate complaint into primary complaint
 * NOTE: Never deletes the duplicate record; flags merged_into_id and logs audit record.
 */
function mergeComplaints(primaryComplaintId, duplicateComplaintId, adminUserId = 1, mergeNotes = '') {
  if (Number(primaryComplaintId) === Number(duplicateComplaintId)) {
    throw new Error('Cannot merge a complaint into itself.');
  }

  const primary = db.prepare('SELECT * FROM complaints WHERE id = ?').get(primaryComplaintId);
  const duplicate = db.prepare('SELECT * FROM complaints WHERE id = ?').get(duplicateComplaintId);

  if (!primary || !duplicate) {
    throw new Error('Primary or duplicate complaint was not found.');
  }

  // Update duplicate complaint status and merged_into_id
  db.prepare(`
    UPDATE complaints 
    SET merged_into_id = ?, status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP 
    WHERE id = ?
  `).run(primaryComplaintId, duplicateComplaintId);

  // Record in maintenance history for auditability
  db.prepare(`
    INSERT INTO maintenance_history (
      asset_id, complaint_id, action_taken, performed_by, before_condition, after_condition,
      completion_notes, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    duplicate.asset_id || primary.asset_id,
    duplicateComplaintId,
    `Merged with Master Complaint #${primary.complaint_number}`,
    'Administrator Merge Action',
    duplicate.severity,
    'Merged & Consolidated',
    mergeNotes || `Citizen complaint #${duplicate.complaint_number} merged into Master Record #${primary.complaint_number} to prevent redundant crew dispatch.`
  );

  return {
    success: true,
    primaryComplaintNumber: primary.complaint_number,
    duplicateComplaintNumber: duplicate.complaint_number,
    mergedAt: new Date().toISOString()
  };
}

module.exports = {
  detectDuplicateComplaint,
  mergeComplaints,
  getHaversineDistanceMeters
};
