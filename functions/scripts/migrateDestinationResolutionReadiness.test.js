const test = require('node:test');
const assert = require('node:assert/strict');

const {
  legacyPolicy,
  parseArguments,
  registryGeometryPatch,
} = require('./migrateDestinationResolutionReadiness');

test('destination readiness migration is dry-run by default', () => {
  assert.deepEqual(parseArguments([]), { projectId: 'planli-f0b12', apply: false });
  assert.equal(parseArguments(['--apply']).apply, true);
});

test('legacy active destination policy is provisional and exact-selection only', () => {
  const policy = legacyPolicy({
    countryCode: 'IL', countryId: 'IL', cityId: 'ness-ziona',
    destination: { destinationType: 'city' },
  });
  assert.equal(policy.approved, false);
  assert.equal(policy.provisional, true);
  assert.equal(policy.reviewState, 'pending');
  assert.equal(policy.kind, 'city_hub');
  assert.match(policy.registryId, /^il-legacy-/);
});

test('reviewed geometry and sane provider viewports remain eligible for automatic matching', () => {
  assert.equal(registryGeometryPatch('it-dolomites').geometryPolicy.autoMatchEligible, true);
  assert.equal(registryGeometryPatch('it-dolomites').radiusKm, 65);
  assert.equal(registryGeometryPatch('in-hampi').matchProfile.trust, 'trusted');
  assert.equal(registryGeometryPatch('in-hampi').radiusKm, 20);
  assert.equal(registryGeometryPatch('at-vienna').matchProfile.trust, 'trusted');
  assert.equal(registryGeometryPatch('at-vienna').providerIdentity.allowExactProviderMatch, false);
  assert.equal(registryGeometryPatch('it-lake-como').geometryPolicy.autoMatchEligible, false);
  assert.equal(registryGeometryPatch('it-lake-como').geometryPolicy.aliasAutoMatchEligible, false);
  assert.equal(registryGeometryPatch('it-lake-como', {
    kind: 'tourism_region',
    viewport: {
      southwest: { lat: 45.7, lng: 8.9 },
      northeast: { lat: 46.3, lng: 9.5 },
    },
  }).geometryPolicy.autoMatchEligible, true);
  assert.equal(registryGeometryPatch('it-lake-como', {
    kind: 'tourism_region',
    center: { lat: 46, lng: 9.2 },
    viewport: {
      southwest: { lat: 45.999, lng: 9.199 },
      northeast: { lat: 46.001, lng: 9.201 },
    },
  }).matchProfile.trust, 'trusted');
  assert.equal(registryGeometryPatch('zz-admin-quarantine', {
    kind: 'city_hub',
    center: { lat: 1, lng: 1 },
    radiusKm: 10,
    providerIdentity: { allowExactProviderMatch: false },
  }).providerIdentity.allowExactProviderMatch, false);
});
