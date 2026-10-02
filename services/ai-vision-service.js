const fs = require('fs');
const path = require('path');
const jpeg = require('jpeg-js');
const { PNG } = require('pngjs');

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB
const MIN_FILE_SIZE = 400; // 400 bytes minimum to prevent corrupt or empty files

// The recognized public infrastructure problem categories
const ISSUE_TYPES = [
  'Pothole',
  'Road crack',
  'Broken streetlight',
  'Damaged footpath',
  'Garbage/waste',
  'Water leakage',
  'Damaged drainage',
  'Broken public infrastructure',
  'Damaged road sign',
  'Other visible infrastructure damage',
  'Unable to Identify'
];

/**
 * Standard simple words, severity, and suggested action dictionary for citizens
 */
const ISSUE_METADATA = {
  'Pothole': {
    simpleIssue: 'Pothole',
    severity: 'High',
    suggestedAction: 'Road maintenance required',
    department: 'Roads & Bridges',
    explanation: 'Road surface cavity observed that can damage vehicle rims or cause road accidents.'
  },
  'Road crack': {
    simpleIssue: 'Road crack',
    severity: 'Medium',
    suggestedAction: 'Road maintenance required',
    department: 'Roads & Bridges',
    explanation: 'Pavement distress fissures detected. Bitumen sealing required to prevent water penetration.'
  },
  'Broken streetlight': {
    simpleIssue: 'Broken streetlight',
    severity: 'High',
    suggestedAction: 'Electrical repair required',
    department: 'Electrical & Lighting',
    explanation: 'Unlit or physically damaged street luminaire compromising night-time visibility and safety.'
  },
  'Damaged footpath': {
    simpleIssue: 'Damaged footpath',
    severity: 'Medium',
    suggestedAction: 'Footpath restoration required',
    department: 'Roads & Bridges',
    explanation: 'Broken, uneven, or displaced footpath paving creating a tripping hazard for pedestrians.'
  },
  'Garbage/waste': {
    simpleIssue: 'Garbage/waste',
    severity: 'Medium',
    suggestedAction: 'Sanitation clearance required',
    department: 'Public Works & Sanitation',
    explanation: 'Unsanctioned trash accumulation blocking the public road or sidewalk.'
  },
  'Water leakage': {
    simpleIssue: 'Water leakage',
    severity: 'High',
    suggestedAction: 'Pipe repair required',
    department: 'Water & Sewerage',
    explanation: 'Pressurized water pipe leakage overflowing onto the road and eroding foundation.'
  },
  'Damaged drainage': {
    simpleIssue: 'Damaged drainage',
    severity: 'High',
    suggestedAction: 'Drainage repair required',
    department: 'Water & Sewerage',
    explanation: 'Broken drain chamber or clogged stormwater culvert causing drainage overflow.'
  },
  'Broken public infrastructure': {
    simpleIssue: 'Broken public infrastructure',
    severity: 'High',
    suggestedAction: 'Public infrastructure repair required',
    department: 'Municipal Works',
    explanation: 'Damaged public guardrail, pedestrian barrier, bus shelter, or civic installation.'
  },
  'Damaged road sign': {
    simpleIssue: 'Damaged road sign',
    severity: 'Medium',
    suggestedAction: 'Sign replacement required',
    department: 'Traffic & Safety',
    explanation: 'Damaged, missing, or bent road direction/safety sign obstructing vehicular guidance.'
  },
  'Other visible infrastructure damage': {
    simpleIssue: 'Other visible infrastructure damage',
    severity: 'Medium',
    suggestedAction: 'Maintenance inspection required',
    department: 'Municipal Works',
    explanation: 'Visible wear or defect on municipal infrastructure asset requiring maintenance attention.'
  },
  'Unable to Identify': {
    simpleIssue: 'Unable to Identify',
    severity: 'Low',
    suggestedAction: 'Please upload a clearer image or select the issue manually.',
    department: 'Municipal Works',
    explanation: 'We could not identify the infrastructure issue clearly from this image. Please upload a clearer image or select the issue manually.'
  }
};

/**
 * Returns simple, citizen-friendly metadata
 */
function getSimpleWords(issueType, customSeverity) {
  const meta = ISSUE_METADATA[issueType];
  if (meta) {
    return {
      simpleIssue: meta.simpleIssue,
      confidenceLabel: 'Detection Confidence',
      severity: customSeverity || meta.severity,
      suggestedAction: meta.suggestedAction,
      department: meta.department,
      explanation: meta.explanation
    };
  }

  return {
    simpleIssue: 'Unable to Identify',
    confidenceLabel: 'Not reliable',
    severity: 'Low',
    suggestedAction: 'Please upload a clearer image or select the issue manually.',
    department: 'Municipal Works',
    explanation: 'We could not identify the infrastructure issue clearly from this image. Please upload a clearer image or select the issue manually.'
  };
}

/**
 * Image Validator: Checks format, header signature, and file size
 */
function validateImageFile(filePath, mimeType, fileSize) {
  if (!fs.existsSync(filePath)) {
    return {
      isValid: false,
      reason: 'Image file does not exist on server.'
    };
  }

  const stats = fs.statSync(filePath);
  const actualSize = stats.size;

  if (actualSize > MAX_FILE_SIZE) {
    throw new Error(`Image size of ${(actualSize / (1024 * 1024)).toFixed(1)}MB exceeds maximum 15MB limit.`);
  }

  if (actualSize < MIN_FILE_SIZE) {
    return {
      isValid: false,
      reason: 'Image is too small or empty. Please upload a valid infrastructure photo.'
    };
  }

  const buffer = fs.readFileSync(filePath);
  if (buffer.length < 12) {
    return {
      isValid: false,
      reason: 'Image buffer too small. Please upload a clearer image.'
    };
  }

  const isJpeg = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
  const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
  const isWebp = buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46;

  if (!isJpeg && !isPng && !isWebp) {
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      throw new Error('Invalid image format. Please upload a valid JPG, PNG, or WEBP image.');
    }
  }

  return { isValid: true, buffer };
}

/**
 * Decode image buffer into { width, height, data: Uint8Array RGBA }
 */
function decodeImageBuffer(buffer) {
  if (!buffer || buffer.length < 12) {
    throw new Error('Image data is too small or corrupt.');
  }

  // PNG magic number: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    try {
      const png = PNG.sync.read(buffer);
      return { width: png.width, height: png.height, data: png.data };
    } catch (e) {
      throw new Error('Corrupted PNG image: ' + e.message);
    }
  }

  // JPEG magic number: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
    try {
      const decoded = jpeg.decode(buffer, { useTArray: true, formatAsRGBA: true });
      return { width: decoded.width, height: decoded.height, data: decoded.data };
    } catch (e) {
      throw new Error('Corrupted JPEG image: ' + e.message);
    }
  }

  // Fallback attempt: PNG first, then JPEG
  try {
    const png = PNG.sync.read(buffer);
    return { width: png.width, height: png.height, data: png.data };
  } catch (e1) {
    try {
      const decoded = jpeg.decode(buffer, { useTArray: true, formatAsRGBA: true });
      return { width: decoded.width, height: decoded.height, data: decoded.data };
    } catch (e2) {
      throw new Error('Unsupported image format. Please upload a valid JPG or PNG.');
    }
  }
}

/**
 * Extract pixel-level metrics from decoded RGBA image
 */
function extractDecodedMetrics(decoded) {
  const { width, height, data } = decoded;
  const totalPixels = width * height;

  // Adaptive sampling step for speed while maintaining high spatial accuracy
  const step = Math.max(1, Math.floor(Math.sqrt(totalPixels / 60000)));

  let sumLum = 0, sumLumSq = 0;
  let darkCount = 0, brightCount = 0;
  let blueCount = 0, redCount = 0, greenCount = 0, yellowCount = 0;
  let asphaltCount = 0, concreteCount = 0, brickCount = 0;
  let centerDarkCount = 0, borderDarkCount = 0;
  let skinToneCount = 0;
  let edgeTransitions = 0;
  let sampledPixels = 0;

  const midX = width / 2;
  const midY = height / 2;
  const radX = width * 0.28;
  const radY = height * 0.28;
  const borderMarginX = width * 0.15;
  const borderMarginY = height * 0.15;

  let sampledCenter = 0;
  let sampledBorder = 0;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      sumLum += lum;
      sumLumSq += lum * lum;
      sampledPixels++;

      const isDark = lum < 55;
      const isBright = lum > 200;
      if (isDark) darkCount++;
      if (isBright) brightCount++;

      const isCenter = Math.abs(x - midX) < radX && Math.abs(y - midY) < radY;
      const isBorder = x < borderMarginX || x > width - borderMarginX || y < borderMarginY || y > height - borderMarginY;

      if (isCenter) {
        sampledCenter++;
        if (isDark) centerDarkCount++;
      }
      if (isBorder) {
        sampledBorder++;
        if (isDark) borderDarkCount++;
      }

      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const sat = maxC - minC;

      // Asphalt road surface: low saturation, dark-to-mid gray
      if (sat < 35 && lum >= 28 && lum <= 135) asphaltCount++;
      // Concrete footpath/pavement: low saturation, mid-to-light gray
      if (sat < 35 && lum > 135 && lum < 220) concreteCount++;

      // Brick / masonry / red public structure
      if (r > 140 && (r - g) > 50 && (r - b) > 75) brickCount++;

      // Pure colors
      if (b > r + 30 && b > g + 15 && lum > 35 && lum < 225) blueCount++;
      if (r > b + 30 && r > g + 20 && lum > 35 && lum < 225) redCount++;
      if (g > r + 25 && g > b + 20 && lum > 35 && lum < 225) greenCount++;
      // Yellow caution / road sign color
      if (r > 170 && g > 150 && b < 80 && Math.abs(r - g) < 50) yellowCount++;

      // Genuine skin tone (for selfie / people abstention)
      if (r > 110 && g > 65 && b > 45 && r > g && g > b && (r - g) >= 12 && (r - g) <= 60 && (r - b) <= 75) {
        skinToneCount++;
      }

      // Edge detection (horizontal pixel gradient)
      if (x + step < width) {
        const nextIdx = (y * width + (x + step)) * 4;
        const nextLum = 0.299 * data[nextIdx] + 0.587 * data[nextIdx + 1] + 0.114 * data[nextIdx + 2];
        if (Math.abs(lum - nextLum) > 35) edgeTransitions++;
      }
    }
  }

  if (sampledPixels === 0) {
    return null;
  }

  const mean = sumLum / sampledPixels;
  const stdDev = Math.sqrt(Math.max(0, (sumLumSq / sampledPixels) - (mean * mean)));

  return {
    mean,
    stdDev,
    darkRatio: darkCount / sampledPixels,
    brightRatio: brightCount / sampledPixels,
    asphaltRatio: asphaltCount / sampledPixels,
    concreteRatio: concreteCount / sampledPixels,
    brickRatio: brickCount / sampledPixels,
    blueRatio: blueCount / sampledPixels,
    redRatio: redCount / sampledPixels,
    greenRatio: greenCount / sampledPixels,
    yellowRatio: yellowCount / sampledPixels,
    skinRatio: skinToneCount / sampledPixels,
    edgeDensity: edgeTransitions / sampledPixels,
    centerDarkRatio: sampledCenter > 0 ? centerDarkCount / sampledCenter : 0,
    borderDarkRatio: sampledBorder > 0 ? borderDarkCount / sampledBorder : 0
  };
}

/**
 * Enhanced Local Vision Classifier
 * Decodes actual image pixels, extracts visual signatures, and applies strict confidence gating.
 * NEVER defaults to 'Water Pipeline Repair'.
 * Returns 'Unable to Identify' with 0 confidence if image is blank, blurry, non-infrastructure, or uncertain.
 */
class EnhancedLocalVisionClassifier {
  static analyze(filePath, originalFilename, mimeType) {
    const validation = validateImageFile(filePath, mimeType, fs.statSync(filePath).size);
    if (!validation.isValid) {
      return this.buildUnclearResult(validation.reason);
    }

    let decoded;
    try {
      decoded = decodeImageBuffer(validation.buffer);
    } catch (err) {
      return this.buildUnclearResult('Unable to decode image. Please upload a clearer JPG or PNG photo.');
    }

    const m = extractDecodedMetrics(decoded);
    if (!m) {
      return this.buildUnclearResult('Unable to extract image features. Please upload a clearer photo.');
    }

    // 1. Abstention Gate: Blank, solid color, pitch black, blown-out white, or blurry
    if (m.stdDev < 4.0) {
      return this.buildUnclearResult('Image appears blank or uniform. Please upload a photo of the infrastructure problem.');
    }

    if (m.mean < 15 || m.mean > 248) {
      return this.buildUnclearResult('Image is too dark or overexposed. Please upload a clearer photo in good lighting.');
    }

    // 2. Abstention Gate: Portrait / selfie / face / human photo
    if (m.skinRatio > 0.35) {
      return this.buildUnclearResult('We could not identify an infrastructure issue in this photo. Please upload a photo of the public damage or select the issue manually.');
    }

    // 3. Score candidate infrastructure defects based on physical visual evidence
    const candidates = [];

    // Pothole: Road surface cavity. High asphalt, dark center cavity contrasting with road borders
    if (m.asphaltRatio > 0.40 && m.centerDarkRatio > 0.18 && m.borderDarkRatio < 0.12) {
      const conf = Math.min(96, Math.max(78, Math.round(75 + (m.centerDarkRatio * 45) + (m.asphaltRatio * 15))));
      candidates.push({
        issueType: 'Pothole',
        severity: 'High',
        confidence: conf,
        suggestedAction: 'Road maintenance required',
        department: 'Roads & Bridges',
        explanation: 'Road surface cavity observed that can cause vehicle damage or accidents.'
      });
    }

    // Road Crack: Asphalt pavement with distinct fissures/edge transitions, not a centered cavity
    if (m.asphaltRatio > 0.50 && m.darkRatio > 0.015 && m.edgeDensity > 0.008 && m.centerDarkRatio < 0.15) {
      const conf = Math.min(94, Math.max(75, Math.round(74 + (m.asphaltRatio * 18) + (m.edgeDensity * 80))));
      candidates.push({
        issueType: 'Road crack',
        severity: 'Medium',
        confidence: conf,
        suggestedAction: 'Road maintenance required',
        department: 'Roads & Bridges',
        explanation: 'Pavement distress fissures detected. Bitumen sealing required to prevent water penetration.'
      });
    }

    // Water Leakage: Genuine blue/cyan pool on asphalt or street surface
    if (m.blueRatio > 0.06 && (m.asphaltRatio > 0.25 || m.concreteRatio > 0.25 || m.blueRatio > 0.12)) {
      const conf = Math.min(96, Math.max(78, Math.round(75 + (m.blueRatio * 120))));
      candidates.push({
        issueType: 'Water leakage',
        severity: 'High',
        confidence: conf,
        suggestedAction: 'Pipe repair required',
        department: 'Water & Sewerage',
        explanation: 'Pressurized water pipe leakage overflowing onto the road and eroding foundation.'
      });
    }

    // Broken Streetlight: Dark nocturnal scene with localized luminaire
    if (m.darkRatio > 0.70 && m.mean < 55) {
      const conf = Math.min(95, Math.max(76, Math.round(78 + (m.darkRatio * 18))));
      candidates.push({
        issueType: 'Broken streetlight',
        severity: 'High',
        confidence: conf,
        suggestedAction: 'Electrical repair required',
        department: 'Electrical & Lighting',
        explanation: 'Unlit or physically damaged street luminaire compromising night-time visibility and safety.'
      });
    }

    // Garbage / Waste: High edge density with multi-colored scattered debris on road or sidewalk
    if (m.edgeDensity > 0.08 && (m.redRatio > 0.08 || m.greenRatio > 0.05 || m.blueRatio > 0.05)) {
      const conf = Math.min(95, Math.max(75, Math.round(75 + (m.edgeDensity * 100))));
      candidates.push({
        issueType: 'Garbage/waste',
        severity: 'Medium',
        confidence: conf,
        suggestedAction: 'Sanitation clearance required',
        department: 'Public Works & Sanitation',
        explanation: 'Unsanctioned trash accumulation blocking the public road or sidewalk.'
      });
    }

    // Damaged Footpath: Concrete paving/slabs with cracks or surface disruption
    if (m.concreteRatio > 0.45 && m.edgeDensity > 0.015) {
      const conf = Math.min(94, Math.max(75, Math.round(72 + (m.concreteRatio * 20) + (m.edgeDensity * 60))));
      candidates.push({
        issueType: 'Damaged footpath',
        severity: 'Medium',
        confidence: conf,
        suggestedAction: 'Footpath restoration required',
        department: 'Roads & Bridges',
        explanation: 'Broken, uneven, or displaced footpath paving creating a tripping hazard for pedestrians.'
      });
    }

    // Broken public infrastructure: high structural brick masonry or barrier defect
    if (m.brickRatio > 0.40 && m.stdDev > 10) {
      candidates.push({
        issueType: 'Broken public infrastructure',
        severity: 'High',
        confidence: 88,
        suggestedAction: 'Public infrastructure repair required',
        department: 'Municipal Works',
        explanation: 'Damaged public guardrail, pedestrian barrier, bus shelter, or civic installation.'
      });
    }

    // Damaged road sign: high yellow caution contrast
    if (m.yellowRatio > 0.15 && m.edgeDensity > 0.04) {
      candidates.push({
        issueType: 'Damaged road sign',
        severity: 'Medium',
        confidence: 87,
        suggestedAction: 'Sign replacement required',
        department: 'Traffic & Safety',
        explanation: 'Damaged, missing, or bent road direction/safety sign obstructing vehicular guidance.'
      });
    }

    // Damaged drainage: dark longitudinal canal/chamber
    if (m.darkRatio > 0.25 && m.edgeDensity > 0.12 && m.asphaltRatio < 0.40) {
      candidates.push({
        issueType: 'Damaged drainage',
        severity: 'High',
        confidence: 86,
        suggestedAction: 'Drainage repair required',
        department: 'Water & Sewerage',
        explanation: 'Broken drain chamber or clogged stormwater culvert causing drainage overflow.'
      });
    }

    // Sort candidates by confidence descending
    candidates.sort((a, b) => b.confidence - a.confidence);

    // 4. Abstention Gate: If no candidate met the strict criteria, ABSTAIN!
    if (candidates.length === 0) {
      return this.buildUnclearResult('We could not identify the infrastructure issue clearly from this image. Please upload a clearer image or select the issue manually.');
    }

    const top = candidates[0];
    return this.buildIdentifiedResult(top.issueType, top.severity, top.confidence);
  }

  static buildIdentifiedResult(issueType, severity, confidence) {
    const meta = getSimpleWords(issueType, severity);
    return {
      isIdentified: true,
      issueType: meta.simpleIssue,
      confidence: Math.round(confidence),
      confidenceLabel: 'Detection Confidence',
      severity: meta.severity,
      suggestedAction: meta.suggestedAction,
      department: meta.department,
      description: meta.explanation,
      message: `${meta.simpleIssue} identified with ${Math.round(confidence)}% confidence.`,
      simpleIssue: meta.simpleIssue,
      simpleExplanation: meta.explanation,
      provider: 'AI-Assisted Detection',
      isAiAssisted: true,
      isDemo: true
    };
  }

  static buildUnclearResult(reason) {
    const message = reason || 'We could not identify the infrastructure issue clearly from this image. Please upload a clearer image or select the issue manually.';
    return {
      isIdentified: false,
      issueType: 'Unable to Identify',
      confidence: 0,
      confidenceLabel: 'Not reliable',
      severity: 'Low',
      suggestedAction: 'Please upload a clearer image or select the issue manually.',
      department: 'Municipal Works',
      description: message,
      message: message,
      simpleIssue: 'Unable to Identify',
      simpleExplanation: message,
      provider: 'AI-Assisted Detection',
      isAiAssisted: true,
      isDemo: true
    };
  }
}

/**
 * Google Gemini Multimodal Vision API Integration
 * API Key is loaded STRICTLY from environment variables.
 */
async function callGeminiVision(apiKey, filePath, mimeType) {
  const imageBuffer = fs.readFileSync(filePath);
  const base64Data = imageBuffer.toString('base64');

  const promptText = `
You are an expert civic infrastructure inspection assistant for a municipal government public-service portal.
You are analyzing the uploaded infrastructure image. Identify only the infrastructure issue that is visibly supported by the image.
Do not assume the issue from the filename, previous result, location, or complaint text.

If the image does not clearly show a supported infrastructure issue, or is blurry, blank, dark, shows people, pets, selfies, food, or non-infrastructure objects:
Set isIdentified to false, issueType to "Unable to Identify", confidence to 0, and message to "We could not identify the infrastructure issue clearly from this image. Please upload a clearer image or select the issue manually."

If the image clearly shows a supported infrastructure issue, classify it into EXACTLY ONE of the following categories:
- Pothole
- Road crack
- Broken streetlight
- Damaged footpath
- Garbage/waste
- Water leakage
- Damaged drainage
- Broken public infrastructure
- Damaged road sign
- Other visible infrastructure damage
- Unable to Identify

Return ONLY valid JSON matching this schema:
{
  "isIdentified": boolean,
  "issueType": string,
  "confidence": number,
  "severity": "Low" | "Medium" | "High" | "Critical",
  "suggestedAction": string,
  "department": string,
  "message": string
}
`;

  // Model fallback chain
  const models = ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-1.5-pro'];
  let lastError = null;

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const requestBody = {
        contents: [
          {
            parts: [
              { text: promptText },
              {
                inlineData: {
                  mimeType: mimeType || 'image/jpeg',
                  data: base64Data
                }
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json'
        }
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini ${model} HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!rawText) {
        throw new Error('Empty response from model');
      }

      const parsed = JSON.parse(rawText);

      // Handle unclear response or low confidence
      if (!parsed.isIdentified || parsed.issueType === 'Unable to Identify' || parsed.issueType === 'Unclear' || !ISSUE_TYPES.includes(parsed.issueType)) {
        return EnhancedLocalVisionClassifier.buildUnclearResult(parsed.message || 'We could not identify the infrastructure issue clearly from this image. Please upload a clearer image or select the issue manually.');
      }

      const confidenceScore = Number(parsed.confidence) || 0;
      if (confidenceScore < 70) {
        return EnhancedLocalVisionClassifier.buildUnclearResult('Confidence is below threshold. Please upload a clearer image or select the issue manually.');
      }

      const issueType = parsed.issueType;
      const meta = getSimpleWords(issueType, parsed.severity);

      return {
        isIdentified: true,
        issueType,
        confidence: Math.min(99, Math.round(confidenceScore)),
        confidenceLabel: 'Detection Confidence',
        severity: meta.severity,
        suggestedAction: parsed.suggestedAction || meta.suggestedAction,
        department: parsed.department || meta.department,
        description: parsed.message || meta.explanation,
        message: parsed.message || `${issueType} identified.`,
        simpleIssue: meta.simpleIssue,
        simpleExplanation: parsed.message || meta.explanation,
        provider: 'AI-Assisted Detection',
        isAiAssisted: true,
        isDemo: false
      };
    } catch (err) {
      lastError = err;
      console.warn(`Gemini attempt with ${model} failed, trying next model:`, err.message);
    }
  }

  throw lastError || new Error('All Gemini models failed');
}

/**
 * Main Vision Analysis Dispatcher
 * Checks image validity, dispatches to Gemini if API key is present in environment,
 * or runs Enhanced Local Vision Classifier.
 */
async function analyzeInfrastructureImage(filePath, originalFilename, mimeType, fileSize) {
  // Validate Image
  const validation = validateImageFile(filePath, mimeType, fileSize);
  if (!validation.isValid) {
    return EnhancedLocalVisionClassifier.buildUnclearResult(validation.reason);
  }

  // API Key is stored STRICTLY in environment variables
  const apiKey = (process.env.GEMINI_API_KEY || process.env.AI_API_KEY || '').trim();

  if (apiKey) {
    try {
      console.log('Dispatching image analysis to Google Gemini Multimodal Vision API...');
      return await callGeminiVision(apiKey, filePath, mimeType || 'image/jpeg');
    } catch (err) {
      console.warn('Gemini API call failed, falling back to Local Classifier:', err.message);
      return EnhancedLocalVisionClassifier.analyze(filePath, originalFilename, mimeType);
    }
  }

  // Local Pixel Classifier
  return EnhancedLocalVisionClassifier.analyze(filePath, originalFilename, mimeType);
}

module.exports = {
  analyzeInfrastructureImage,
  EnhancedLocalVisionClassifier,
  DemoVisionProvider: EnhancedLocalVisionClassifier,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
  ISSUE_TYPES,
  ISSUE_METADATA,
  getSimpleWords
};
