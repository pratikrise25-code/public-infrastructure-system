try { process.loadEnvFile(); } catch (e) {}
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { db } = require('./db/database');
const { seedDatabase } = require('./db/seed-data');
const { analyzeInfrastructureImage, ALLOWED_MIME_TYPES, MAX_FILE_SIZE } = require('./services/ai-vision-service');
const { compareDamageProgress } = require('./services/damage-progress-service');
const {
  calculatePriority,
  evaluateAndStorePriority,
  getPriorityWeights,
  updatePriorityWeights
} = require('./services/priority-engine-service');
const { detectDuplicateComplaint, mergeComplaints } = require('./services/duplicate-detection-service');
const {
  getMapComplaints,
  analyzeHotspots,
  getHistoricalTrendData,
  getPreventiveRecommendations,
  toggleRecommendationAcknowledgment
} = require('./services/hotspot-analysis-service');

const app = express();

function hashPassword(pwd) {
  return crypto.createHash('sha256').update((pwd || '').trim()).digest('hex');
}
const OFFICER_EMAIL = 'pratikr.ise25@cmrit.ac.in';
const OFFICER_PASSWORD_HASH = hashPassword(process.env.OFFICER_PASSWORD || 'NagarDristi@2026');

// Role-Based Access Control (RBAC) Middleware
function requireMunicipalOfficer(req, res, next) {
  const role = req.headers['x-user-role'];
  const userId = Number(req.headers['x-user-id'] || 0);

  if (role === 'admin' && userId === 1) {
    const user = db.prepare('SELECT role FROM users WHERE id = 1').get();
    if (user && user.role === 'admin') {
      return next();
    }
  }

  return res.status(403).json({
    error: 'Access Denied — Municipal Officer access required.',
    code: 'FORBIDDEN_OFFICER_ONLY'
  });
}

const PORT = process.env.PORT || 3000;

// Ensure upload directory exists
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, 'infra-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Only JPG, JPEG, and PNG are allowed.`));
    }
  }
});

// Middleware
// Production CORS Middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-user-id, x-user-role');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Seed Data
seedDatabase();


// Security: Block citizens from manually accessing /admin or /municipal-dashboard
app.get(['/admin', '/municipal-dashboard'], (req, res) => {
  const role = req.headers['x-user-role'];
  const userId = Number(req.headers['x-user-id'] || 0);

  if (role === 'admin' && userId === 1) {
    return res.redirect('/?tab=admin-tab');
  }

  return res.status(403).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Access Denied - 403 Forbidden</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc; color: #0f2942; }
    .card { background: white; padding: 2.5rem; border-radius: 6px; border: 1px solid #cbd5e1; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.08); max-width: 480px; text-align: center; }
    h1 { color: #dc2626; font-size: 1.6rem; margin-top: 0; }
    p { color: #334155; line-height: 1.6; margin-bottom: 1.5rem; font-size: 1rem; }
    .btn { display: inline-block; background: #0f2942; color: white; padding: 0.65rem 1.3rem; text-decoration: none; border-radius: 4px; font-weight: 600; }
    .btn:hover { background: #1e3a8a; }
  </style>
</head>
<body>
  <div class="card">
    <h1>403 Forbidden</h1>
    <p><strong>Access Denied — Municipal Officer access required.</strong></p>
    <p>This administrative portal is restricted to authorized municipal personnel only. Citizens do not have permission to view municipal dashboards.</p>
    <a class="btn" href="/">Return to Citizen Home</a>
  </div>
</body>
</html>`);
});

// ==========================================
// 0. AUTHENTICATION & USER PROFILE APIS
// ==========================================

/**
 * GET /api/auth/me
 * Retrieves current active user and their personal complaint count
 */

/**
 * GET /api/health
 * Public health check endpoint for 24/7 uptime monitoring & keep-alive
 */
app.get('/api/health', (req, res) => {
  return res.json({
    status: 'ok',
    service: 'NagarDristi AI',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    database: 'connected'
  });
});

app.get('/api/auth/me', (req, res) => {
  try {
    const userId = Number(req.query.userId || req.headers['x-user-id'] || 4);
    const user = db.prepare('SELECT id, name, email, role, phone, department FROM users WHERE id = ?').get(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const complaintCount = db.prepare('SELECT COUNT(*) as c FROM complaints WHERE user_id = ?').get(user.id).c;

    return res.json({
      success: true,
      user: {
        ...user,
        complaintCount
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch user profile', details: err.message });
  }
});

/**
 * GET /api/auth/users
 * Returns list of demo profiles for easy instant role/citizen switching
 */
app.get('/api/auth/users', (req, res) => {
  try {
    const users = db.prepare(`
      SELECT u.id, u.name, u.email, u.role, u.department,
             (SELECT COUNT(*) FROM complaints WHERE user_id = u.id) as complaint_count
      FROM users u
      ORDER BY u.id ASC
    `).all();

    return res.json({ success: true, data: users });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch users', details: err.message });
  }
});

/**
 * POST /api/auth/register
 * Citizen registration: starts with complaint count 0!
 */
app.post(['/api/auth/register', '/api/auth/register-citizen'], (req, res) => {
  try {
    const { name, email, phone, role } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required to register.' });
    }

    const cleanEmail = (email && email.trim() !== '') 
      ? email.trim().toLowerCase() 
      : `citizen.${Date.now()}@metroinfra.local`;

    // Security: Reject registration for officer email or officer role
    if (cleanEmail === OFFICER_EMAIL || role === 'admin' || role === 'officer') {
      return res.status(403).json({ error: 'Municipal Officer accounts cannot be created via public registration.' });
    }

    // Check existing
    const existing = db.prepare('SELECT id, name, email, role, phone, department FROM users WHERE email = ?').get(cleanEmail);
    if (existing) {
      if (existing.role === 'admin') {
        return res.status(403).json({ error: 'Municipal Officer accounts cannot be accessed via public registration.' });
      }
      const complaintCount = db.prepare('SELECT COUNT(*) as c FROM complaints WHERE user_id = ?').get(existing.id).c;
      return res.json({
        success: true,
        message: 'Account already exists. Logged in successfully.',
        user: { ...existing, complaintCount }
      });
    }

    const insertStmt = db.prepare(`
      INSERT INTO users (name, email, role, phone, department)
      VALUES (?, ?, 'citizen', ?, 'Public Citizen')
    `);

    const result = insertStmt.run(name.trim(), cleanEmail, phone ? phone.trim() : '');
    const newUserId = result.lastInsertRowid;

    const newUser = db.prepare('SELECT id, name, email, role, phone, department FROM users WHERE id = ?').get(newUserId);

    return res.status(201).json({
      success: true,
      message: 'Citizen registered successfully! Your complaint counter starts at 0.',
      user: {
        ...newUser,
        complaintCount: 0
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to register citizen', details: err.message });
  }
});

app.post(['/api/auth/login', '/api/auth/login-officer', '/api/auth/login-coordinator'], (req, res) => {
  try {
    const { userId, email, password } = req.body;
    let user;

    if (userId) {
      user = db.prepare('SELECT id, name, email, role, phone, department, password_hash FROM users WHERE id = ?').get(Number(userId));
    } else if (email) {
      user = db.prepare('SELECT id, name, email, role, phone, department, password_hash FROM users WHERE email = ?').get(email.trim().toLowerCase());
    }

    if (!user) {
      return res.status(404).json({ error: 'User account not found' });
    }

    // Security: If logging in as Municipal Officer (admin) or User 1
    if (user.role === 'admin' || user.id === 1 || (email && email.trim().toLowerCase() === OFFICER_EMAIL)) {
      if (!password) {
        return res.status(401).json({ error: 'Password is required for Municipal Officer access.' });
      }

      const inputHash = hashPassword(password);
      const isMatch = (user.password_hash && inputHash === user.password_hash) || (inputHash === OFFICER_PASSWORD_HASH);
      if (!isMatch) {
        return res.status(401).json({ error: 'Invalid Municipal Officer credentials. Please check your email and password.' });
      }
    }

    const complaintCount = db.prepare('SELECT COUNT(*) as c FROM complaints WHERE user_id = ?').get(user.id).c;
    const safeUser = { ...user };
    delete safeUser.password_hash;

    return res.json({
      success: true,
      user: { ...safeUser, complaintCount }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Login failed', details: err.message });
  }
});

// ==========================================
// 1. AI IMAGE-BASED ISSUE DETECTION API
// ==========================================

/**
 * POST /api/ai/analyze-image
 * Secure image analysis endpoint validating type and size
 * Returns simple, plain words for citizen understanding
 */
app.post('/api/ai/analyze-issue', async (req, res) => {
  try {
    const { samplePath } = req.body;
    const cleanSample = (samplePath || '').replace(/^\//, '');
    const fullPath = path.join(__dirname, 'public', cleanSample);
    const aiResult = await analyzeInfrastructureImage(fullPath, path.basename(cleanSample) || 'sample.jpg', 'image/jpeg');
    return res.json({
      success: true,
      issueType: aiResult.issueType,
      severity: aiResult.severity,
      confidence: aiResult.confidence,
      department: aiResult.department,
      suggestedAction: aiResult.suggestedAction,
      ...aiResult
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/ai/analyze-image', upload.single('image'), async (req, res) => {
  try {
    let filePath;
    let originalName;
    let mimeType;
    let fileSize;

    if (req.file) {
      filePath = req.file.path;
      originalName = req.file.originalname;
      mimeType = req.file.mimetype;
      fileSize = req.file.size;
    } else if (req.body.samplePath) {
      const cleanPath = req.body.samplePath.replace(/^\/+/, '');
      filePath = path.join(__dirname, 'public', cleanPath);
      originalName = path.basename(filePath);
      mimeType = 'image/jpeg';
      fileSize = fs.existsSync(filePath) ? fs.statSync(filePath).size : 100000;
    } else {
      return res.status(400).json({ error: 'No image file uploaded. Please upload a JPG, JPEG, or PNG image.' });
    }

    const aiResult = await analyzeInfrastructureImage(filePath, originalName, mimeType, fileSize);
    const relativeUrl = req.file ? `/uploads/${req.file.filename}` : `/${req.body.samplePath.replace(/^\/+/, '')}`;

    return res.json({
      success: true,
      data: {
        ...aiResult,
        imageUrl: relativeUrl,
        originalFilename: originalName
      }
    });
  } catch (err) {
    console.error('Image analysis error:', err);
    return res.status(500).json({
      error: 'Failed to analyze infrastructure image.',
      details: err.message
    });
  }
});

/**
 * POST /api/ai/compare-damage
 * Compare completion/inspection image with previous historical asset image
 */

// ==========================================
// 1.5 GEOLOCATION & REVERSE GEOCODING APIS
// ==========================================

/**
 * GET /api/geolocation/reverse
 * Secure server-side reverse geocoding via OpenStreetMap Nominatim with local DB fallback
 */
app.get('/api/geolocation/reverse', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ error: 'Valid lat and lng query parameters are required' });
    }

    const https = require('https');
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`;

    const nomPromise = new Promise((resolve, reject) => {
      const request = https.get(url, {
        headers: { 'User-Agent': 'NagarDristiAI/1.0 (contact@nagardristi.gov)' },
        timeout: 4000
      }, (resp) => {
        let body = '';
        resp.on('data', chunk => body += chunk);
        resp.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      });
      request.on('error', reject);
      request.on('timeout', () => {
        request.destroy();
        reject(new Error('Nominatim timeout'));
      });
    });

    try {
      const nomData = await nomPromise;
      if (nomData && nomData.display_name) {
        const road = nomData.address?.road || nomData.address?.suburb || nomData.address?.neighbourhood || nomData.address?.commercial;
        const city = nomData.address?.city_district || nomData.address?.city || nomData.address?.town || nomData.address?.county;
        const short = [road, city].filter(Boolean).join(', ') || nomData.display_name.split(',').slice(0, 2).join(', ');

        return res.json({
          success: true,
          address: nomData.display_name,
          shortAddress: short,
          latitude: lat,
          longitude: lng,
          source: 'OpenStreetMap Satellite Geocoding'
        });
      }
    } catch (nomErr) {
      console.warn('Nominatim reverse lookup notice:', nomErr.message);
    }

    // Fallback: Closest known location in SQLite locations table
    const closest = db.prepare(`
      SELECT name, address, ward_district, latitude, longitude,
             ((latitude - ?) * (latitude - ?) + (longitude - ?) * (longitude - ?)) as dist_sq
      FROM locations
      ORDER BY dist_sq ASC
      LIMIT 1
    `).get(lat, lng);

    if (closest) {
      return res.json({
        success: true,
        address: `${closest.address}, ${closest.ward_district}`,
        shortAddress: closest.name,
        latitude: lat,
        longitude: lng,
        source: 'Municipal Ward Registry'
      });
    }

    return res.json({
      success: true,
      address: `Coordinates: ${lat.toFixed(5)}° N, ${lng.toFixed(5)}° E`,
      shortAddress: `GPS Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
      latitude: lat,
      longitude: lng,
      source: 'Direct GPS Sensor'
    });
  } catch (err) {
    return res.status(500).json({ error: 'Reverse geocode failed', details: err.message });
  }
});

/**
 * GET /api/geolocation/detect
 * Fast IP-based geolocation fallback
 */
app.get('/api/geolocation/detect', (req, res) => {
  return res.json({
    success: true,
    latitude: 12.9716,
    longitude: 77.5946,
    city: 'Bengaluru',
    address: 'MG Road Central Corridor, Bengaluru, Karnataka',
    shortAddress: 'MG Road Central Corridor',
    source: 'Civic Center Network'
  });
});

app.post('/api/ai/compare-damage', upload.single('image'), async (req, res) => {
  try {
    const assetId = req.body.assetId;
    if (!assetId) {
      return res.status(400).json({ error: 'Asset ID is required to compare historical damage progress.' });
    }

    let filePath;
    let originalName;

    if (req.file) {
      filePath = req.file.path;
      originalName = req.file.originalname;
    } else if (req.body.imagePath) {
      filePath = path.join(__dirname, req.body.imagePath.startsWith('/uploads') ? '.' : 'public', req.body.imagePath);
      originalName = path.basename(filePath);
    } else {
      return res.status(400).json({ error: 'Current inspection image is required.' });
    }

    const progressResult = await compareDamageProgress(assetId, filePath, originalName);
    return res.json({ success: true, data: progressResult });
  } catch (err) {
    console.error('Damage comparison error:', err);
    return res.status(500).json({ error: 'Damage progress comparison failed.', details: err.message });
  }
});

// ==========================================
// 2. COMPLAINT & WORKFLOW MANAGEMENT API
// ==========================================

/**
 * GET /api/complaints
 * Returns complaints. When userId is provided (or user is citizen),
 * ONLY returns that citizen's own complaints.
 */
app.get('/api/complaints', (req, res) => {
  try {
    const { status, issueType, limit = 100, userId, userOnly } = req.query;
    const callerRole = req.headers['x-user-role'];
    const callerUserId = req.headers['x-user-id'] || userId;

    let query = `
      SELECT c.*, a.name as asset_name, a.asset_tag, l.name as location_name, l.ward_district,
             p.priority_score, p.priority_level, p.explanation as priority_explanation, p.is_overridden,
             img.file_path as image_url, ma.team_name, ma.scheduled_date
      FROM complaints c
      LEFT JOIN assets a ON c.asset_id = a.id
      LEFT JOIN locations l ON c.location_id = l.id
      LEFT JOIN priority_scores p ON c.id = p.complaint_id
      LEFT JOIN maintenance_assignments ma ON c.id = ma.complaint_id
      LEFT JOIN (SELECT complaint_id, file_path FROM images GROUP BY complaint_id) img ON c.id = img.complaint_id
      WHERE 1=1
    `;
    const params = [];

    // Citizen Isolation: Citizens can ONLY see their own complaints
    if (callerRole !== 'admin') {
      const citizenId = Number(callerUserId || 4);
      query += ' AND c.user_id = ?';
      params.push(citizenId);
    } else if (callerUserId && callerUserId !== 'all' && (userOnly === 'true' || req.query.filterUser)) {
      query += ' AND c.user_id = ?';
      params.push(Number(callerUserId));
    }

    if (status && status !== 'ALL') {
      query += ' AND c.status = ?';
      params.push(status);
    }

    if (issueType && issueType !== 'ALL') {
      query += ' AND c.issue_type = ?';
      params.push(issueType);
    }

    query += ' ORDER BY c.reported_at DESC LIMIT ?';
    params.push(Number(limit));

    const complaints = db.prepare(query).all(...params);
    return res.json({ success: true, data: complaints });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch complaints', details: err.message });
  }
});

app.get('/api/complaints/:id', (req, res) => {
  try {
    const callerRole = req.headers['x-user-role'];
    const callerUserId = Number(req.headers['x-user-id'] || 0);

    const complaint = db.prepare(`
      SELECT c.*, a.name as asset_name, a.asset_tag, a.condition as asset_condition,
             l.name as location_name, l.address, l.latitude, l.longitude, l.ward_district,
             p.priority_score, p.priority_level, p.explanation as priority_explanation,
             p.severity_score, p.safety_risk_score, p.public_impact_score, p.asset_importance_score,
             p.location_importance_score, p.previous_complaint_score, p.asset_condition_score,
             p.waiting_time_score, p.is_overridden, p.override_reason,
             ma.team_name, ma.scheduled_date, ma.notes as assignment_notes,
             ai.confidence as ai_confidence, ai.provider as ai_provider
      FROM complaints c
      LEFT JOIN assets a ON c.asset_id = a.id
      LEFT JOIN locations l ON c.location_id = l.id
      LEFT JOIN priority_scores p ON c.id = p.complaint_id
      LEFT JOIN maintenance_assignments ma ON c.id = ma.complaint_id
      LEFT JOIN ai_analysis ai ON c.id = ai.complaint_id
      WHERE c.id = ? OR c.complaint_number = ?
    `).get(req.params.id, req.params.id);

    if (!complaint) {
      return res.status(404).json({ error: 'Complaint not found' });
    }

    // Security: Citizens can only access their own complaints
    if (callerRole !== 'admin' && callerUserId && complaint.user_id !== callerUserId) {
      return res.status(403).json({ error: 'Access Denied — You are not authorized to view this complaint.' });
    }

    // Get images
    const images = db.prepare('SELECT * FROM images WHERE complaint_id = ?').all(complaint.id);
    complaint.images = images;

    // Get maintenance history
    const history = db.prepare('SELECT * FROM maintenance_history WHERE complaint_id = ?').all(complaint.id);
    complaint.history = history;

    return res.json({ success: true, data: complaint });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch complaint details', details: err.message });
  }
});

app.post('/api/complaints/check-duplicate', (req, res) => {
  try {
    const { latitude, longitude, locationId, assetId, issueType } = req.body;
    const result = detectDuplicateComplaint({ latitude, longitude, locationId, assetId, issueType });
    return res.json({ success: true, data: result });
  } catch (err) {
    return res.status(500).json({ error: 'Duplicate detection check failed', details: err.message });
  }
});

/**
 * POST /api/complaints
 * Citizen submits complaint - stored under the logged-in user's ID
 */
app.post('/api/complaints', (req, res) => {
  try {
    const {
      userId,
      assetId,
      locationId,
      latitude,
      longitude,
      address,
      issueType,
      severity,
      department,
      description,
      recommendedAction,
      citizenName,
      citizenPhone,
      citizenEmail,
      imageUrl,
      aiConfidence,
      aiProvider,
      isAiAssisted
    } = req.body;

    if (!issueType || !severity) {
      return res.status(400).json({ error: 'Issue type and severity are required.' });
    }

    // Determine target user ID
    const targetUserId = Number(userId || req.headers['x-user-id'] || 4);
    const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(targetUserId);

    const finalCitizenName = citizenName || (userRow ? userRow.name : 'Public Citizen');
    const finalCitizenPhone = citizenPhone || (userRow ? userRow.phone : '');
    const finalCitizenEmail = citizenEmail || (userRow ? userRow.email : '');
    const finalDept = department || 'Roads & Bridges';
    const cleanSeverity = String(severity || 'MEDIUM').toUpperCase();

    // Handle real GPS coordinates dynamically
    let finalLocationId = locationId && !isNaN(Number(locationId)) ? Number(locationId) : 1;
    if (latitude !== undefined && longitude !== undefined && !isNaN(Number(latitude)) && !isNaN(Number(longitude))) {
      const lat = Number(latitude);
      const lng = Number(longitude);
      const existingLoc = db.prepare(`
        SELECT id FROM locations 
        WHERE abs(latitude - ?) < 0.001 AND abs(longitude - ?) < 0.001
        LIMIT 1
      `).get(lat, lng);

      if (existingLoc) {
        finalLocationId = existingLoc.id;
      } else {
        const locName = address ? address.split(',')[0].trim() : `Citizen GPS Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
        const locAddr = address || `GPS Coordinates: ${lat}, ${lng}`;
        const locWard = (address && (address.includes('Bengaluru') || address.includes('Karnataka'))) ? 'Metro Urban Sector' : 'Citizen Geo-Located Sector';
        const ins = db.prepare(`
          INSERT INTO locations (name, address, ward_district, latitude, longitude, importance_level)
          VALUES (?, ?, ?, ?, ?, 3)
        `).run(locName, locAddr, locWard, lat, lng);
        finalLocationId = ins.lastInsertRowid;
      }
    }

    // Generate unique sequential complaint number
    const countRow = db.prepare('SELECT COUNT(*) as count FROM complaints').get();
    const complaintNumber = `CMP-${new Date().getFullYear()}-${String(countRow.count + 1).padStart(4, '0')}`;

    // Insert complaint
    const insertComplaintStmt = db.prepare(`
      INSERT INTO complaints (
        complaint_number, user_id, asset_id, location_id, issue_type, severity, department,
        description, recommended_action, status, is_ai_assisted, citizen_name, citizen_phone, citizen_email,
        reported_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'REPORTED', ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    const result = insertComplaintStmt.run(
      complaintNumber,
      targetUserId,
      assetId ? Number(assetId) : null,
      finalLocationId,
      issueType,
      cleanSeverity,
      finalDept,
      description || 'Citizen reported public infrastructure issue.',
      recommendedAction || 'Schedule physical maintenance inspection.',
      isAiAssisted !== undefined ? (isAiAssisted ? 1 : 0) : 1,
      finalCitizenName,
      finalCitizenPhone,
      finalCitizenEmail
    );

    const complaintId = result.lastInsertRowid;

    // Save image record
    let imageId = null;
    if (imageUrl) {
      const insertImgStmt = db.prepare(`
        INSERT INTO images (complaint_id, asset_id, image_type, file_path, original_filename, file_size, mime_type)
        VALUES (?, ?, 'INITIAL_REPORT', ?, ?, ?, ?)
      `);
      const imgRes = insertImgStmt.run(
        complaintId,
        assetId ? Number(assetId) : null,
        imageUrl,
        path.basename(imageUrl),
        250000,
        'image/jpeg'
      );
      imageId = imgRes.lastInsertRowid;
    }

    // Save AI Analysis Record
    if (isAiAssisted) {
      db.prepare(`
        INSERT INTO ai_analysis (
          complaint_id, image_id, issue_type, confidence, severity, department,
          description, recommended_action, provider
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        complaintId,
        imageId,
        issueType,
        Number(aiConfidence) || 90.0,
        cleanSeverity,
        finalDept,
        description || '',
        recommendedAction || '',
        aiProvider || 'AI-Assisted Vision Module'
      );
    }

    // Trigger AI Priority Engine to calculate priority score
    const priorityResult = evaluateAndStorePriority(complaintId);

    // Duplicate check
    const duplicateCheck = detectDuplicateComplaint({
      locationId,
      assetId,
      issueType,
      excludeComplaintId: complaintId
    });

    // Get updated complaint count for user
    const userCount = db.prepare('SELECT COUNT(*) as c FROM complaints WHERE user_id = ?').get(targetUserId).c;

    const priorityObj = {
      ...priorityResult,
      isAiAssisted: true,
      aiAssistedLabel: 'AI-Assisted'
    };

    return res.status(201).json({
      success: true,
      message: 'Complaint submitted successfully.',
      complaintId,
      complaintNumber,
      userComplaintCount: userCount,
      priority: priorityObj,
      data: {
        id: complaintId,
        complaintNumber,
        priority: priorityResult.priorityLevel || 'HIGH',
        priorityDetails: priorityObj
      },
      duplicateWarning: duplicateCheck.isDuplicate ? duplicateCheck.topCandidate : null
    });
  } catch (err) {
    console.error('Error submitting complaint:', err);
    return res.status(500).json({ error: 'Failed to submit complaint', details: err.message });
  }
});

/**
 * POST /api/complaints/:id/assign
 * Administrator assigns maintenance team and changes status to ASSIGNED
 */
app.post('/api/complaints/:id/assign', requireMunicipalOfficer, (req, res) => {
  try {
    const { teamName, scheduledDate, notes } = req.body;
    const complaintId = req.params.id;

    if (!teamName) {
      return res.status(400).json({ error: 'Team name is required for assignment.' });
    }

    db.prepare(`
      INSERT INTO maintenance_assignments (
        complaint_id, assigned_to_user_id, assigned_by_user_id, team_name, scheduled_date, status, notes
      ) VALUES (?, 2, 1, ?, ?, 'ASSIGNED', ?)
      ON CONFLICT(complaint_id) DO UPDATE SET
        team_name = excluded.team_name,
        scheduled_date = excluded.scheduled_date,
        notes = excluded.notes,
        status = 'ASSIGNED'
    `).run(complaintId, teamName, scheduledDate || new Date().toISOString().split('T')[0], notes || '');

    db.prepare(`
      UPDATE complaints 
      SET status = 'ASSIGNED', updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(complaintId);

    return res.json({ success: true, message: `Complaint assigned to ${teamName}`, data: { status: 'ASSIGNED', teamName } });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to assign complaint', details: err.message });
  }
});

/**
 * POST /api/complaints/:id/status
 * Update workflow status (REPORTED -> ASSIGNED -> IN_PROGRESS -> COMPLETED)
 */
app.post('/api/complaints/:id/status', (req, res) => handleStatusUpdate(req, res));
app.patch('/api/complaints/:id/status', (req, res) => handleStatusUpdate(req, res));

const handleStatusUpdate = (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['REPORTED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED'];
    if (!valid.includes(status)) {
      return res.status(400).json({ error: `Invalid status: ${status}. Must be one of ${valid.join(', ')}` });
    }

    db.prepare(`
      UPDATE complaints 
      SET status = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(status, req.params.id);

    db.prepare(`
      UPDATE maintenance_assignments
      SET status = ?
      WHERE complaint_id = ?
    `).run(status === 'REPORTED' ? 'ASSIGNED' : status, req.params.id);

    return res.json({ success: true, status, data: { status } });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update status', details: err.message });
  }
};

/**
 * POST /api/complaints/:id/complete
 * Mark completed, upload completion photo, run AI before/after comparison & update maintenance history
 */
app.post('/api/complaints/:id/complete', upload.single('completionImage'), requireMunicipalOfficer, async (req, res) => {
  try {
    const complaintId = req.params.id;
    const { actionTaken, performedBy, notes, costEstimate } = req.body;

    const complaint = db.prepare('SELECT * FROM complaints WHERE id = ?').get(complaintId);
    if (!complaint) {
      return res.status(404).json({ error: 'Complaint not found' });
    }

    let completionImageId = null;
    let comparisonResult = null;

    if (req.file) {
      const imgRes = db.prepare(`
        INSERT INTO images (complaint_id, asset_id, image_type, file_path, original_filename, file_size, mime_type)
        VALUES (?, ?, 'COMPLETION', ?, ?, ?, ?)
      `).run(
        complaintId,
        complaint.asset_id,
        `/uploads/${req.file.filename}`,
        req.file.originalname,
        req.file.size,
        req.file.mimetype
      );
      completionImageId = imgRes.lastInsertRowid;

      // Run AI Before/After Comparison
      if (complaint.asset_id) {
        comparisonResult = await compareDamageProgress(complaint.asset_id, req.file.path, req.file.originalname);
      }
    }

    // Insert maintenance history record
    db.prepare(`
      INSERT INTO maintenance_history (
        asset_id, complaint_id, action_taken, performed_by, before_condition, after_condition,
        cost_estimate, completion_image_id, completion_notes, completed_at
      ) VALUES (?, ?, ?, ?, ?, 'Restored', ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      complaint.asset_id,
      complaintId,
      actionTaken || 'Infrastructure restoration and repair completed.',
      performedBy || 'Municipal Maintenance Division',
      complaint.severity,
      Number(costEstimate) || 12000,
      completionImageId,
      notes || 'Work completed, inspected, and verified against civic quality standards.'
    );

    // Update complaint status
    db.prepare(`
      UPDATE complaints 
      SET status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(complaintId);

    // Update maintenance assignment status
    db.prepare(`
      UPDATE maintenance_assignments 
      SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP 
      WHERE complaint_id = ?
    `).run(complaintId);

    // Update asset condition to Good
    if (complaint.asset_id) {
      db.prepare(`
        UPDATE assets 
        SET condition = 'Good', last_inspection_date = date('now') 
        WHERE id = ?
      `).run(complaint.asset_id);
    }

    return res.json({
      success: true,
      message: 'Complaint marked as COMPLETED and maintenance history recorded.',
      comparisonResult,
      data: { status: 'COMPLETED' }
    });
  } catch (err) {
    console.error('Completion error:', err);
    return res.status(500).json({ error: 'Failed to complete complaint', details: err.message });
  }
});

/**
 * POST /api/complaints/:id/override-priority
 * Administrator manually overrides AI priority
 */
app.post('/api/complaints/:id/override-priority', requireMunicipalOfficer, (req, res) => {
  try {
    const { priorityLevel, priorityScore, reason } = req.body;
    if (!priorityLevel || !reason) {
      return res.status(400).json({ error: 'Priority level and override reason are required.' });
    }

    const updated = evaluateAndStorePriority(req.params.id, {
      priorityLevel,
      priorityScore: priorityScore !== undefined ? Number(priorityScore) : undefined,
      reason,
      userId: 1
    });

    return res.json({ success: true, message: 'Priority overridden successfully.', data: updated });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to override priority', details: err.message });
  }
});

/**
 * POST /api/complaints/merge
 * Administrator manually merges duplicate complaints
 */
app.post('/api/complaints/merge', requireMunicipalOfficer, (req, res) => {
  try {
    const { primaryComplaintId, duplicateComplaintId, notes } = req.body;
    if (!primaryComplaintId || !duplicateComplaintId) {
      return res.status(400).json({ error: 'Both primary and duplicate complaint IDs are required.' });
    }

    const result = mergeComplaints(primaryComplaintId, duplicateComplaintId, 1, notes);
    return res.json({ success: true, data: result });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to merge complaints', details: err.message });
  }
});

// ==========================================
// 3. PRIORITY ENGINE CONFIGURATION API
// ==========================================

app.get('/api/priority/weights', (req, res) => {
  try {
    const weights = getPriorityWeights();
    return res.json({ success: true, data: weights });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load weights', details: err.message });
  }
});

app.put('/api/priority/weights', requireMunicipalOfficer, (req, res) => {
  try {
    const updated = updatePriorityWeights(req.body);
    return res.json({ success: true, message: 'Priority weights updated successfully.', data: updated });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// ==========================================
// 4. HOTSPOT MAP & ANALYTICS API
// ==========================================

/**
 * GET /api/hotspots/map-data
 * Citizens see ONLY their own complaints. Admin sees all.
 */
app.get('/api/hotspots/map-data', (req, res) => {
  try {
    const userId = req.query.userId || req.headers['x-user-id'];
    const isCitizen = req.query.role === 'citizen' || req.headers['x-user-role'] === 'citizen' || (req.query.userOnly === 'true');

    const filters = { ...req.query };
    if (isCitizen && userId) {
      filters.userId = userId;
    }

    const data = getMapComplaints(filters);
    return res.json({ success: true, data, count: data.length });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load map data', details: err.message });
  }
});

app.get('/api/hotspots/analysis', (req, res) => {
  try {
    const hotspots = analyzeHotspots();
    return res.json({ success: true, data: hotspots });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to analyze hotspots', details: err.message });
  }
});

app.get('/api/hotspots/trends', (req, res) => {
  try {
    const { locationId } = req.query;
    const trends = getHistoricalTrendData(locationId ? Number(locationId) : null);
    return res.json({ success: true, data: trends });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load historical trends', details: err.message });
  }
});

app.get('/api/hotspots/preventive-recommendations', (req, res) => {
  try {
    const recs = getPreventiveRecommendations();
    return res.json({ success: true, data: recs });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load preventive recommendations', details: err.message });
  }
});

app.post('/api/hotspots/preventive-recommendations/:id/acknowledge', requireMunicipalOfficer, (req, res) => {
  try {
    const { acknowledged = true } = req.body;
    const result = toggleRecommendationAcknowledgment(req.params.id, acknowledged);
    return res.json({ success: true, data: result });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update recommendation', details: err.message });
  }
});

// ==========================================
// 5. METADATA & ADMIN SUMMARY DASHBOARD API
// ==========================================

app.get('/api/assets', (req, res) => {
  try {
    const assets = db.prepare(`
      SELECT a.*, l.name as location_name, l.ward_district, l.latitude, l.longitude
      FROM assets a
      LEFT JOIN locations l ON a.location_id = l.id
      ORDER BY a.asset_tag ASC
    `).all();
    return res.json({ success: true, data: assets });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch assets', details: err.message });
  }
});

app.get('/api/locations', (req, res) => {
  try {
    const locations = db.prepare('SELECT * FROM locations ORDER BY name ASC').all();
    return res.json({ success: true, data: locations });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch locations', details: err.message });
  }
});

app.get('/api/admin/summary', requireMunicipalOfficer, (req, res) => {
  try {
    const totalAssets = db.prepare('SELECT COUNT(*) as c FROM assets').get().c;
    const totalComplaints = db.prepare('SELECT COUNT(*) as c FROM complaints WHERE merged_into_id IS NULL').get().c;
    const activeComplaints = db.prepare("SELECT COUNT(*) as c FROM complaints WHERE status IN ('REPORTED', 'ASSIGNED', 'IN_PROGRESS')").get().c;
    const criticalComplaints = db.prepare("SELECT COUNT(*) as c FROM complaints WHERE severity = 'CRITICAL' AND status != 'COMPLETED'").get().c;
    const highPriority = db.prepare(`
      SELECT COUNT(DISTINCT c.id) as c 
      FROM complaints c 
      LEFT JOIN priority_scores p ON c.id = p.complaint_id 
      WHERE (c.severity IN ('HIGH', 'CRITICAL') OR p.priority_level IN ('HIGH', 'CRITICAL')) 
        AND c.status != 'COMPLETED'
    `).get().c;
    const aiDetectedComplaints = db.prepare('SELECT COUNT(*) as c FROM complaints WHERE is_ai_assisted = 1').get().c;
    const inProgress = db.prepare("SELECT COUNT(*) as c FROM complaints WHERE status IN ('ASSIGNED', 'IN_PROGRESS')").get().c;
    const completed = db.prepare("SELECT COUNT(*) as c FROM complaints WHERE status = 'COMPLETED'").get().c;

    // Infrastructure Health Index (% of assets in Good/Fair condition)
    const goodAssets = db.prepare("SELECT COUNT(*) as c FROM assets WHERE condition IN ('Good', 'Fair')").get().c;
    const healthIndex = totalAssets > 0 ? Math.round((goodAssets / totalAssets) * 100) : 100;

    const hotspots = analyzeHotspots();
    const preventiveRecs = getPreventiveRecommendations();

    return res.json({
      success: true,
      data: {
        totalAssets,
        totalComplaints,
        highPriority,
        inProgress,
        completed,
        activeComplaints,
        criticalComplaints,
        aiDetectedComplaints,
        inProgressMaintenance: inProgress,
        completedMaintenance: completed,
        infrastructureHealthIndex: healthIndex,
        topHotspots: hotspots.slice(0, 4),
        preventiveRecommendations: preventiveRecs
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch admin summary', details: err.message });
  }
});


/**
 * POST /api/complaints/:id/correct-issue
 * Allows administrator to correct the detected issue type, severity, and department
 */
/**
 * POST /api/complaints/:id/govt-forward
 * Link complaint to official government grievance reference ID (e.g. Sahaaya 2.0)
 */
app.post('/api/complaints/:id/govt-forward', requireMunicipalOfficer, (req, res) => {
  try {
    const complaintId = Number(req.params.id);
    const { govtReferenceId, portalName = 'BBMP Sahaaya 2.0 / Civic Portal', notes } = req.body;

    if (!govtReferenceId || !govtReferenceId.trim()) {
      return res.status(400).json({ error: 'Official Government Reference ID is required.' });
    }

    const complaint = db.prepare('SELECT * FROM complaints WHERE id = ?').get(complaintId);
    if (!complaint) {
      return res.status(404).json({ error: 'Complaint not found.' });
    }

    db.prepare(`
      UPDATE complaints 
      SET govt_reference_id = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(govtReferenceId.trim(), complaintId);

    try {
      db.prepare(`
        INSERT INTO maintenance_history (
          asset_id, complaint_id, action_taken, performed_by, before_condition, after_condition,
          completion_notes, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(
        complaint.asset_id || 1,
        complaintId,
        `Forwarded to Government Portal (${portalName})`,
        'NagarDristi AI Coordinator',
        complaint.severity,
        'Government Processing',
        notes || `Officially registered in government grievance system under Ref ID: ${govtReferenceId.trim()}`
      );
    } catch (e) {
      console.warn('Notice writing history for govt forward:', e.message);
    }

    return res.json({
      success: true,
      message: `Complaint #${complaint.complaint_number} successfully linked to Government Ref ID ${govtReferenceId.trim()}`,
      govtReferenceId: govtReferenceId.trim()
    });
  } catch (err) {
    console.error('Error forwarding to govt portal:', err);
    return res.status(500).json({ error: 'Failed to forward complaint', details: err.message });
  }
});

app.post('/api/complaints/:id/correct-issue', requireMunicipalOfficer, (req, res) => {
  try {
    const complaintId = req.params.id;
    const { issueType, severity, department, suggestedAction, reason } = req.body;

    if (!issueType) {
      return res.status(400).json({ error: 'Issue type is required for correction.' });
    }

    const complaint = db.prepare('SELECT * FROM complaints WHERE id = ?').get(complaintId);
    if (!complaint) {
      return res.status(404).json({ error: 'Complaint not found.' });
    }

    const finalSeverity = severity || complaint.severity;
    const finalDept = department || complaint.department;
    const finalAction = suggestedAction || complaint.recommended_action;

    db.prepare(`
      UPDATE complaints 
      SET issue_type = ?, severity = ?, department = ?, recommended_action = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(issueType, finalSeverity, finalDept, finalAction, complaintId);

    // Re-evaluate priority
    const priority = evaluateAndStorePriority(complaintId);

    // Record admin correction in maintenance history
    try {
      db.prepare(`
        INSERT INTO maintenance_history (
          asset_id, complaint_id, action_taken, performed_by, before_condition, after_condition,
          cost_estimate, completion_notes, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, CURRENT_TIMESTAMP)
      `).run(
        complaint.asset_id,
        complaintId,
        `Issue corrected from "${complaint.issue_type}" to "${issueType}"`,
        'NagarDristi AI Coordinator',
        complaint.severity,
        finalSeverity,
        reason || 'Administrator corrected AI detection result.'
      );
    } catch (e) {
      console.warn('Notice recording history log:', e.message);
    }

    const updated = db.prepare('SELECT * FROM complaints WHERE id = ?').get(complaintId);

    return res.json({
      success: true,
      message: `Issue corrected to ${issueType} (${finalSeverity} Priority)`,
      data: { ...updated, priority }
    });
  } catch (err) {
    console.error('Error correcting issue:', err);
    return res.status(500).json({ error: 'Failed to correct issue', details: err.message });
  }
});

// Start Server
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(`NagarDristi AI- AI-Powered Vision for Better Cities`);
    console.log(`Server listening at http://localhost:${PORT}`);

    // 24/7 Cloud Keep-Alive: Ping server every 8 minutes to prevent container sleep
    const https = require('https');
    const cloudUrl = process.env.RENDER_EXTERNAL_URL || 'https://public-infrastructure-system.onrender.com';
    setInterval(() => {
      try {
        https.get(`${cloudUrl}/api/health`, (res) => {
          console.log(`[${new Date().toLocaleTimeString()}] 24/7 Keep-Alive: HTTP ${res.statusCode}`);
        }).on('error', () => {});
      } catch (e) {}
    }, 8 * 60 * 1000);

    console.log(`Environment AI Status: ${process.env.GEMINI_API_KEY ? 'Active (Gemini Vision API)' : 'Demo Provider Mode (Set GEMINI_API_KEY for Live API)'}`);
    console.log(`=======================================================`);
  });
}

module.exports = app;
