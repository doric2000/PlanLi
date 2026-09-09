const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { FLOWS, selectFlows, parseFlows } = require('./flowPlan');
test('Android flows follow changed behavior, including shared auth and media consumers', () => {
  assert.deepEqual(selectFlows(['README.md', 'functions/weather.js']), []);
  assert.deepEqual(selectFlows(['client/src/features/home/HomeScreen.js']), ['guest']);
  assert.deepEqual(selectFlows(['client/src/components/RecommendationHero.js']), ['gallery']);
  assert.deepEqual(selectFlows(['client/src/services/LocationService.js']), ['publish', 'network']);
  assert.deepEqual(selectFlows(['client/src/config/firebase.js']), FLOWS);
  assert.deepEqual(selectFlows(['storage.rules']), FLOWS);
  assert.deepEqual(selectFlows(['scripts/setupAndroid.ps1']), FLOWS);
  assert.deepEqual(parseFlows('gallery,auth,gallery'), ['gallery', 'auth']);
  assert.throws(() => parseFlows('typo'));
});
test('every selected scenario has a deterministic Maestro flow', () => {
  for (const flow of [...FLOWS.filter((item) => item !== 'network'), 'network-start', 'network-error', 'network-recovery', 'negative']) {
    const contents = fs.readFileSync(path.resolve(__dirname, '../../client/.maestro/android', `${flow}.yml`), 'utf8');
    assert.match(contents, /appId: com\.planli\.planlitravels\.e2e/);
    assert.doesNotMatch(contents, /assertWithAI|assertNoDefectsWithAI|extractTextWithAI/);
    assert.match(contents, /assertVisible|assertNotVisible/);
  }
});

test('a generic smoke flow cannot satisfy missing coverage for an unvisited screen or web provider', () => {
  const { runtimeFlowsForSource } = require('./flowPlan');
  assert.deepEqual(selectFlows(['client/src/features/trips/TripEditor.js']), ['guest']);
  assert.deepEqual(runtimeFlowsForSource('client/src/features/trips/TripEditor.js'), []);
  assert.deepEqual(runtimeFlowsForSource('client/src/config/appCheck.web.js'), []);
  assert.deepEqual(runtimeFlowsForSource('client/src/components/RecommendationHero.js'), ['gallery']);
  assert.deepEqual(runtimeFlowsForSource('client/src/components/ExactLocationPicker.js'), []);
  assert.deepEqual(runtimeFlowsForSource('client/src/features/community/screens/CreateRecommendationScreen.js'), ['publish', 'network']);
});
