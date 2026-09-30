const { db } = require('./database');

function seedDatabase() {
  // Check if already seeded
  const checkStmt = db.prepare('SELECT COUNT(*) as count FROM users');
  const userCount = checkStmt.get().count;
  if (userCount > 0) {
    console.log('Database already seeded. Skipping seed process.');
    return;
  }

  console.log('Seeding initial infrastructure data...');

  // 1. System Settings (Configurable Priority Engine Weights)
  const defaultWeights = {
    severity: 0.20,
    safetyRisk: 0.25,
    publicImpact: 0.15,
    assetImportance: 0.10,
    locationImportance: 0.10,
    previousComplaints: 0.10,
    assetCondition: 0.05,
    waitingTime: 0.05
  };

  const insertSetting = db.prepare('INSERT OR REPLACE INTO system_settings (key, value, description) VALUES (?, ?, ?)');
  insertSetting.run('priority_weights', JSON.stringify(defaultWeights), 'Configurable weights for the AI Priority Engine');
  insertSetting.run('duplicate_distance_threshold_meters', '80', 'Maximum geographic distance in meters to flag duplicate complaints');
  insertSetting.run('hotspot_radius_meters', '250', 'Clustering radius for identifying maintenance hotspots');

  // 2. Users
  const insertUser = db.prepare('INSERT INTO users (name, email, role, phone, department) VALUES (?, ?, ?, ?, ?)');
  insertUser.run('Commissioner R. K. Sharma', 'admin@metroinfra.gov', 'admin', '+91 98765 43210', 'Municipal Directorate');
  insertUser.run('Er. Anita Desai', 'anita.desai@metroinfra.gov', 'maintenance_staff', '+91 98765 43211', 'Roads & Infrastructure');
  insertUser.run('Er. Vikram Patil', 'vikram.patil@metroinfra.gov', 'maintenance_staff', '+91 98765 43212', 'Electrical & Utilities');
  insertUser.run('Public Citizen', 'citizen@nagardrishti.gov', 'citizen', '+91 98765 00000', 'Public Citizen');
  insertUser.run('Ward Resident', 'resident@nagardrishti.gov', 'citizen', '+91 98765 11111', 'Civic Survey');

  // 3. Locations
  const insertLocation = db.prepare('INSERT INTO locations (name, address, ward_district, latitude, longitude, importance_level) VALUES (?, ?, ?, ?, ?, ?)');
  insertLocation.run('Central Commercial District', 'MG Road Arterial Corridor', 'Ward 12 - Central', 12.9719, 77.5937, 5);
  insertLocation.run('Tech Corridor Express Junction', 'Outer Ring Road, Marathahalli', 'Ward 15 - Tech Hub', 12.9352, 77.6245, 5);
  insertLocation.run('North Residential Suburb', '14th Cross, Malleshwaram', 'Ward 04 - West', 13.0068, 77.5813, 3);
  insertLocation.run('Old Town Heritage Zone', 'Market Road, Avenue Street', 'Ward 08 - South', 12.9634, 77.5750, 4);
  insertLocation.run('Metro Hospital & Health District', 'Bannerghatta Medical Enclave', 'Ward 09 - South-East', 12.9850, 77.6050, 5);
  insertLocation.run('Industrial Bypass Corridor', 'Peenya Industrial Access Road', 'Ward 22 - Industrial', 12.9180, 77.5620, 3);

  // 4. Assets
  const insertAsset = db.prepare('INSERT INTO assets (asset_tag, name, asset_type, location_id, condition, importance_score, public_impact_factor, installation_date, last_inspection_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  insertAsset.run('AST-RD-101', 'Central Flyover Bridge & Arterial Deck', 'Road', 1, 'Fair', 5, 5, '2019-03-15', '2026-08-10');
  insertAsset.run('AST-LT-204', 'High-Mast LED Streetlight Cluster #4', 'Streetlight', 2, 'Poor', 3, 4, '2021-06-20', '2026-07-15');
  insertAsset.run('AST-SW-302', 'Civic Pedestrian Promenade & Tactile Sidewalk', 'Sidewalk', 1, 'Poor', 4, 4, '2020-01-10', '2026-08-01');
  insertAsset.run('AST-WT-405', 'Main Potable Water Trunk Pipeline DN400', 'Water Pipeline', 4, 'Poor', 5, 5, '2017-11-05', '2026-06-28');
  insertAsset.run('AST-DR-501', 'Sector 4 Underground Stormwater Drain Network', 'Drainage', 4, 'Critical', 4, 5, '2018-04-12', '2026-09-02');
  insertAsset.run('AST-BL-603', 'Public Community Health Annex Building', 'Public Building', 5, 'Fair', 5, 4, '2016-09-18', '2026-07-22');
  insertAsset.run('AST-RD-108', 'Industrial Heavy Transit Arterial Segment B', 'Road', 6, 'Critical', 4, 4, '2018-12-01', '2026-08-25');
  insertAsset.run('AST-PK-701', 'North Gate Public Civic Plaza & Walkway', 'Park Facility', 3, 'Good', 2, 3, '2022-04-15', '2026-08-30');

  // 5. Seed Historical Complaints (spanning past 5-6 months for realistic trend analysis)
  const insertComplaint = db.prepare(`
    INSERT INTO complaints (
      complaint_number, user_id, asset_id, location_id, issue_type, severity, department,
      description, recommended_action, status, is_ai_assisted, citizen_name, citizen_phone, citizen_email, reported_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAI = db.prepare(`
    INSERT INTO ai_analysis (
      complaint_id, image_id, issue_type, confidence, severity, department, description, recommended_action, provider
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertPriority = db.prepare(`
    INSERT INTO priority_scores (
      complaint_id, priority_score, priority_level, severity_score, safety_risk_score,
      public_impact_score, asset_importance_score, location_importance_score, previous_complaint_score,
      asset_condition_score, waiting_time_score, explanation
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertImage = db.prepare(`
    INSERT INTO images (complaint_id, asset_id, image_type, file_path, original_filename, file_size, mime_type)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const historicalData = [
    // Month: April (5 months ago)
    {
      num: 'CMP-2026-0401', assetId: 4, locId: 4, issue: 'Water leakage', sev: 'HIGH',
      dept: 'Water & Sewerage', desc: 'Subsurface water leakage seeping through paving stones',
      action: 'Excavate and replace faulty joint gasket', status: 'COMPLETED',
      date: '2026-04-12 10:15:00', score: 72, level: 'HIGH', pCount: 10
    },
    {
      num: 'CMP-2026-0402', assetId: 5, locId: 4, issue: 'Water leakage', sev: 'MEDIUM',
      dept: 'Water & Sewerage', desc: 'Minor drainage overflow onto curb',
      action: 'Clear silt traps and flush inlet conduit', status: 'COMPLETED',
      date: '2026-04-20 14:30:00', score: 55, level: 'MEDIUM', pCount: 15
    },
    // Month: May (4 months ago)
    {
      num: 'CMP-2026-0501', assetId: 5, locId: 4, issue: 'Water leakage', sev: 'HIGH',
      dept: 'Water & Sewerage', desc: 'Stormwater overflow and ponding near market entrance',
      action: 'Deploy suction truck and reinforce weir wall', status: 'COMPLETED',
      date: '2026-05-08 09:20:00', score: 74, level: 'HIGH', pCount: 30
    },
    {
      num: 'CMP-2026-0502', assetId: 1, locId: 1, issue: 'Road crack', sev: 'MEDIUM',
      dept: 'Roads & Bridges', desc: 'Longitudinal thermal fissure across fast lane',
      action: 'Hot bitumen crack sealing', status: 'COMPLETED',
      date: '2026-05-18 16:45:00', score: 52, level: 'MEDIUM', pCount: 20
    },
    {
      num: 'CMP-2026-0503', assetId: 2, locId: 2, issue: 'Broken streetlight', sev: 'LOW',
      dept: 'Electrical & Lighting', desc: 'Flickering luminaire on mast 4',
      action: 'Replace LED driver module', status: 'COMPLETED',
      date: '2026-05-25 21:00:00', score: 28, level: 'LOW', pCount: 10
    },
    // Month: June (3 months ago)
    {
      num: 'CMP-2026-0601', assetId: 5, locId: 4, issue: 'Water leakage', sev: 'HIGH',
      dept: 'Water & Sewerage', desc: 'Drain pipe fracture causing localized flooding',
      action: 'Install trenchless slip-lining patch', status: 'COMPLETED',
      date: '2026-06-05 11:10:00', score: 78, level: 'HIGH', pCount: 45
    },
    {
      num: 'CMP-2026-0602', assetId: 7, locId: 6, issue: 'Pothole', sev: 'CRITICAL',
      dept: 'Roads & Bridges', desc: 'Severe deep crater (15cm) on industrial access lane',
      action: 'Emergency cold mix asphalt filling and roller compaction', status: 'COMPLETED',
      date: '2026-06-14 08:30:00', score: 86, level: 'CRITICAL', pCount: 50
    },
    {
      num: 'CMP-2026-0603', assetId: 3, locId: 1, issue: 'Damaged sidewalk', sev: 'MEDIUM',
      dept: 'Roads & Bridges', desc: 'Uprooted pavers due to tree roots',
      action: 'Level base gravel and reset paving stones', status: 'COMPLETED',
      date: '2026-06-22 17:15:00', score: 48, level: 'MEDIUM', pCount: 20
    },
    // Month: July (2 months ago)
    {
      num: 'CMP-2026-0701', assetId: 5, locId: 4, issue: 'Water leakage', sev: 'HIGH',
      dept: 'Water & Sewerage', desc: 'Silt blockage causing backflow and water ponding',
      action: 'Full hydro-jetting and de-silting of underground chamber', status: 'COMPLETED',
      date: '2026-07-04 12:00:00', score: 79, level: 'HIGH', pCount: 60
    },
    {
      num: 'CMP-2026-0702', assetId: 2, locId: 2, issue: 'Broken streetlight', sev: 'HIGH',
      dept: 'Electrical & Lighting', desc: 'Total blackout of 3 consecutive streetlights at curve',
      action: 'Replace blown transformer fuse and rewire junction box', status: 'COMPLETED',
      date: '2026-07-16 20:30:00', score: 71, level: 'HIGH', pCount: 40
    },
    {
      num: 'CMP-2026-0703', assetId: 7, locId: 6, issue: 'Pothole', sev: 'HIGH',
      dept: 'Roads & Bridges', desc: 'Cluster of multiple interconnected potholes',
      action: 'Full-depth milling and asphalt resurfacing', status: 'COMPLETED',
      date: '2026-07-28 15:40:00', score: 75, level: 'HIGH', pCount: 55
    },
    // Month: August (1 month ago)
    {
      num: 'CMP-2026-0801', assetId: 5, locId: 4, issue: 'Water leakage', sev: 'CRITICAL',
      dept: 'Water & Sewerage', desc: 'Severe drainage overflow submerging sidewalk and pedestrian ramp',
      action: 'Immediate containment pump and structural vault repair', status: 'COMPLETED',
      date: '2026-08-02 10:00:00', score: 88, level: 'CRITICAL', pCount: 75
    },
    {
      num: 'CMP-2026-0802', assetId: 6, locId: 5, issue: 'Damaged public building', sev: 'MEDIUM',
      dept: 'Municipal Buildings', desc: 'Exterior plaster delamination and loose facade tile',
      action: 'Chipping of loose render and polymer-modified mortar repair', status: 'COMPLETED',
      date: '2026-08-11 13:20:00', score: 58, level: 'MEDIUM', pCount: 25
    },
    {
      num: 'CMP-2026-0803', assetId: 1, locId: 1, issue: 'Pothole', sev: 'HIGH',
      dept: 'Roads & Bridges', desc: 'Dangerous expansion joint cavity on flyover deck',
      action: 'Elastomeric joint repair and rapid curing mortar', status: 'COMPLETED',
      date: '2026-08-20 07:45:00', score: 77, level: 'HIGH', pCount: 40
    },
    // Month: September (Current Month - Active Complaints!)
    {
      num: 'CMP-2026-0901', assetId: 5, locId: 4, issue: 'Water leakage', sev: 'CRITICAL',
      dept: 'Water & Sewerage', desc: 'Persistent stormwater manhole backpressure and active water geyser',
      action: 'Structural drain culvert replacement required immediately', status: 'REPORTED',
      date: '2026-09-18 09:30:00', score: 91, level: 'CRITICAL', pCount: 90
    },
    {
      num: 'CMP-2026-0902', assetId: 1, locId: 1, issue: 'Pothole', sev: 'CRITICAL',
      dept: 'Roads & Bridges', desc: 'Large 20cm deep pothole in center lane causing vehicle tire blowouts',
      action: 'Urgent asphalt patch and compaction', status: 'ASSIGNED',
      date: '2026-09-20 11:15:00', score: 89, level: 'CRITICAL', pCount: 65
    },
    {
      num: 'CMP-2026-0903', assetId: 2, locId: 2, issue: 'Broken streetlight', sev: 'HIGH',
      dept: 'Electrical & Lighting', desc: 'Pole leaning dangerously with exposed wiring after vehicle impact',
      action: 'Isolate live power supply and replace damaged steel pole', status: 'IN_PROGRESS',
      date: '2026-09-21 18:40:00', score: 82, level: 'CRITICAL', pCount: 50
    },
    {
      num: 'CMP-2026-0904', assetId: 3, locId: 1, issue: 'Damaged sidewalk', sev: 'MEDIUM',
      dept: 'Roads & Bridges', desc: 'Dislodged granite curbing obstructing wheelchair accessibility',
      action: 'Re-align and mortar curb stones to ADA compliant grade', status: 'REPORTED',
      date: '2026-09-22 14:10:00', score: 54, level: 'MEDIUM', pCount: 30
    },
    {
      num: 'CMP-2026-0905', assetId: 7, locId: 6, issue: 'Road crack', sev: 'HIGH',
      dept: 'Roads & Bridges', desc: 'Severe alligator cracking across 15 meters of transit lane',
      action: 'Milling, sub-base stabilization, and asphalt overlay', status: 'ASSIGNED',
      date: '2026-09-23 08:50:00', score: 76, level: 'HIGH', pCount: 60
    }
  ];

  historicalData.forEach((item, index) => {
    // Insert complaint
    const result = insertComplaint.run(
      item.num, 5, item.assetId, item.locId, item.issue, item.sev, item.dept,
      item.desc, item.action, item.status, 1, 'Ward Resident', '+91 98765 11111', 'resident@nagardrishti.gov', item.date
    );
    const complaintId = result.lastInsertRowid;

    // Insert Image
    const sampleFileName = item.issue === 'Pothole' ? 'sample-pothole.jpg' :
                           item.issue === 'Broken streetlight' ? 'sample-streetlight.jpg' :
                           item.issue === 'Water leakage' ? 'sample-waterleak.jpg' :
                           item.issue === 'Damaged sidewalk' ? 'sample-sidewalk.jpg' : 'sample-roadcrack.jpg';

    const imgResult = insertImage.run(
      complaintId, item.assetId, 'INITIAL_REPORT',
      `/assets/${sampleFileName}`, sampleFileName, 245000, 'image/jpeg'
    );
    const imageId = imgResult.lastInsertRowid;

    // Insert AI Analysis
    insertAI.run(
      complaintId, imageId, item.issue, 94.5, item.sev, item.dept,
      item.desc, item.action, 'AI-Assisted Vision Module'
    );

    // Insert Priority Score
    const sevScore = item.sev === 'CRITICAL' ? 95 : item.sev === 'HIGH' ? 75 : item.sev === 'MEDIUM' ? 50 : 25;
    const safetyScore = item.issue === 'Broken streetlight' || item.sev === 'CRITICAL' ? 90 : 70;
    const publicImpact = 80;
    const assetImportance = 85;
    const locationImportance = 80;
    const previousComplaintScore = item.pCount;
    const assetConditionScore = 80;
    const waitingTimeScore = 60;

    const explanation = `Priority: ${item.level}\nScore: ${Math.round(item.score)}/100\nReasons:\n- ${item.sev} severity issue identified\n- Significant safety and mobility hazard\n- High pedestrian/traffic density in this sector\n- Asset condition indicates urgent attention`;

    insertPriority.run(
      complaintId, item.score, item.level,
      sevScore, safetyScore, publicImpact, assetImportance, locationImportance,
      previousComplaintScore, assetConditionScore, waitingTimeScore, explanation
    );

    // If assigned or in progress, create assignment
    if (item.status === 'ASSIGNED' || item.status === 'IN_PROGRESS' || item.status === 'COMPLETED') {
      const assignStmt = db.prepare(`
        INSERT INTO maintenance_assignments (
          complaint_id, assigned_to_user_id, assigned_by_user_id, team_name, scheduled_date, status, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      assignStmt.run(
        complaintId, 2, 1, 'Metro Quick-Response Team Alpha',
        item.date.split(' ')[0], item.status, 'High priority dispatch. Inspect base integrity before resurfacing.'
      );
    }

    // If completed, create maintenance history
    if (item.status === 'COMPLETED') {
      const historyStmt = db.prepare(`
        INSERT INTO maintenance_history (
          asset_id, complaint_id, action_taken, performed_by, before_condition, after_condition, cost_estimate, completion_notes, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      historyStmt.run(
        item.assetId, complaintId, item.action, 'Er. Anita Desai (Team Alpha)',
        'Damaged', 'Restored', 18500, 'Work inspected and certified by municipal auditor.', item.date
      );
    }
  });

  // 6. Seed Hotspots
  const insertHotspot = db.prepare(`
    INSERT INTO hotspots (
      area_name, latitude, longitude, radius_meters, complaint_count, dominant_issue, trend, risk_level,
      explanation, recommended_action, preventive_warning, warning_confidence, warning_acknowledged
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertHotspot.run(
    'Old Town Drainage & Water Corridor (Ward 8)',
    12.9634, 77.5750, 300, 7, 'Water leakage', 'Increasing', 'CRITICAL',
    'Repeated infrastructure failures detected. High recurring frequency of subsurface drainage leakages and stormwater overflow over 5 consecutive months.',
    'Schedule comprehensive subsurface civil inspection and culvert reconstruction before monsoon peak.',
    'Repeated drainage-related complaints have been recorded in this area during previous periods. Consider scheduling a preventive inspection.',
    91.5, 0
  );

  insertHotspot.run(
    'Central Flyover Arterial Corridor (Ward 12)',
    12.9719, 77.5937, 250, 4, 'Pothole', 'Stable', 'HIGH',
    'High traffic volume combined with asphalt wear has caused recurring potholes and sidewalk curb displacement.',
    'Deploy specialized cold-mix patching and re-level pedestrian crossing curbs.',
    'Frequent heavy transit load is accelerating joint degradation. Recommend ultrasonic deck assessment.',
    84.0, 0
  );

  insertHotspot.run(
    'Industrial Bypass Arterial Road (Ward 22)',
    12.9180, 77.5620, 350, 3, 'Road crack', 'Increasing', 'HIGH',
    'Industrial freight transit corridor experiencing sub-grade fatigue and alligator cracking.',
    'Plan full-depth pavement reclamation and load-bearing reinforcement.',
    'Sub-base displacement detected under heavy axle transit. Preventive milling recommended.',
    78.2, 0
  );

  console.log('Database seeded successfully with realistic municipality infrastructure records!');
}

module.exports = {
  seedDatabase
};
