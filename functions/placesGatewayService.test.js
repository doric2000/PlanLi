const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createResolvedPlaceToken,
  legacyAutocomplete,
  renewResolvedPlaceTokenLeases,
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

test('saving a private draft renews only the owner server binding without provider work', async () => {
  const key = 'a-test-signing-key-with-enough-entropy';
  const ownedToken = createResolvedPlaceToken(key);
  const foreignToken = createResolvedPlaceToken(key);
  const documents = new Map([
    [ownedToken, { uid: 'user-1', expiresAt: { toDate: () => new Date(Date.now() + 60_000) } }],
    [foreignToken, { uid: 'user-2', expiresAt: { toDate: () => new Date(Date.now() + 60_000) } }],
  ]);
  const writes = [];
  const admin = { firestore: () => ({
    doc: (path) => {
      const token = path.split('/').at(-1);
      return {
        get: async () => ({ exists: documents.has(token), data: () => documents.get(token) }),
        set: async (value, options) => writes.push({ token, value, options }),
      };
    },
  }) };

  const result = await renewResolvedPlaceTokenLeases({
    admin,
    auth: { uid: 'user-1' },
    resolvedPlaceTokens: [ownedToken, ownedToken, foreignToken, 'invalid-token'],
    providerRateLimitKey: key,
  });
  assert.equal(result.requested, 3);
  assert.equal(result.renewed, 1);
  assert.equal(result.skipped, 2);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].token, ownedToken);
  assert.equal(writes[0].options.merge, true);
  assert.ok(writes[0].value.expiresAt.getTime() > Date.now() + 20 * 24 * 60 * 60 * 1000);
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
