const test = require('node:test');
const assert = require('node:assert/strict');

const {
  legacyPolicy,
  parseArguments,
  registryGeometryPatch,
  registryPatchChanged,
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
  assert.match(policy.registryId, /^il-legacy-[a-f0-9]{16}$/);
});

test('legacy natural destinations keep a distinct review kind', () => {
  const policy = legacyPolicy({
    countryCode: 'PE', countryId: 'PE', cityId: 'humantay',
    destination: { destinationType: 'natural_feature' },
  });
  assert.equal(policy.kind, 'natural_feature');
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

test('registry migration ignores Firestore map key ordering after a successful apply', () => {
  const current = {
    registryVersion: 3,
    geometryPolicy: { source: 'provider_geometry_available', version: 3, autoMatchEligible: true },
    matchProfile: {
      trust: 'trusted',
      areas: [{ radiusKm: 20, center: { lng: 2, lat: 1 }, type: 'circle' }],
      version: 3,
    },
    providerIdentity: { source: 'geographic_provider_identity', compatible: true },
  };
  const sameValuesDifferentOrder = {
    geometryPolicy: { autoMatchEligible: true, version: 3, source: 'provider_geometry_available' },
    matchProfile: {
      version: 3,
      areas: [{ type: 'circle', center: { lat: 1, lng: 2 }, radiusKm: 20 }],
      trust: 'trusted',
    },
    providerIdentity: { compatible: true, source: 'geographic_provider_identity' },
  };
  assert.equal(registryPatchChanged(current, sameValuesDifferentOrder), false);
  assert.equal(registryPatchChanged(current, {
    ...sameValuesDifferentOrder,
    matchProfile: { ...sameValuesDifferentOrder.matchProfile, trust: 'blocked' },
  }), true);
});
