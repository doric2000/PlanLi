const test = require('node:test');
const assert = require('node:assert/strict');
const usage = require('./providerUsageService');
const { fetchWithGoogleMapsOAuth, fetchNewBilingualPlace } = require('./placesProviderAdapter');
const { computeRouteChunks } = require('./tripRouteService');
const { fetchReverseLocalityCandidates } = require('./placesProviderAdapter');
const { fetchGoogleReverseCountry } = require('./recommendationService');

test('reverse-geocode fallback preserves budget errors and makes no network request', async (t) => {
  t.mock.method(usage, 'reserveProviderUsage', async () => { throw usage.budgetError('provider_budget_unavailable'); });
  const options = { projectId: 'planli-f0b12', accessTokenProvider: async () => 'synthetic',
    fetchImpl: async () => assert.fail('Budget failure must not fetch'), coordinates: { lat: 1, lng: 2 } };
  await assert.rejects(fetchReverseLocalityCandidates(options), (e) => e.details.reason === 'provider_budget_unavailable');
  await assert.rejects(fetchGoogleReverseCountry(options.coordinates, options), (e) => e.details.reason === 'provider_budget_unavailable');
});

test('every retry and OAuth refresh reserves before the actual network attempt', async (t) => {
  let reserved = 0, calls = 0;
  t.mock.method(usage, 'reserveProviderUsage', async () => { reserved++; });
  const statuses = [503, 401, 200];
  await fetchWithGoogleMapsOAuth('https://places.googleapis.com/v1/places/test', { headers: { 'X-Goog-FieldMask': 'id' } }, {
    projectId: 'planli-f0b12', accessTokenProvider: async () => 'synthetic',
    fetchImpl: async (_, options) => { calls++; assert.equal(reserved, calls); assert.equal(options.redirect, 'error');
      const status = statuses.shift(); return { status, ok: status === 200 }; },
  });
  assert.equal(calls, 3);
});

test('failed admission never reaches fetch or provider retry handling', async (t) => {
  let reservations = 0, calls = 0;
  t.mock.method(usage, 'reserveProviderUsage', async () => { reservations++; throw usage.budgetError('provider_monthly_limit_reached'); });
  await assert.rejects(fetchWithGoogleMapsOAuth('https://places.googleapis.com/v1/places/test', {}, {
    projectId: 'planli-f0b12', accessTokenProvider: async () => 'synthetic', fetchImpl: async () => { calls++; },
  }), (e) => e.details.reason === 'provider_monthly_limit_reached');
  assert.equal(reservations, 1); assert.equal(calls, 0);
});

test('bilingual resolution and each route chunk reserve separately', async (t) => {
  const reservations = [];
  t.mock.method(usage, 'reserveProviderUsage', async (request) => { reservations.push(request); });
  await fetchNewBilingualPlace({ placeId: 'test-place', sessionToken: 'synthetic', projectId: 'planli-f0b12',
    accessTokenProvider: async () => 'synthetic', fetchImpl: async () => ({ ok: true, status: 200,
      json: async () => ({ id: 'test-place', addressComponents: [], location: { latitude: 1, longitude: 2 } }) }) });
  assert.equal(reservations.length, 2);
  await computeRouteChunks({ accessToken: 'synthetic', billingProject: 'planli-f0b12', travelMode: 'DRIVE',
    points: Array.from({ length: 24 }, (_, i) => ({ stopId: `s${i}`, coordinates: { lat: i, lng: i } })),
    fetchImpl: async () => ({ ok: true, json: async () => ({ routes: [{ polyline: { encodedPolyline: 'test' } }] }) }) });
  assert.equal(reservations.length, 5);
});
