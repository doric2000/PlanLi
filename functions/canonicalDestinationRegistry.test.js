const test = require('node:test');
const assert = require('node:assert/strict');

const { CANDIDATES, REGIONAL_COUNTS } = require('./data/canonicalDestinationCandidates');
const {
  BUILTIN_POLICIES,
  canonicalDestinationId,
  matchCanonicalEntry,
  validateRegistryEntry,
} = require('./canonicalDestinationRegistry');

test('researched catalog stays within the approved size and regional allocation', () => {
  assert.equal(CANDIDATES.length, 251);
  assert.deepEqual(REGIONAL_COUNTS, {
    europe: 101, asia: 80, central_america: 30, south_america: 40,
  });
  assert.equal(new Set(CANDIDATES.map((entry) => entry.id)).size, CANDIDATES.length);
  CANDIDATES.forEach((entry) => {
    const validation = validateRegistryEntry(entry, { requireProviderIdentity: false });
    assert.deepEqual(validation.errors, [], `${entry.id}: ${validation.errors.join(', ')}`);
  });
});

test('materialized entries require provider identity and geometry', () => {
  const candidate = CANDIDATES[0];
  assert.deepEqual(validateRegistryEntry(candidate).errors.sort(), [
    'missing_geometry', 'missing_google_place_id',
  ]);
});

test('known India locality resolves to Munnar by canonical containment', () => {
  const match = matchCanonicalEntry(BUILTIN_POLICIES, {
    countryCode: 'IN',
    providerPlaceId: 'ChIJu0gDvfqaBzsRa-1qeuM3j24',
    aliases: ['Kannan Devan Hills', 'Rajamalai'],
    coordinates: { lat: 10.1430336, lng: 77.0397969 },
  });
  assert.equal(match.entry.id, 'in-munnar');
  assert.equal(match.entry.names.he, 'מונאר');
});

test('India address descriptor aliases can resolve an approved hub', () => {
  const match = matchCanonicalEntry(BUILTIN_POLICIES, {
    countryCode: 'IN', aliases: ['Munnar'], coordinates: { lat: 10.13, lng: 77.04 },
  });
  assert.equal(match.source, 'canonical_alias_and_geometry');
  assert.equal(match.entry.id, 'in-munnar');
});

test('Ojo de Agua resolves to Ometepe and not Rivas', () => {
  const match = matchCanonicalEntry(BUILTIN_POLICIES, {
    countryCode: 'NI', aliases: ['Tilgue'],
    coordinates: { lat: 11.5190588, lng: -85.5669624 },
  });
  assert.equal(match.entry.id, 'ni-ometepe');
  assert.equal(match.entry.names.he, 'אומטפה');
});

test('approved child wins over island parent while Corfu groups Perama to the island', () => {
  const paphos = matchCanonicalEntry(BUILTIN_POLICIES, {
    countryCode: 'CY', aliases: ['Paphos'], coordinates: { lat: 34.7754, lng: 32.4245 },
  });
  assert.equal(paphos.entry.id, 'cy-paphos');
  const corfu = matchCanonicalEntry(BUILTIN_POLICIES, {
    countryCode: 'GR', aliases: ['Perama'], coordinates: { lat: 39.58, lng: 19.91 },
  });
  assert.equal(corfu.entry.id, 'gr-corfu');
});

test('Chiang Mai and Chiang Rai preserve province destinations', () => {
  const mai = matchCanonicalEntry(BUILTIN_POLICIES, {
    countryCode: 'TH', aliases: ['Chiang Mai Province'], coordinates: { lat: 18.7, lng: 98.9 },
  });
  const rai = matchCanonicalEntry(BUILTIN_POLICIES, {
    countryCode: 'TH', aliases: ['Chiang Rai Province'], coordinates: { lat: 20.0, lng: 99.9 },
  });
  assert.equal(mai.entry.kind, 'province');
  assert.equal(rai.entry.kind, 'province');
  assert.notEqual(canonicalDestinationId('TH', mai.entry.id), canonicalDestinationId('TH', rai.entry.id));
});

test('a unique approved province alias wins before approximate fallback geometry', () => {
  const match = matchCanonicalEntry(BUILTIN_POLICIES, {
    countryCode: 'TH',
    aliases: ['Chiang Mai Province'],
    coordinates: { lat: 20.05, lng: 98.95 },
  });
  assert.equal(match.entry.id, 'th-chiang-mai');
  assert.equal(match.source, 'canonical_alias');
});
