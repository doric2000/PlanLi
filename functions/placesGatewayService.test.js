const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createResolvedPlaceToken,
  legacyAutocomplete,
  searchPlaces,
  verifyResolvedPlaceToken,
} = require('./placesGatewayService');

test('resolved place tokens are signed and tamper-evident', () => {
  const key = 'a-test-signing-key-with-enough-entropy';
  const token = createResolvedPlaceToken(key);
  assert.equal(verifyResolvedPlaceToken(token, key), true);
  assert.equal(verifyResolvedPlaceToken(`${token}x`, key), false);
  assert.equal(verifyResolvedPlaceToken(token, `${key}-wrong`), false);
});

test('legacy gateway autocomplete returns only bounded, client-safe prediction fields', async () => {
  const results = await legacyAutocomplete({
    query: 'Paris', mapsKey: 'key', mode: 'destinations',
    fetchImpl: async (url) => {
      const request = new URL(url);
      assert.equal(request.searchParams.get('types'), '(cities)');
      assert.equal(request.searchParams.get('language'), 'he');
      return { ok: true, json: async () => ({ status: 'OK', predictions: [{
        place_id: 'place-1', description: 'Paris, France', types: ['locality'],
        structured_formatting: { main_text: 'Paris', secondary_text: 'France' },
      }] }) };
    },
  });
  assert.deepEqual(results, [{ selectionId: results[0].selectionId, placeId: 'place-1', text: 'Paris', secondaryText: 'France', types: ['locality'] }]);
  assert.match(results[0].selectionId, /^sel_/);
});

test('search callable returns the Place ID required by the selection contract', async () => {
  const writes = [];
  const admin = {
    firestore: Object.assign(() => ({
      doc: () => ({ create: async (value) => writes.push(value) }),
    }), { FieldValue: { serverTimestamp: () => 'server-time' } }),
  };
  const result = await searchPlaces({
    admin,
    auth: { uid: 'user-1' },
    data: { query: 'Paris', mode: 'destinations' },
    mapsKey: 'key',
    providerRateLimitKey: 'rate-key',
    consumeBudget: async () => {},
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        status: 'OK',
        predictions: [{
          place_id: 'place-paris',
          description: 'Paris, France',
          structured_formatting: { main_text: 'Paris', secondary_text: 'France' },
          types: ['locality'],
        }],
      }),
    }),
  });
  assert.equal(result.predictions[0].placeId, 'place-paris');
  assert.equal(writes[0].predictions[0].placeId, 'place-paris');
});
