const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CANONICAL_TARGET,
  LEGACY_SOURCE,
  WRONG_TARGET,
  canonicalDestinationData,
  canonicalClaimEntries,
  classifyState,
  parseArguments,
  repairableClaimEntries,
  vloreRegistryEntry,
} = require('./restoreVloreCityDestination');

test('Vlore restoration is dry-run by default and uses the stable canonical ID', () => {
  assert.deepEqual(parseArguments([]), {
    apply: false,
    projectId: 'planli-f0b12',
    confirmProject: '',
    requestedBy: '',
  });
  assert.equal(CANONICAL_TARGET.cityName, 'ולורה');
  assert.equal(CANONICAL_TARGET.cityId, 'dst_g99_bYzJWzH2iMhbwibL');
});

test('Vlore registry entry is a trusted Hebrew city identity', () => {
  const entry = vloreRegistryEntry();
  assert.equal(entry.id, 'al-vlore');
  assert.equal(entry.kind, 'city_hub');
  assert.equal(entry.names.he, 'ולורה');
  assert.equal(entry.providerRefs.googlePlaceId, 'ChIJlRjM6PEzRRMRhg4-8ZoJMQ0');
  assert.equal(entry.matchProfile.trust, 'trusted');
});

test('Vlore identity claim accepts only the canonical destination entry', () => {
  assert.equal(canonicalClaimEntries({ entries: {
    [CANONICAL_TARGET.cityId]: { providerPlaceId: 'ChIJlRjM6PEzRRMRhg4-8ZoJMQ0' },
  } }), true);
  assert.equal(canonicalClaimEntries({ entries: {
    old: { providerPlaceId: 'ChIJlRjM6PEzRRMRhg4-8ZoJMQ0' },
    [CANONICAL_TARGET.cityId]: { providerPlaceId: 'ChIJlRjM6PEzRRMRhg4-8ZoJMQ0' },
  } }), false);
  assert.equal(repairableClaimEntries({ entries: {
    [LEGACY_SOURCE.cityId]: { providerPlaceId: 'ChIJlRjM6PEzRRMRhg4-8ZoJMQ0' },
    [CANONICAL_TARGET.cityId]: { providerPlaceId: 'ChIJlRjM6PEzRRMRhg4-8ZoJMQ0' },
  } }), true);
  assert.equal(repairableClaimEntries({ entries: {
    unrelated: { providerPlaceId: 'ChIJlRjM6PEzRRMRhg4-8ZoJMQ0' },
    [CANONICAL_TARGET.cityId]: { providerPlaceId: 'ChIJlRjM6PEzRRMRhg4-8ZoJMQ0' },
  } }), false);
});

test('canonical Vlore materialization preserves useful city data and removes provisional policy', () => {
  const data = canonicalDestinationData({
    source: {
      namingPolicyVersion: 1,
      googleCache: { names: { he: 'ולורה', en: 'Vlorë' } },
      travelFacts: { closestAirport: { iataCode: 'CFU' } },
    },
    wrongTarget: { destinationImage: { alt: 'Hotel Liro' } },
    registryEntry: vloreRegistryEntry(),
  });
  assert.equal(data.status, 'active');
  assert.equal(data.destinationType, 'city');
  assert.equal(data.canonicalPolicy.approved, true);
  assert.equal(data.canonicalPolicy.registryId, 'al-vlore');
  assert.equal(data.googleCache.names.he, 'ולורה');
  assert.equal(data.destinationImage.alt, 'Hotel Liro');
});

test('production state classifier accepts only the exact mistaken merge or corrected state', () => {
  const repair = classifyState({
    source: {
      status: 'inactive', mergedInto: WRONG_TARGET,
      googleCache: { names: { he: 'ולורה' } },
      providerRefs: { googlePlaceId: 'ChIJlRjM6PEzRRMRhg4-8ZoJMQ0' },
    },
    wrongTarget: { status: 'active', canonicalPolicy: { registryId: 'al-albanian-riviera' } },
    canonical: null,
    job: { status: 'complete', source: LEGACY_SOURCE, target: WRONG_TARGET },
    recommendation: {
      status: 'active', destination: WRONG_TARGET,
      place: { placeId: 'ChIJ586pMBsyRRMRVQBWpFYw2vg' },
    },
    route: { status: 'active', destinationKeys: [`AL:${WRONG_TARGET.cityId}`] },
    registry: null,
  });
  assert.equal(repair, 'repair');
  assert.throws(() => classifyState({}), /changed unexpectedly/);
});
