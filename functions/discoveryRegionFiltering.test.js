const test = require('node:test');
const assert = require('node:assert/strict');
const { matchesDiscoveryRegion } = require('./personalizationService');

test('recommendation discovery never leaks another or unclassified region', () => {
  assert.equal(matchesDiscoveryRegion({ discoveryRegionId: 'europe' }, 'europe'), true);
  assert.equal(matchesDiscoveryRegion({ discoveryRegionId: 'africa' }, 'europe'), false);
  assert.equal(matchesDiscoveryRegion({}, 'europe'), false);
  assert.equal(matchesDiscoveryRegion({}, null), true);
});

test('cross-region route is visible in each represented region only', () => {
  const route = { discoveryRegionMembership: { europe: true, israel: true } };
  assert.equal(matchesDiscoveryRegion(route, 'europe', { route: true }), true);
  assert.equal(matchesDiscoveryRegion(route, 'israel', { route: true }), true);
  assert.equal(matchesDiscoveryRegion(route, 'oceania', { route: true }), false);
});
