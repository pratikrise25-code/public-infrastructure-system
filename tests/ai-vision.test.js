const fs = require('fs');
const path = require('path');
const { analyzeInfrastructureImage, EnhancedLocalVisionClassifier, ISSUE_TYPES } = require('../services/ai-vision-service');
const { PNG } = require('pngjs');

async function runComprehensiveTests() {
  console.log('======================================================');
  console.log('  NAGARDRISTI AI VISION DETECTION TEST SUITE');
  console.log('======================================================');

  let passed = 0;
  let total = 0;

  function assert(condition, name, details = '') {
    total++;
    if (condition) {
      console.log(`  ✔ [PASS] ${name}`);
      passed++;
    } else {
      console.error(`  ✖ [FAIL] ${name} - ${details}`);
    }
  }

  const workspaceDir = path.resolve(__dirname, '..');

  // 1. Test Pothole
  const potholeRes = await analyzeInfrastructureImage(path.join(workspaceDir, 'public/assets/sample-pothole.jpg'), 'camera_001.jpg', 'image/jpeg', 2470);
  assert(potholeRes.isIdentified === true, 'Pothole is identified');
  assert(potholeRes.issueType === 'Pothole', 'Pothole category detected', `got ${potholeRes.issueType}`);
  assert(potholeRes.confidence >= 75, 'Pothole confidence is realistic', `got ${potholeRes.confidence}%`);
  assert(potholeRes.suggestedAction === 'Road maintenance required', 'Pothole suggested action correct');

  // 2. Test Road crack
  const crackRes = await analyzeInfrastructureImage(path.join(workspaceDir, 'public/assets/sample-roadcrack.jpg'), 'IMG_8842.jpg', 'image/jpeg', 2101);
  assert(crackRes.isIdentified === true, 'Road crack is identified');
  assert(crackRes.issueType === 'Road crack', 'Road crack category detected', `got ${crackRes.issueType}`);
  assert(crackRes.confidence >= 75, 'Road crack confidence is realistic', `got ${crackRes.confidence}%`);

  // 3. Test Broken streetlight
  const lightRes = await analyzeInfrastructureImage(path.join(workspaceDir, 'public/assets/sample-streetlight.jpg'), 'photo_night.jpg', 'image/jpeg', 1390);
  assert(lightRes.isIdentified === true, 'Broken streetlight is identified');
  assert(lightRes.issueType === 'Broken streetlight', 'Broken streetlight category detected', `got ${lightRes.issueType}`);
  assert(lightRes.suggestedAction === 'Electrical repair required', 'Streetlight suggested action correct');

  // 4. Test Water leakage
  const leakRes = await analyzeInfrastructureImage(path.join(workspaceDir, 'public/assets/sample-waterleak.jpg'), 'pavement_shot.jpg', 'image/jpeg', 8029);
  assert(leakRes.isIdentified === true, 'Water leakage is identified');
  assert(leakRes.issueType === 'Water leakage', 'Water leakage category detected', `got ${leakRes.issueType}`);
  assert(leakRes.suggestedAction === 'Pipe repair required', 'Water leakage action is pipe repair');

  // 5. Test Garbage / waste
  const garbageRes = await analyzeInfrastructureImage(path.join(workspaceDir, 'public/assets/sample-garbage.jpg'), 'street_corner.jpg', 'image/jpeg', 1975);
  assert(garbageRes.isIdentified === true, 'Garbage/waste is identified');
  assert(garbageRes.issueType === 'Garbage/waste', 'Garbage/waste category detected', `got ${garbageRes.issueType}`);
  assert(garbageRes.suggestedAction === 'Sanitation clearance required', 'Garbage action is sanitation clearance');

  // 6. Test Damaged footpath
  const footpathRes = await analyzeInfrastructureImage(path.join(workspaceDir, 'public/assets/sample-sidewalk.jpg'), 'walkway.jpg', 'image/jpeg', 2158);
  assert(footpathRes.isIdentified === true, 'Damaged footpath is identified');
  assert(footpathRes.issueType === 'Damaged footpath', 'Damaged footpath category detected', `got ${footpathRes.issueType}`);

  // 7. Test Repaired / Non-damaged road (Must abstain)
  const repairedRes = await analyzeInfrastructureImage(path.join(workspaceDir, 'public/assets/sample-repaired.jpg'), 'smooth_road.jpg', 'image/jpeg', 1285);
  assert(repairedRes.isIdentified === false, 'Repaired road image abstains from false detection');
  assert(repairedRes.issueType === 'Unable to Identify', 'Repaired road returns Unable to Identify', `got ${repairedRes.issueType}`);
  assert(repairedRes.confidence === 0, 'Repaired road has zero confidence');

  // 8. Test Blank White Image
  const whitePng = new PNG({ width: 120, height: 120 });
  whitePng.data.fill(255);
  const whiteBuf = PNG.sync.write(whitePng);
  const tmpWhitePath = path.join(workspaceDir, 'scratch_tmp_white.png');
  fs.writeFileSync(tmpWhitePath, whiteBuf);
  const whiteRes = await analyzeInfrastructureImage(tmpWhitePath, 'white.png', 'image/png', whiteBuf.length);
  assert(whiteRes.isIdentified === false, 'Blank white image abstains');
  assert(whiteRes.issueType === 'Unable to Identify', 'Blank white image returns Unable to Identify', `got ${whiteRes.issueType}`);
  assert(whiteRes.issueType !== 'Water leakage', 'Never defaults to Water leakage for blank image');

  // 9. Test Solid Black Image
  const blackPng = new PNG({ width: 120, height: 120 });
  blackPng.data.fill(0);
  const blackBuf = PNG.sync.write(blackPng);
  const tmpBlackPath = path.join(workspaceDir, 'scratch_tmp_black.png');
  fs.writeFileSync(tmpBlackPath, blackBuf);
  const blackRes = await analyzeInfrastructureImage(tmpBlackPath, 'black.png', 'image/png', blackBuf.length);
  assert(blackRes.isIdentified === false, 'Solid black image abstains');
  assert(blackRes.issueType === 'Unable to Identify', 'Solid black image returns Unable to Identify');

  // 10. Test Solid Blue Image (Uniform color screen, NOT a real leak)
  const solidBluePng = new PNG({ width: 120, height: 120 });
  for (let i = 0; i < solidBluePng.data.length; i += 4) {
    solidBluePng.data[i] = 10;
    solidBluePng.data[i + 1] = 80;
    solidBluePng.data[i + 2] = 230;
    solidBluePng.data[i + 3] = 255;
  }
  const blueBuf = PNG.sync.write(solidBluePng);
  const tmpBluePath = path.join(workspaceDir, 'scratch_tmp_blue.png');
  fs.writeFileSync(tmpBluePath, blueBuf);
  const blueRes = await analyzeInfrastructureImage(tmpBluePath, 'blue.png', 'image/png', blueBuf.length);
  assert(blueRes.isIdentified === false, 'Solid blue screen abstains (not real leak)');
  assert(blueRes.issueType === 'Unable to Identify', 'Solid blue screen returns Unable to Identify');

  // 11. Test Portrait / Face / Selfie
  const facePng = new PNG({ width: 120, height: 120 });
  for (let i = 0; i < facePng.data.length; i += 4) {
    facePng.data[i] = 210;     // R
    facePng.data[i + 1] = 160; // G
    facePng.data[i + 2] = 135; // B (Peach skin tone)
    facePng.data[i + 3] = 255;
  }
  const faceBuf = PNG.sync.write(facePng);
  const tmpFacePath = path.join(workspaceDir, 'scratch_tmp_face.png');
  fs.writeFileSync(tmpFacePath, faceBuf);
  const faceRes = await analyzeInfrastructureImage(tmpFacePath, 'selfie.png', 'image/png', faceBuf.length);
  assert(faceRes.isIdentified === false, 'Selfie/portrait image abstains');
  assert(faceRes.issueType === 'Unable to Identify', 'Selfie returns Unable to Identify');

  // 12. Verify Controlled Category Compliance
  const testedResults = [potholeRes, crackRes, lightRes, leakRes, garbageRes, footpathRes, repairedRes, whiteRes];
  for (const r of testedResults) {
    assert(ISSUE_TYPES.includes(r.issueType), `Category "${r.issueType}" is in controlled list`);
  }

  // Clean up temp files
  try { fs.unlinkSync(tmpWhitePath); } catch (e) {}
  try { fs.unlinkSync(tmpBlackPath); } catch (e) {}
  try { fs.unlinkSync(tmpBluePath); } catch (e) {}
  try { fs.unlinkSync(tmpFacePath); } catch (e) {}

  console.log('======================================================');
  console.log(`  RESULTS: ${passed} / ${total} tests PASSED!`);
  console.log('======================================================');

  if (passed !== total) {
    process.exit(1);
  }
}

runComprehensiveTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
