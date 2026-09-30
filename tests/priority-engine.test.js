const test = require('node:test');
const assert = require('node:assert');
const {
  calculatePriority,
  calculateSeverityScore,
  calculateSafetyRiskScore,
  calculateAssetConditionScore,
  calculateWaitingTimeScore,
  calculatePreviousComplaintScore,
  clamp
} = require('../services/priority-engine-service');

test('Priority Engine Test Suite', async (t) => {

  await t.test('1. CRITICAL Priority Calculation', () => {
    const criticalRequest = {
      severity: 'CRITICAL',
      issueType: 'Pothole',
      publicImpactScore: 90,
      assetImportanceScore: 95,
      locationImportanceScore: 90,
      previousComplaintScore: 95,
      assetConditionScore: 95,
      waitingTimeScore: 90
    };

    const result = calculatePriority(criticalRequest);
    assert.strictEqual(result.priorityLevel, 'CRITICAL', 'Level should be CRITICAL');
    assert.ok(result.priorityScore >= 81, `Score should be >= 81, got ${result.priorityScore}`);
    assert.ok(result.explanation.includes('Priority: CRITICAL'), 'Explanation should state Priority: CRITICAL');
    assert.ok(result.explanation.includes('Reasons:'), 'Explanation should contain reasons');
  });

  await t.test('2. HIGH Priority Calculation', () => {
    const highRequest = {
      severity: 'HIGH',
      issueType: 'Broken streetlight',
      publicImpactScore: 70,
      assetImportanceScore: 70,
      locationImportanceScore: 70,
      previousComplaintScore: 60,
      assetConditionScore: 70,
      waitingTimeScore: 50
    };

    const result = calculatePriority(highRequest);
    assert.strictEqual(result.priorityLevel, 'HIGH', 'Level should be HIGH');
    assert.ok(result.priorityScore >= 61 && result.priorityScore <= 80, `Score should be between 61 and 80, got ${result.priorityScore}`);
    assert.ok(result.explanation.includes('Priority: HIGH'));
  });

  await t.test('3. MEDIUM Priority Calculation', () => {
    const mediumRequest = {
      severity: 'MEDIUM',
      issueType: 'Road crack',
      publicImpactScore: 40,
      assetImportanceScore: 40,
      locationImportanceScore: 50,
      previousComplaintScore: 30,
      assetConditionScore: 40,
      waitingTimeScore: 30
    };

    const result = calculatePriority(mediumRequest);
    assert.strictEqual(result.priorityLevel, 'MEDIUM', 'Level should be MEDIUM');
    assert.ok(result.priorityScore >= 31 && result.priorityScore <= 60, `Score should be between 31 and 60, got ${result.priorityScore}`);
    assert.ok(result.explanation.includes('Priority: MEDIUM'));
  });

  await t.test('4. LOW Priority Calculation', () => {
    const lowRequest = {
      severity: 'LOW',
      issueType: 'No issue detected',
      publicImpactScore: 10,
      assetImportanceScore: 20,
      locationImportanceScore: 20,
      previousComplaintScore: 10,
      assetConditionScore: 15,
      waitingTimeScore: 10
    };

    const result = calculatePriority(lowRequest);
    assert.strictEqual(result.priorityLevel, 'LOW', 'Level should be LOW');
    assert.ok(result.priorityScore <= 30, `Score should be <= 30, got ${result.priorityScore}`);
    assert.ok(result.explanation.includes('Priority: LOW'));
  });

  await t.test('5. Missing Data Handling (Graceful Fallback)', () => {
    // Request with completely empty/null fields
    const emptyRequest = {};

    const result = calculatePriority(emptyRequest);
    assert.ok(result.priorityScore >= 0 && result.priorityScore <= 100, 'Score should be valid number even with missing data');
    assert.ok(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(result.priorityLevel), 'Level should be valid enum');
    assert.ok(result.factorScores.severityScore !== undefined, 'Factor scores should have defaults');
    assert.ok(result.factorScores.safetyRiskScore !== undefined);
    assert.ok(result.explanation && result.explanation.length > 0, 'Explanation should be generated');
  });

  await t.test('6. Invalid Values Handling', () => {
    const invalidRequest = {
      severity: 'SUPER_EXTREME_INVALID_SEVERITY',
      issueType: 12345, // invalid type
      safetyRiskScore: -999, // negative
      publicImpactScore: 99999, // overflow
      assetImportanceScore: NaN, // NaN
      locationImportanceScore: 'random_text', // non-numeric
      previousComplaintScore: null,
      assetConditionScore: undefined,
      waitingTimeScore: -50
    };

    const result = calculatePriority(invalidRequest);
    assert.ok(!isNaN(result.priorityScore), 'Priority score should not be NaN');
    assert.ok(result.priorityScore >= 0 && result.priorityScore <= 100, 'Priority score must be clamped between 0 and 100');
    assert.ok(result.factorScores.publicImpactScore <= 100, 'Overflown score should be clamped to 100');
    assert.ok(result.factorScores.safetyRiskScore >= 0, 'Negative score should be clamped to 0');
  });

  await t.test('7. Configurable Weights Testing', () => {
    const customWeights = {
      severity: 0.80, // Heavy bias on severity
      safetyRisk: 0.10,
      publicImpact: 0.02,
      assetImportance: 0.02,
      locationImportance: 0.02,
      previousComplaints: 0.02,
      assetCondition: 0.01,
      waitingTime: 0.01
    };

    const request = {
      severity: 'CRITICAL',
      issueType: 'Other infrastructure damage',
      publicImpactScore: 10,
      assetImportanceScore: 10,
      locationImportanceScore: 10,
      previousComplaintScore: 10,
      assetConditionScore: 10,
      waitingTimeScore: 10
    };

    const result = calculatePriority(request, customWeights);
    // Because severity is 80% of weight and severity is CRITICAL (95), score should be heavily pulled high
    assert.ok(result.priorityScore >= 75, `Expected score pulled high by 80% severity weight, got ${result.priorityScore}`);
  });

});
