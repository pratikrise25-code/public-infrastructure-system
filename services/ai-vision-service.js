const fs = require('fs');
const path = require('path');

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const ISSUE_TYPES = [
  'Pothole',
  'Road crack',
  'Broken streetlight',
  'Damaged sidewalk',
  'Water leakage',
  'Garbage accumulation',
  'Damaged public building',
  'Other infrastructure damage',
  'No issue detected'
];

/**
 * Returns simple, citizen-friendly language for issue detection and severity
 */
function getSimpleWords(issueType, severity) {
  const map = {
    'Pothole': {
      simpleIssue: 'Pothole detected',
      simpleSeverity: `${severity} Priority`,
      simpleExplanation: 'A cavity in the road surface that can cause vehicle damage or accidents if not patched promptly.'
    },
    'Road crack': {
      simpleIssue: 'Road surface crack detected',
      simpleSeverity: `${severity} Priority`,
      simpleExplanation: 'Cracks across the pavement that need bitumen sealing to prevent rainwater from eroding the road foundation.'
    },
    'Broken streetlight': {
      simpleIssue: 'Broken streetlight detected',
      simpleSeverity: `${severity} Priority`,
      simpleExplanation: 'Damaged or unlit street luminaire. Requires bulb or electrical repair to restore nighttime visibility and safety.'
    },
    'Damaged sidewalk': {
      simpleIssue: 'Damaged sidewalk detected',
      simpleSeverity: `${severity} Priority`,
      simpleExplanation: 'Broken, uneven, or displaced footpath tiles creating a tripping hazard for pedestrians.'
    },
    'Water leakage': {
      simpleIssue: 'Water pipe leakage detected',
      simpleSeverity: `${severity} Priority`,
      simpleExplanation: 'Water or drainage seepage overflowing onto the road. Needs valve closure and pipe repair.'
    },
    'Garbage accumulation': {
      simpleIssue: 'Garbage accumulation detected',
      simpleSeverity: `${severity} Priority`,
      simpleExplanation: 'Unsanctioned trash pile blocking the street or drain. Requires sanitation clearance vehicle.'
    },
    'Damaged public building': {
      simpleIssue: 'Damaged public building detected',
      simpleSeverity: `${severity} Priority`,
      simpleExplanation: 'Visible structural cracks or plaster damage on civic facility walls. Requires safety check.'
    },
    'Other infrastructure damage': {
      simpleIssue: 'Public infrastructure defect detected',
      simpleSeverity: `${severity} Priority`,
      simpleExplanation: 'Visible wear or damage on municipal infrastructure asset requiring maintenance attention.'
    },
    'No issue detected': {
      simpleIssue: 'Infrastructure appears undamaged',
      simpleSeverity: 'LOW Priority',
      simpleExplanation: 'No visible cracks, potholes, or hazards detected. Surface meets standard municipal condition.'
    }
  };

  return map[issueType] || {
    simpleIssue: `${issueType} detected`,
    simpleSeverity: `${severity} Priority`,
    simpleExplanation: 'Defect detected by visual inspection.'
  };
}

/**
 * Cleanly separated Demo / Mock Vision Provider
 * Used when no external AI API key is configured.
 * Clearly self-identifies as AI-Assisted Demo Heuristic Engine.
 */
class DemoVisionProvider {
  static analyze(filePath, originalFilename) {
    const lowerName = (originalFilename || '').toLowerCase();
    let result = null;

    if (lowerName.includes('pothole') || lowerName.includes('crater') || lowerName.includes('hole')) {
      result = {
        issueType: 'Pothole',
        confidence: 94.2,
        severity: 'CRITICAL',
        department: 'Roads & Bridges',
        description: 'Deep road surface cavity observed (approx 15-20cm depth) presenting imminent hazard to vehicles and motorcyclists.',
        recommendedAction: 'Immediate cold-pour asphalt emergency patching followed by mechanical compaction.'
      };
    } else if (lowerName.includes('crack') || lowerName.includes('fissure')) {
      result = {
        issueType: 'Road crack',
        confidence: 89.5,
        severity: 'MEDIUM',
        department: 'Roads & Bridges',
        description: 'Extensive longitudinal distress cracking detected across transit lane, indicating sub-base fatigue.',
        recommendedAction: 'Crack sealing with elastomeric bitumen compound to prevent moisture infiltration before monsoon.'
      };
    } else if (lowerName.includes('streetlight') || lowerName.includes('light') || lowerName.includes('lamp') || lowerName.includes('pole')) {
      result = {
        issueType: 'Broken streetlight',
        confidence: 96.0,
        severity: 'HIGH',
        department: 'Electrical & Lighting',
        description: 'Luminaire fixture broken/non-functional near structural base, compromising nocturnal pedestrian safety.',
        recommendedAction: 'Dispatch electrical crew to de-energize circuit, replace LED luminaire assembly, and inspect grounding.'
      };
    } else if (lowerName.includes('sidewalk') || lowerName.includes('footpath') || lowerName.includes('pavement')) {
      result = {
        issueType: 'Damaged sidewalk',
        confidence: 91.8,
        severity: 'MEDIUM',
        department: 'Roads & Bridges',
        description: 'Interlocking concrete paving stones dislodged and fractured, creating trip hazard and obstructing accessibility.',
        recommendedAction: 'Excavate displaced sub-base, level sand bedding, and install interlocking curb restraints.'
      };
    } else if (lowerName.includes('water') || lowerName.includes('leak') || lowerName.includes('drain') || lowerName.includes('flood')) {
      result = {
        issueType: 'Water leakage',
        confidence: 95.3,
        severity: 'CRITICAL',
        department: 'Water & Sewerage',
        description: 'Pressurized water seepage or drain chamber overflow detected, eroding road foundation and wasting potable water.',
        recommendedAction: 'Isolate municipal distribution valve and deploy trenchless leak detection and sleeve clamp repair.'
      };
    } else if (lowerName.includes('garbage') || lowerName.includes('waste') || lowerName.includes('trash') || lowerName.includes('debris')) {
      result = {
        issueType: 'Garbage accumulation',
        confidence: 93.0,
        severity: 'MEDIUM',
        department: 'Public Works & Sanitation',
        description: 'Unsanctioned municipal solid waste accumulation blocking drainage channel and public walkway.',
        recommendedAction: 'Deploy sanitation compactor truck for clearance and install civic anti-dumping surveillance signage.'
      };
    } else if (lowerName.includes('building') || lowerName.includes('wall') || lowerName.includes('facade') || lowerName.includes('structure')) {
      result = {
        issueType: 'Damaged public building',
        confidence: 88.4,
        severity: 'HIGH',
        department: 'Municipal Buildings',
        description: 'Structural spalling and external masonry delamination observed on civic facility facade.',
        recommendedAction: 'Cordon safety perimeter and engage structural engineer for ultrasonic concrete sounding test.'
      };
    } else if (lowerName.includes('clean') || lowerName.includes('good') || lowerName.includes('none') || lowerName.includes('repaired')) {
      result = {
        issueType: 'No issue detected',
        confidence: 97.5,
        severity: 'LOW',
        department: 'Roads & Bridges',
        description: 'Infrastructure surface appears sound, clean, and structurally compliant with municipal standards.',
        recommendedAction: 'No immediate maintenance intervention required. Continue routine periodic monitoring.'
      };
    } else {
      // General heuristic for other or custom uploaded images
      const stats = fs.statSync(filePath);
      const hash = (stats.size % 4);

      if (hash === 0) {
        result = {
          issueType: 'Pothole',
          confidence: 87.5,
          severity: 'HIGH',
          department: 'Roads & Bridges',
          description: 'Road surface indentation and aggregate loss detected in visual inspection area.',
          recommendedAction: 'Schedule asphalt patch repair with quick-curing tack coat.'
        };
      } else if (hash === 1) {
        result = {
          issueType: 'Road crack',
          confidence: 84.0,
          severity: 'MEDIUM',
          department: 'Roads & Bridges',
          description: 'Surface fissures and micro-cracking observed on pavement section.',
          recommendedAction: 'Apply hot-pour rubberized joint sealant to prevent water penetration.'
        };
      } else if (hash === 2) {
        result = {
          issueType: 'Damaged sidewalk',
          confidence: 86.2,
          severity: 'MEDIUM',
          department: 'Roads & Bridges',
          description: 'Curbstone misalignment and uneven surface detected along pedestrian walkway.',
          recommendedAction: 'Reset perimeter curb stones and replace fractured pedestrian tiles.'
        };
      } else {
        result = {
          issueType: 'Other infrastructure damage',
          confidence: 81.0,
          severity: 'MEDIUM',
          department: 'Public Works & Sanitation',
          description: 'Visible wear and surface degradation detected on public infrastructure asset.',
          recommendedAction: 'Dispatch field inspection officer for physical on-site evaluation.'
        };
      }
    }

    const simple = getSimpleWords(result.issueType, result.severity);

    return {
      ...result,
      ...simple,
      provider: 'AI-Assisted Vision Engine (Demo Mode)',
      isAiAssisted: true,
      isDemo: true
    };
  }
}

/**
 * Live Google Gemini Vision Provider
 */
async function callGeminiVision(apiKey, filePath, mimeType) {
  const imageBuffer = fs.readFileSync(filePath);
  const base64Data = imageBuffer.toString('base64');

  const promptText = `
You are an expert civic infrastructure inspection and asset monitoring AI for a city municipal authority.
Analyze this infrastructure photograph.

Classify the primary issue into EXACTLY ONE of the following categories:
- Pothole
- Road crack
- Broken streetlight
- Damaged sidewalk
- Water leakage
- Garbage accumulation
- Damaged public building
- Other infrastructure damage
- No issue detected

Assess:
1. issueType: (One of the 9 categories above)
2. confidence: (Numeric percentage between 0 and 100)
3. severity: ("LOW", "MEDIUM", "HIGH", or "CRITICAL")
4. department: ("Roads & Bridges", "Electrical & Lighting", "Water & Sewerage", "Public Works & Sanitation", or "Municipal Buildings")
5. description: (Concise, simple factual explanation in plain words of what is visibly damaged)
6. recommendedAction: (Standard municipal maintenance intervention procedure)

Return ONLY valid JSON matching this schema:
{
  "issueType": string,
  "confidence": number,
  "severity": string,
  "department": string,
  "description": string,
  "recommendedAction": string
}
`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const requestBody = {
    contents: [
      {
        parts: [
          { text: promptText },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Data
            }
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.2,
      response_mime_type: 'application/json'
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!rawText) {
    throw new Error('Gemini API returned an empty response.');
  }

  const parsed = JSON.parse(rawText);

  // Validate fields
  if (!ISSUE_TYPES.includes(parsed.issueType)) {
    parsed.issueType = 'Other infrastructure damage';
  }

  const validSeverities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  if (!validSeverities.includes(parsed.severity)) {
    parsed.severity = 'MEDIUM';
  }

  const simple = getSimpleWords(parsed.issueType, parsed.severity);

  return {
    issueType: parsed.issueType,
    confidence: Number(parsed.confidence) || 85.0,
    severity: parsed.severity,
    department: parsed.department || 'Roads & Bridges',
    description: parsed.description || 'Public infrastructure defect identified.',
    recommendedAction: parsed.recommendedAction || 'Schedule physical maintenance inspection.',
    ...simple,
    provider: 'Google Gemini Vision AI (Live API - AI-Assisted)',
    isAiAssisted: true,
    isDemo: false
  };
}

/**
 * Main Vision Analysis Dispatcher
 */
async function analyzeInfrastructureImage(filePath, originalFilename, mimeType, fileSize) {
  // Validate file existence
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  // Validate file size (max 10MB)
  if (fileSize > MAX_FILE_SIZE) {
    throw new Error(`File size ${(fileSize / (1024 * 1024)).toFixed(2)}MB exceeds maximum allowed limit of 10MB.`);
  }

  // Validate mime type
  if (mimeType && !ALLOWED_MIME_TYPES.includes(mimeType.toLowerCase())) {
    throw new Error(`Unsupported file type: ${mimeType}. Allowed formats: JPG, JPEG, PNG.`);
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (apiKey && apiKey.trim() !== '') {
    try {
      console.log('Dispatching image analysis to Google Gemini 2.5 Flash Vision...');
      return await callGeminiVision(apiKey, filePath, mimeType || 'image/jpeg');
    } catch (err) {
      console.warn('Gemini API call failed, falling back to Demo Vision Engine:', err.message);
      return DemoVisionProvider.analyze(filePath, originalFilename);
    }
  } else {
    // Graceful offline demo mode
    return DemoVisionProvider.analyze(filePath, originalFilename);
  }
}

module.exports = {
  analyzeInfrastructureImage,
  DemoVisionProvider,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
  ISSUE_TYPES,
  getSimpleWords
};
