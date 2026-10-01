const { db } = require('../db/database');

const DEFAULT_WEIGHTS = {
  severity: 0.20,
  safetyRisk: 0.25,
  publicImpact: 0.15,
  assetImportance: 0.10,
  locationImportance: 0.10,
  previousComplaints: 0.10,
  assetCondition: 0.05,
  waitingTime: 0.05
};

/**
 * Retrieve current weights from database or use defaults
 */
function getPriorityWeights() {
  try {
    const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('priority_weights');
    if (row && row.value) {
      const parsed = JSON.parse(row.value);
      return { ...DEFAULT_WEIGHTS, ...parsed };
    }
  } catch (err) {
    console.warn('Error reading priority weights from db, using defaults:', err.message);
  }
  return { ...DEFAULT_WEIGHTS };
}

/**
 * Update priority weights in system_settings
 */
function updatePriorityWeights(newWeights) {
  // Validate that weights are positive numbers
  const keys = Object.keys(DEFAULT_WEIGHTS);
  const validated = {};
  let total = 0;

  for (const k of keys) {
    const val = Number(newWeights[k]);
    if (isNaN(val) || val < 0) {
      throw new Error(`Invalid weight for factor '${k}': must be a non-negative number.`);
    }
    validated[k] = val;
    total += val;
  }

  if (total <= 0) {
    throw new Error('Total sum of weights must be greater than zero.');
  }

  // Normalize weights so they sum to 1.0
  for (const k of keys) {
    validated[k] = parseFloat((validated[k] / total).toFixed(4));
  }

  db.prepare(`
    INSERT INTO system_settings (key, value, description, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `).run('priority_weights', JSON.stringify(validated), 'Configurable weights for the AI Priority Engine');

  return validated;
}

/**
 * Helper to clamp values safely between 0 and 100
 */
function clamp(val, min = 0, max = 100) {
  if (val === null || val === undefined || isNaN(val)) return min;
  return Math.min(Math.max(Number(val), min), max);
}

/**
 * Map severity string or number to 0-100 score
 */
function calculateSeverityScore(severity) {
  if (typeof severity === 'number') return clamp(severity);
  const s = String(severity || '').toUpperCase();
  switch (s) {
    case 'CRITICAL': return 95;
    case 'HIGH': return 75;
    case 'MEDIUM': return 50;
    case 'LOW': return 25;
    default: return 50; // Fallback for missing/unknown
  }
}

/**
 * Map issue type and context to safety risk score (0-100)
 */
function calculateSafetyRiskScore(issueType, severity) {
  const t = String(issueType || '').toLowerCase();
  const s = String(severity || '').toUpperCase();

  let baseRisk = 50;
  if (t.includes('streetlight') || t.includes('electric') || t.includes('wire')) {
    baseRisk = 90; // Nocturnal crime / electrocution hazard
  } else if (t.includes('pothole') || t.includes('crater')) {
    baseRisk = (s === 'CRITICAL' || s === 'HIGH') ? 85 : 65; // High speed vehicular collision hazard
  } else if (t.includes('infrastructure') || t.includes('building') || t.includes('bridge') || t.includes('barrier')) {
    baseRisk = 85; // Structural failure or falling hazard
  } else if (t.includes('drain') || t.includes('drainage')) {
    baseRisk = 80; // Drainage overflow, open manhole, waterlogging hazard
  } else if (t.includes('water') || t.includes('flood') || t.includes('leak')) {
    baseRisk = 75; // Road erosion, sinking ground hazard
  } else if (t.includes('sign')) {
    baseRisk = 60; // Obscured/damaged road sign traffic risk
  } else if (t.includes('footpath') || t.includes('sidewalk') || t.includes('crack')) {
    baseRisk = 50; // Pedestrian trip hazard
  } else if (t.includes('garbage') || t.includes('waste')) {
    baseRisk = 40; // Public sanitation / disease vector hazard
  } else if (t.includes('no issue') || t.includes('unclear')) {
    baseRisk = 5;
  } else {
    baseRisk = 50;
  }

  // Adjust for severity
  if (s === 'CRITICAL') baseRisk = Math.max(baseRisk, 90);
  else if (s === 'HIGH') baseRisk = Math.max(baseRisk, 75);
  else if (s === 'LOW') baseRisk = Math.min(baseRisk, 30);

  return clamp(baseRisk);
}

/**
 * Map condition string to score (Critical condition = higher priority score)
 */
function calculateAssetConditionScore(condition) {
  const c = String(condition || '').toUpperCase();
  switch (c) {
    case 'CRITICAL': return 95;
    case 'POOR': return 75;
    case 'FAIR': return 45;
    case 'GOOD': return 15;
    default: return 50;
  }
}

/**
 * Calculate waiting time score based on hours elapsed
 */
function calculateWaitingTimeScore(reportedAt) {
  if (!reportedAt) return 20; // Default if newly reported
  const reportedTime = new Date(reportedAt).getTime();
  if (isNaN(reportedTime)) return 20;
  
  const diffHours = (Date.now() - reportedTime) / (1000 * 60 * 60);
  if (diffHours <= 0) return 10;
  if (diffHours < 6) return 20;
  if (diffHours < 24) return 40;
  if (diffHours < 72) return 65;
  if (diffHours < 168) return 85; // > 3 days
  return 95; // > 1 week
}

/**
 * Map previous complaint count to 0-100 score
 */
function calculatePreviousComplaintScore(count) {
  const c = Number(count) || 0;
  if (c <= 0) return 10;
  if (c === 1) return 30;
  if (c <= 3) return 55;
  if (c <= 6) return 75;
  return 95;
}

/**
 * Core Priority Engine Service
 * Receives maintenance request context and calculates transparent weighted score
 */
function calculatePriority(request, customWeights = null) {
  const weights = customWeights || getPriorityWeights();

  // Normalize factor scores between 0 and 100
  const severityScore = calculateSeverityScore(request.severity);
  const safetyRiskScore = request.safetyRiskScore !== undefined 
    ? clamp(request.safetyRiskScore) 
    : calculateSafetyRiskScore(request.issueType || request.issue_type, request.severity);
    
  const publicImpactScore = request.publicImpactScore !== undefined
    ? clamp(request.publicImpactScore)
    : clamp((Number(request.public_impact_factor || request.publicImpact) || 3) * 20);

  const assetImportanceScore = request.assetImportanceScore !== undefined
    ? clamp(request.assetImportanceScore)
    : clamp((Number(request.importance_score || request.assetImportance) || 3) * 20);

  const locationImportanceScore = request.locationImportanceScore !== undefined
    ? clamp(request.locationImportanceScore)
    : clamp((Number(request.importance_level || request.locationImportance) || 3) * 20);

  const previousComplaintScore = request.previousComplaintScore !== undefined
    ? clamp(request.previousComplaintScore)
    : calculatePreviousComplaintScore(request.previousComplaintsCount || request.previous_complaints_count || 0);

  const assetConditionScore = request.assetConditionScore !== undefined
    ? clamp(request.assetConditionScore)
    : calculateAssetConditionScore(request.condition || request.assetCondition);

  const waitingTimeScore = request.waitingTimeScore !== undefined
    ? clamp(request.waitingTimeScore)
    : calculateWaitingTimeScore(request.reported_at || request.reportedAt);

  const factorScores = {
    severityScore: Math.round(severityScore),
    safetyRiskScore: Math.round(safetyRiskScore),
    publicImpactScore: Math.round(publicImpactScore),
    assetImportanceScore: Math.round(assetImportanceScore),
    locationImportanceScore: Math.round(locationImportanceScore),
    previousComplaintScore: Math.round(previousComplaintScore),
    assetConditionScore: Math.round(assetConditionScore),
    waitingTimeScore: Math.round(waitingTimeScore)
  };

  // Weighted sum
  const sumWeights = 
    (weights.severity || 0) +
    (weights.safetyRisk || 0) +
    (weights.publicImpact || 0) +
    (weights.assetImportance || 0) +
    (weights.locationImportance || 0) +
    (weights.previousComplaints || 0) +
    (weights.assetCondition || 0) +
    (weights.waitingTime || 0);

  const effectiveSum = sumWeights > 0 ? sumWeights : 1.0;

  const weightedSum =
    (severityScore * (weights.severity || 0)) +
    (safetyRiskScore * (weights.safetyRisk || 0)) +
    (publicImpactScore * (weights.publicImpact || 0)) +
    (assetImportanceScore * (weights.assetImportance || 0)) +
    (locationImportanceScore * (weights.locationImportance || 0)) +
    (previousComplaintScore * (weights.previousComplaints || 0)) +
    (assetConditionScore * (weights.assetCondition || 0)) +
    (waitingTimeScore * (weights.waitingTime || 0));

  const priorityScore = clamp(Math.round(weightedSum / effectiveSum));

  // Categorize
  let priorityLevel = 'LOW';
  if (priorityScore >= 81) {
    priorityLevel = 'CRITICAL';
  } else if (priorityScore >= 61) {
    priorityLevel = 'HIGH';
  } else if (priorityScore >= 31) {
    priorityLevel = 'MEDIUM';
  } else {
    priorityLevel = 'LOW';
  }

  // Generate transparent human-readable explanation from actual data
  const explanation = generateExplanation({
    priorityLevel,
    priorityScore,
    factorScores,
    issueType: request.issueType || request.issue_type,
    severity: request.severity,
    assetName: request.asset_name || request.assetName,
    locationName: request.location_name || request.locationName
  });

  return {
    priorityScore,
    priorityLevel,
    factorScores,
    weights,
    explanation,
    isOverridden: false
  };
}

/**
 * Generate human-readable explanation derived STRICTLY from stored data
 */
function generateExplanation({ priorityLevel, priorityScore, factorScores, issueType, severity, assetName, locationName }) {
  const reasons = [];

  if (factorScores.safetyRiskScore >= 75) {
    reasons.push(`High safety risk identified for ${issueType || 'public infrastructure'}`);
  }
  if (factorScores.severityScore >= 75) {
    reasons.push(`Reported with ${severity || 'HIGH'} severity rating`);
  }
  if (factorScores.publicImpactScore >= 75) {
    reasons.push('High public impact: significant daily pedestrian or vehicular traffic');
  }
  if (factorScores.assetImportanceScore >= 75) {
    reasons.push(`Designated high-value municipal asset (${assetName || 'critical asset'})`);
  }
  if (factorScores.locationImportanceScore >= 75) {
    reasons.push(`Located in critical urban zone (${locationName || 'high density sector'})`);
  }
  if (factorScores.previousComplaintScore >= 60) {
    reasons.push('Multiple recurring complaints recorded in municipal records');
  }
  if (factorScores.assetConditionScore >= 70) {
    reasons.push('Asset baseline structural condition is Poor or Critical');
  }
  if (factorScores.waitingTimeScore >= 65) {
    reasons.push('Extended pending response time requires escalation');
  }

  if (reasons.length === 0) {
    if (priorityLevel === 'LOW') {
      reasons.push('Minor cosmetic defect with low safety hazard');
      reasons.push('Asset is in functional condition');
    } else {
      reasons.push('Standard operational maintenance threshold met');
    }
  }

  let recommendedResponse = 'Routine inspection at next maintenance cycle.';
  if (priorityLevel === 'CRITICAL') {
    recommendedResponse = 'Dispatch Emergency Quick-Response Team immediately (within 2-4 hours).';
  } else if (priorityLevel === 'HIGH') {
    recommendedResponse = 'Schedule inspection and maintenance crew as soon as possible (within 24 hours).';
  } else if (priorityLevel === 'MEDIUM') {
    recommendedResponse = 'Queue for standard departmental service schedule (within 3-5 business days).';
  }

  const lines = [
    `Priority: ${priorityLevel}`,
    `Score: ${priorityScore}/100`,
    '',
    'Reasons:',
    ...reasons.map(r => `- ${r}`),
    '',
    `Recommended response:\n${recommendedResponse}`
  ];

  return lines.join('\n');
}

/**
 * Evaluate and persist priority for a complaint in the database
 */
function evaluateAndStorePriority(complaintId, customOverride = null) {
  // Fetch complaint details joined with asset and location
  const stmt = db.prepare(`
    SELECT c.*, a.name as asset_name, a.condition, a.importance_score, a.public_impact_factor,
           l.name as location_name, l.importance_level
    FROM complaints c
    LEFT JOIN assets a ON c.asset_id = a.id
    LEFT JOIN locations l ON c.location_id = l.id
    WHERE c.id = ?
  `);

  const complaint = stmt.get(complaintId);
  if (!complaint) {
    throw new Error(`Complaint ID ${complaintId} not found.`);
  }

  // Count previous complaints for the same asset or location
  const prevCountStmt = db.prepare(`
    SELECT COUNT(*) as count FROM complaints 
    WHERE (asset_id = ? OR location_id = ?) AND id != ?
  `);
  const prevCount = prevCountStmt.get(complaint.asset_id || 0, complaint.location_id || 0, complaintId).count;

  complaint.previousComplaintsCount = prevCount;

  // Calculate priority
  const result = calculatePriority(complaint);

  // If administrator override is specified
  let isOverridden = 0;
  let overriddenBy = null;
  let overrideReason = null;
  let finalScore = result.priorityScore;
  let finalLevel = result.priorityLevel;

  if (customOverride && customOverride.priorityLevel) {
    isOverridden = 1;
    finalLevel = customOverride.priorityLevel;
    overriddenBy = customOverride.userId || 1;
    overrideReason = customOverride.reason || 'Manual administrator override';
    if (customOverride.priorityScore !== undefined) {
      finalScore = clamp(customOverride.priorityScore);
    }
  }

  // Save or update in priority_scores table
  const upsertStmt = db.prepare(`
    INSERT INTO priority_scores (
      complaint_id, priority_score, priority_level, severity_score, safety_risk_score,
      public_impact_score, asset_importance_score, location_importance_score,
      previous_complaint_score, asset_condition_score, waiting_time_score,
      explanation, is_overridden, overridden_by_user_id, override_reason, calculated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(complaint_id) DO UPDATE SET
      priority_score = excluded.priority_score,
      priority_level = excluded.priority_level,
      severity_score = excluded.severity_score,
      safety_risk_score = excluded.safety_risk_score,
      public_impact_score = excluded.public_impact_score,
      asset_importance_score = excluded.asset_importance_score,
      location_importance_score = excluded.location_importance_score,
      previous_complaint_score = excluded.previous_complaint_score,
      asset_condition_score = excluded.asset_condition_score,
      waiting_time_score = excluded.waiting_time_score,
      explanation = excluded.explanation,
      is_overridden = excluded.is_overridden,
      overridden_by_user_id = excluded.overridden_by_user_id,
      override_reason = excluded.override_reason,
      calculated_at = CURRENT_TIMESTAMP
  `);

  upsertStmt.run(
    complaintId, finalScore, finalLevel,
    result.factorScores.severityScore,
    result.factorScores.safetyRiskScore,
    result.factorScores.publicImpactScore,
    result.factorScores.assetImportanceScore,
    result.factorScores.locationImportanceScore,
    result.factorScores.previousComplaintScore,
    result.factorScores.assetConditionScore,
    result.factorScores.waitingTimeScore,
    result.explanation,
    isOverridden,
    overriddenBy,
    overrideReason
  );

  return {
    ...result,
    priorityScore: finalScore,
    priorityLevel: finalLevel,
    isOverridden: Boolean(isOverridden),
    overrideReason
  };
}

module.exports = {
  calculatePriority,
  calculateSeverityScore,
  calculateSafetyRiskScore,
  calculateAssetConditionScore,
  calculateWaitingTimeScore,
  calculatePreviousComplaintScore,
  generateExplanation,
  evaluateAndStorePriority,
  getPriorityWeights,
  updatePriorityWeights,
  DEFAULT_WEIGHTS,
  clamp
};
