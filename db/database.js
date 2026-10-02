const path = require('path');
const fs = require('fs');

// Ensure database directory exists and is writable
const DB_DIR = path.resolve(__dirname);
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}
const DB_PATH = path.join(DB_DIR, 'infrastructure.db');

let DatabaseSync;
try {
  DatabaseSync = require('node:sqlite').DatabaseSync;
} catch (err) {
  console.error(`[CRITICAL] node:sqlite could not be loaded on Node.js ${process.version}.`);
  console.error('Ensure Node.js >= 22.13.0 or launch with the --experimental-sqlite flag.');
  throw err;
}

const db = new DatabaseSync(DB_PATH);

// Enable foreign keys
db.exec('PRAGMA foreign_keys = ON;');
try { db.exec('PRAGMA journal_mode = WAL;'); } catch (e) {}

// Initialize schema
function initSchema() {
  db.exec(`
    -- Users Table
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      role TEXT NOT NULL CHECK(role IN ('citizen', 'maintenance_staff', 'admin')),
      password_hash TEXT,
      phone TEXT,
      department TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Locations Table
    CREATE TABLE IF NOT EXISTS locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      ward_district TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      importance_level INTEGER DEFAULT 3 CHECK(importance_level BETWEEN 1 AND 5),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Assets Table
    CREATE TABLE IF NOT EXISTS assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_tag TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      asset_type TEXT NOT NULL,
      location_id INTEGER REFERENCES locations(id),
      condition TEXT DEFAULT 'Good' CHECK(condition IN ('Good', 'Fair', 'Poor', 'Critical')),
      importance_score INTEGER DEFAULT 3 CHECK(importance_score BETWEEN 1 AND 5),
      public_impact_factor INTEGER DEFAULT 3 CHECK(public_impact_factor BETWEEN 1 AND 5),
      installation_date TEXT,
      last_inspection_date TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Complaints Table
    CREATE TABLE IF NOT EXISTS complaints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      complaint_number TEXT UNIQUE NOT NULL,
      user_id INTEGER REFERENCES users(id),
      asset_id INTEGER REFERENCES assets(id),
      location_id INTEGER REFERENCES locations(id),
      issue_type TEXT NOT NULL,
      severity TEXT NOT NULL CHECK(severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
      department TEXT NOT NULL,
      description TEXT,
      recommended_action TEXT,
      status TEXT DEFAULT 'REPORTED' CHECK(status IN ('REPORTED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED')),
      is_ai_assisted INTEGER DEFAULT 1,
      citizen_name TEXT,
      citizen_phone TEXT,
      citizen_email TEXT,
      merged_into_id INTEGER REFERENCES complaints(id),
      reported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Images Table
    CREATE TABLE IF NOT EXISTS images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      complaint_id INTEGER REFERENCES complaints(id),
      asset_id INTEGER REFERENCES assets(id),
      image_type TEXT NOT NULL CHECK(image_type IN ('INITIAL_REPORT', 'PROGRESS_CHECK', 'COMPLETION')),
      file_path TEXT NOT NULL,
      original_filename TEXT,
      file_size INTEGER,
      mime_type TEXT,
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- AI Analysis Table
    CREATE TABLE IF NOT EXISTS ai_analysis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      complaint_id INTEGER REFERENCES complaints(id),
      image_id INTEGER REFERENCES images(id),
      issue_type TEXT NOT NULL,
      confidence REAL NOT NULL,
      severity TEXT NOT NULL,
      department TEXT NOT NULL,
      description TEXT,
      recommended_action TEXT,
      provider TEXT NOT NULL,
      raw_response TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Priority Scores Table
    CREATE TABLE IF NOT EXISTS priority_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      complaint_id INTEGER UNIQUE REFERENCES complaints(id) ON DELETE CASCADE,
      priority_score REAL NOT NULL,
      priority_level TEXT NOT NULL CHECK(priority_level IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
      severity_score REAL NOT NULL,
      safety_risk_score REAL NOT NULL,
      public_impact_score REAL NOT NULL,
      asset_importance_score REAL NOT NULL,
      location_importance_score REAL NOT NULL,
      previous_complaint_score REAL NOT NULL,
      asset_condition_score REAL NOT NULL,
      waiting_time_score REAL NOT NULL,
      explanation TEXT NOT NULL,
      is_overridden INTEGER DEFAULT 0,
      overridden_by_user_id INTEGER REFERENCES users(id),
      override_reason TEXT,
      calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Maintenance Assignments Table
    CREATE TABLE IF NOT EXISTS maintenance_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      complaint_id INTEGER UNIQUE REFERENCES complaints(id) ON DELETE CASCADE,
      assigned_to_user_id INTEGER REFERENCES users(id),
      assigned_by_user_id INTEGER REFERENCES users(id),
      team_name TEXT NOT NULL,
      scheduled_date TEXT,
      status TEXT DEFAULT 'ASSIGNED' CHECK(status IN ('ASSIGNED', 'IN_PROGRESS', 'COMPLETED')),
      notes TEXT,
      assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME
    );

    -- Maintenance History Table
    CREATE TABLE IF NOT EXISTS maintenance_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id INTEGER REFERENCES assets(id),
      complaint_id INTEGER REFERENCES complaints(id),
      action_taken TEXT NOT NULL,
      performed_by TEXT NOT NULL,
      before_condition TEXT,
      after_condition TEXT,
      cost_estimate REAL,
      completion_image_id INTEGER REFERENCES images(id),
      completion_notes TEXT,
      completed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Hotspots Table
    CREATE TABLE IF NOT EXISTS hotspots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      area_name TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      radius_meters REAL DEFAULT 200,
      complaint_count INTEGER DEFAULT 0,
      dominant_issue TEXT,
      trend TEXT DEFAULT 'Stable' CHECK(trend IN ('Increasing', 'Decreasing', 'Stable', 'Insufficient data')),
      risk_level TEXT DEFAULT 'MEDIUM' CHECK(risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
      explanation TEXT,
      recommended_action TEXT,
      preventive_warning TEXT,
      warning_confidence REAL,
      warning_acknowledged INTEGER DEFAULT 0,
      last_analyzed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- System Settings Table
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      description TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Indexes for high-performance querying
    CREATE INDEX IF NOT EXISTS idx_locations_coords ON locations(latitude, longitude);
    CREATE INDEX IF NOT EXISTS idx_locations_ward ON locations(ward_district);
    CREATE INDEX IF NOT EXISTS idx_assets_location_id ON assets(location_id);
    CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(asset_type);
    CREATE INDEX IF NOT EXISTS idx_complaints_user_id ON complaints(user_id);
    CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);
    CREATE INDEX IF NOT EXISTS idx_complaints_asset_id ON complaints(asset_id);
    CREATE INDEX IF NOT EXISTS idx_complaints_reported_at ON complaints(reported_at);
    CREATE INDEX IF NOT EXISTS idx_complaints_location_id ON complaints(location_id);
    CREATE INDEX IF NOT EXISTS idx_images_complaint_id ON images(complaint_id);
    CREATE INDEX IF NOT EXISTS idx_images_asset_id ON images(asset_id);
    CREATE INDEX IF NOT EXISTS idx_ai_analysis_complaint_id ON ai_analysis(complaint_id);
    CREATE INDEX IF NOT EXISTS idx_priority_complaint_id ON priority_scores(complaint_id);
    CREATE INDEX IF NOT EXISTS idx_priority_level ON priority_scores(priority_level);
    CREATE INDEX IF NOT EXISTS idx_maintenance_complaint_id ON maintenance_assignments(complaint_id);
    CREATE INDEX IF NOT EXISTS idx_history_asset_id ON maintenance_history(asset_id);
    CREATE INDEX IF NOT EXISTS idx_history_complaint_id ON maintenance_history(complaint_id);
    CREATE INDEX IF NOT EXISTS idx_hotspots_coords ON hotspots(latitude, longitude);
  `);
}

// Initialize tables & safe migrations
try {
  db.exec('ALTER TABLE users ADD COLUMN password_hash TEXT;');
} catch (e) {}
try {
  db.exec('ALTER TABLE complaints ADD COLUMN govt_reference_id TEXT;');
} catch (e) {}
initSchema();

module.exports = {
  db,
  initSchema
};
