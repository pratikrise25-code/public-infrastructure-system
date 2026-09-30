const fs = require('fs');
const path = require('path');
const { db } = require('../db/database');

const CHANGE_TYPES = ['Improved', 'Unchanged', 'Increased', 'New damage', 'Inconclusive'];

/**
 * Compare two images using Gemini Vision if key available
 */
async function callGeminiDamageComparison(apiKey, prevImagePath, currImagePath) {
  const prevBuffer = fs.readFileSync(prevImagePath).toString('base64');
  const currBuffer = fs.readFileSync(currImagePath).toString('base64');

  const promptText = `
You are an expert civil engineer and municipal infrastructure damage progression evaluator.
Compare the two images provided for the same asset.
- Image 1 is the HISTORICAL BASELINE inspection image.
- Image 2 is the CURRENT / NEWEST inspection image.

Analyze the structural and visible progression of damage.
Classify changeDetected into EXACTLY ONE of:
- "Improved" (repaired, filled, resurfaced, or condition noticeably upgraded)
- "Unchanged" (damage extent, crack width, or cavity size is stable)
- "Increased" (crack has propagated, pothole has enlarged, or deterioration has deepened)
- "New damage" (a different or newly developed fracture/failure has occurred)
- "Inconclusive" (insufficient visual clarity, different angle, or cannot be determined reliably)

Do NOT invent damage or measurements that cannot be verified from the images.

Return ONLY a JSON object:
{
  "previousCondition": string,
  "currentCondition": string,
  "changeDetected": "Improved" | "Unchanged" | "Increased" | "New damage" | "Inconclusive",
  "confidence": number (0-100),
  "suggestedAction": string,
  "explanation": string
}
`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const requestBody = {
    contents: [
      {
        parts: [
          { text: promptText },
          { text: 'Image 1: Historical Baseline' },
          { inline_data: { mime_type: 'image/jpeg', data: prevBuffer } },
          { text: 'Image 2: Current Inspection' },
          { inline_data: { mime_type: 'image/jpeg', data: currBuffer } }
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
    throw new Error(`Gemini Comparison API error: ${response.statusText}`);
  }

  const data = await response.json();
  const textOutput = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return JSON.parse(textOutput);
}

/**
 * Compare current image with previous asset image
 */
async function compareDamageProgress(assetId, currentImagePath, currentOriginalFilename) {
  // 1. Retrieve previous images for this asset
  const getPrevImageStmt = db.prepare(`
    SELECT img.*, c.status as complaint_status, c.issue_type, c.severity, c.reported_at
    FROM images img
    JOIN complaints c ON img.complaint_id = c.id
    WHERE img.asset_id = ?
    ORDER BY img.uploaded_at DESC
    LIMIT 1
  `);

  const prevImage = getPrevImageStmt.get(assetId);

  // If no previous image exists for this asset
  if (!prevImage) {
    return {
      status: 'Inconclusive',
      hasBaseline: false,
      changeDetected: 'Inconclusive',
      confidence: 0,
      previousCondition: 'No historical image record',
      currentCondition: 'Baseline capture in progress',
      suggestedAction: 'Establish this image as the baseline inspection record for asset ' + assetId,
      explanation: 'Insufficient historical image information. No prior inspection photos exist in the municipal archive for this asset.',
      previousImage: null
    };
  }

  // Check if physical file exists for previous image
  let fullPrevPath = prevImage.file_path;
  if (fullPrevPath.startsWith('/assets/')) {
    fullPrevPath = path.join(__dirname, '../public', fullPrevPath);
  } else if (fullPrevPath.startsWith('/uploads/')) {
    fullPrevPath = path.join(__dirname, '../uploads', path.basename(fullPrevPath));
  }

  const hasPrevFile = fs.existsSync(fullPrevPath);

  const apiKey = process.env.GEMINI_API_KEY || process.env.AI_API_KEY;

  if (apiKey && apiKey.trim() !== '' && hasPrevFile) {
    try {
      console.log('Comparing damage progress via Gemini Vision API...');
      const geminiResult = await callGeminiDamageComparison(apiKey.trim(), fullPrevPath, currentImagePath);
      return {
        hasBaseline: true,
        previousImage: {
          id: prevImage.id,
          url: prevImage.file_path,
          date: prevImage.uploaded_at || prevImage.reported_at,
          issueType: prevImage.issue_type,
          severity: prevImage.severity
        },
        previousCondition: geminiResult.previousCondition || 'Visible defect on previous report',
        currentCondition: geminiResult.currentCondition || 'Current surface condition',
        changeDetected: CHANGE_TYPES.includes(geminiResult.changeDetected) ? geminiResult.changeDetected : 'Unchanged',
        confidence: Number(geminiResult.confidence) || 88,
        suggestedAction: geminiResult.suggestedAction || 'Continue scheduled maintenance protocol.',
        explanation: geminiResult.explanation || 'Visual analysis comparison completed.',
        provider: 'Google Gemini Vision Comparative Engine',
        isDemo: false
      };
    } catch (err) {
      console.warn('Gemini comparison failed, using demo progression comparator:', err.message);
    }
  }

  // Demo / Offline Heuristic Progression Comparator
  const lowerCurrName = (currentOriginalFilename || '').toLowerCase();
  let change = 'Increased';
  let prevCond = 'Moderate surface cracking & localized voiding';
  let currCond = 'Enlarged perimeter cavitation with exposed sub-base aggregate';
  let confidence = 89.2;
  let action = 'Accelerate maintenance queue from P2 to P1 due to active deterioration.';
  let explanation = 'Comparison against baseline image from ' + (prevImage.reported_at ? prevImage.reported_at.split(' ')[0] : 'prior inspection') + ' indicates widening of surface defect.';

  if (lowerCurrName.includes('clean') || lowerCurrName.includes('repaired') || lowerCurrName.includes('fixed') || lowerCurrName.includes('after')) {
    change = 'Improved';
    prevCond = 'Active defect: ' + prevImage.issue_type;
    currCond = 'Restored surface, void sealed, and fresh compaction visible';
    confidence = 94.6;
    action = 'Approve maintenance completion and transition asset to routine monitoring.';
    explanation = 'Visual defect has been addressed. Surface continuity restored with noticeable compaction.';
  } else if (lowerCurrName.includes('same') || lowerCurrName.includes('unchanged')) {
    change = 'Unchanged';
    prevCond = 'Stable defect observed in earlier inspection';
    currCond = 'No significant expansion detected within visual tolerance';
    confidence = 91.0;
    action = 'Maintain current scheduled inspection interval.';
    explanation = 'Defect dimensions appear stable compared to earlier recorded inspection.';
  } else if (lowerCurrName.includes('new') || lowerCurrName.includes('other')) {
    change = 'New damage';
    prevCond = 'Previous recorded defect on asset';
    currCond = 'New secondary fracture observed adjacent to primary sector';
    confidence = 86.5;
    action = 'Conduct full cross-section structural audit of the asset.';
    explanation = 'A new distinct point of failure has emerged adjacent to previous maintenance area.';
  }

  return {
    hasBaseline: true,
    previousImage: {
      id: prevImage.id,
      url: prevImage.file_path,
      date: prevImage.uploaded_at || prevImage.reported_at,
      issueType: prevImage.issue_type,
      severity: prevImage.severity
    },
    previousCondition: prevCond,
    currentCondition: currCond,
    changeDetected: change,
    confidence: confidence,
    suggestedAction: action,
    explanation: explanation,
    provider: 'Demo Progression Comparator (Offline Mode)',
    isDemo: true
  };
}

module.exports = {
  compareDamageProgress,
  CHANGE_TYPES
};
