const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildCanonicalDestination,
  destinationTypeForKind,
  parseArguments,
} = require('./reassignCanonicalDestination');

const registryEntry = {
  id: 'ni-ometepe',
  countryCode: 'NI',
  names: { he: 'אומטפה', en: 'Ometepe' },
  aliases: ['Ometepe', 'Moyogalpa'],
  kind: 'island',
  groupingPolicy: 'self',
  providerRefs: { googlePlaceId: 'google-ometepe' },
  center: { lat: 11.51, lng: -85.58 },
  viewport: {
    southwest: { lat: 11.3, lng: -85.8 },
    northeast: { lat: 11.7, lng: -85.4 },
  },
  googleTypes: ['island', 'natural_feature'],
  researchSources: [
    { title: 'Source one', url: 'https://example.com/one' },
    { title: 'Source two', url: 'https://example.com/two' },
  ],
  registryVersion: 1,
  status: 'active',
};

test('parseArguments is dry-run by default and reads an explicit apply request', () => {
  assert.deepEqual(parseArguments([
    '--country', 'NI', '--source-city', 'old', '--target-registry', 'ni-ometepe',
    '--reason', 'canonical repair', '--requested-by', 'admin', '--apply',
  ]), {
    apply: true,
    projectId: 'planli-f0b12',
    countryId: 'NI',
    sourceCityId: 'old',
    registryId: 'ni-ometepe',
    reason: 'canonical repair',
    requestedBy: 'admin',
  });
});

test('buildCanonicalDestination preserves approved names and provider identity', () => {
  const now = new Date('2026-08-27T12:00:00.000Z');
  const destination = buildCanonicalDestination({ countryId: 'NI', registryEntry, now });
  assert.equal(destination.schemaVersion, 3);
  assert.equal(destination.destinationType, 'island');
  assert.deepEqual(destination.googleCache.names, { he: 'אומטפה', en: 'Ometepe' });
  assert.deepEqual(destination.googleCache.nameSources, { he: 'admin', en: 'planli_registry' });
  assert.equal(destination.canonicalPolicy.registryId, 'ni-ometepe');
  assert.equal(destination.canonicalPolicy.approved, true);
  assert.equal(destination.providerRefs.googlePlaceId, 'google-ometepe');
  assert.equal(destination.googleCache.refreshAfter.toISOString(), '2026-09-20T12:00:00.000Z');
  assert.equal(destination.googleCache.expiresAt.toISOString(), '2026-09-24T12:00:00.000Z');
});

test('buildCanonicalDestination rejects country mismatches', () => {
  assert.throws(
    () => buildCanonicalDestination({ countryId: 'IN', registryEntry }),
    /does not match/
  );
});

test('destination kinds map to supported public destination types', () => {
  assert.equal(destinationTypeForKind('city_hub'), 'city');
  assert.equal(destinationTypeForKind('island'), 'island');
  assert.equal(destinationTypeForKind('tourism_region'), 'region');
  assert.equal(destinationTypeForKind('province'), 'region');
});
