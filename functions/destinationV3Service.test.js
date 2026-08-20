const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDestinationV3, chooseLocalityCandidate, destinationClaimId } = require('./destinationV3Service');

function place(overrides = {}) {
  return {
    placeId: 'place-paris', displayName: 'Paris', localityName: 'Paris', countryCode: 'FR',
    coordinates: { lat: 48.8566, lng: 2.3522 }, types: ['locality'], ...overrides,
  };
}

test('v3 destination stores bilingual Google cache with bounded lifetime', () => {
  const fetchedAt = new Date('2026-08-11T00:00:00.000Z');
  const result = buildDestinationV3({
    countryId: 'cty-fr',
    he: place({ displayName: 'פריז', localityName: 'פריז' }),
    en: place(),
    fetchedAt,
  });
  assert.match(result.id, /^dst_[A-Za-z0-9_-]{20}$/);
  assert.equal(result.data.schemaVersion, 3);
  assert.deepEqual(result.data.googleCache.names, { he: 'פריז', en: 'Paris' });
  assert.equal(result.data.destinationType, 'city');
  assert.equal(result.data.googleCache.refreshAfter.toISOString(), '2026-09-04T00:00:00.000Z');
  assert.equal(result.data.googleCache.expiresAt.toISOString(), '2026-09-08T00:00:00.000Z');
});

test('locality candidate requires an exact normalized name, country and 50km radius', () => {
  const selected = chooseLocalityCandidate([
    { id: 'wrong-country', nameEn: 'Paris', countryCode: 'US', coordinates: { lat: 33.66, lng: -95.55 } },
    { id: 'wrong-name', nameEn: 'Parish', countryCode: 'FR', coordinates: { lat: 48.85, lng: 2.35 } },
    { id: 'far', nameEn: 'Paris', countryCode: 'FR', coordinates: { lat: 43.29, lng: 5.37 } },
    { id: 'valid', nameEn: 'Paris', countryCode: 'FR', coordinates: { lat: 48.86, lng: 2.34 } },
  ], { countryCode: 'FR', localityName: 'Paris', coordinates: { lat: 48.8566, lng: 2.3522 } });
  assert.equal(selected.id, 'valid');
});

test('a tie between equally valid locality candidates is rejected', () => {
  assert.throws(() => chooseLocalityCandidate([
    { id: 'one', nameEn: 'Cusco', countryCode: 'PE', coordinates: { lat: -13.516, lng: -71.978 } },
    { id: 'two', nameEn: 'Cusco', countryCode: 'PE', coordinates: { lat: -13.516, lng: -71.978 } },
  ], { countryCode: 'PE', localityName: 'Cusco', coordinates: { lat: -13.516, lng: -71.978 } }), /ambiguous/);
});

test('secondary claims are deterministic and distinct by destination type', () => {
  assert.equal(
    destinationClaimId({ countryId: 'cty-it', type: 'lake', nameEn: 'Lake Garda' }),
    destinationClaimId({ countryId: 'cty-it', type: 'lake', nameEn: 'Lake Garda' })
  );
  assert.notEqual(
    destinationClaimId({ countryId: 'cty-it', type: 'lake', nameEn: 'Lake Garda' }),
    destinationClaimId({ countryId: 'cty-it', type: 'region', nameEn: 'Lake Garda' })
  );
});
