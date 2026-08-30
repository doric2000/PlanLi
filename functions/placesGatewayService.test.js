const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createResolvedPlaceToken,
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
    projectId: 'planli-f0b12',
    accessTokenProvider: async () => 'oauth-token',
    providerRateLimitKey: 'rate-key',
    consumeBudget: async () => {},
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        suggestions: [{ placePrediction: {
          placeId: 'place-paris',
          structuredFormat: {
            mainText: { text: 'Paris' },
            secondaryText: { text: 'France' },
          },
          types: ['locality'],
        } }],
      }),
    }),
  });
  assert.equal(result.predictions[0].placeId, 'place-paris');
  assert.equal(writes[0].predictions[0].placeId, 'place-paris');
  assert.equal(writes[0].mode, 'destinations');
});

test('search callable rejects invalid location bias before calling Google', async () => {
  let providerCalled = false;
  await assert.rejects(searchPlaces({
    admin: { firestore: () => ({}) },
    auth: { uid: 'user-1' },
    data: { query: 'Hampi', mode: 'places', locationBias: { lat: 95, lng: 76 } },
    projectId: 'planli-f0b12',
    accessTokenProvider: async () => 'oauth-token',
    providerRateLimitKey: 'rate-key',
    consumeBudget: async () => {},
    fetchImpl: async () => { providerCalled = true; },
  }), (error) => String(error.code).includes('invalid-argument'));
  assert.equal(providerCalled, false);
});
