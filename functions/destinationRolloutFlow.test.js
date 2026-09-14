const test = require('node:test');
const assert = require('node:assert/strict');
const { createDestinationMemoryAdmin } = require('./testSupport/destinationMemoryAdmin');
const { buildPlan, applyPlan, inventory } = require('./scripts/importReviewedDestinationCatalog');
const { resolveRecommendationDestination, resolveGoogleDestination, resolveDestinationFromToken, saveRecommendation } = require('./recommendationService');
const { registryEntriesForCountry, clearRegistryCache } = require('./canonicalDestinationRegistry');
const { createResolvedPlaceToken } = require('./placesGatewayService');
const auth = { uid: 'synthetic-owner', token: { email_verified: true, firebase: { sign_in_provider: 'password' } } };
const key = 'synthetic-provider-rate-limit-key';
const country = { code: 'AL', name: 'אלבניה', names: { he: 'אלבניה', en: 'Albania' }, status: 'active', region: 'Europe', currencyCode: 'ALL' };
const locality = { placeId: 'synthetic-ksamil', displayName: 'Ksamil', localityName: 'Ksamil',
  countryCode: 'AL', countryName: 'Albania', types: ['locality', 'political'], coordinates: { lat: 39.7637, lng: 19.9943 } };
const venue = { ...locality, placeId: 'synthetic-hotel', displayName: 'Absolute Hotel',
  address: 'Apollonia Street, Ksamil, Albania', types: ['hotel', 'lodging'],
  localityCandidates: ['Ksamil', 'Sarande'], coordinates: { lat: 39.7668, lng: 20.0001 } };
const content = { taxonomyVersion: 5, title: 'Synthetic hotel', description: 'Synthetic recommendation',
  category: 'Food', categoryId: 'food', tags: ['cafe'], budget: '$$', media: [],
  attributes: { audienceScope: 'all', audiences: [], vibes: ['relaxed'], environment: 'indoor', needs: [], needsConfirmed: false } };
function tokenFor(admin, place = venue, extra = {}) {
  const token = createResolvedPlaceToken(key);
  admin.documents.set(`system/runtime/resolvedPlaceTokens/${token}`, { uid: auth.uid, he: place, en: place,
    searchMode: 'places', expiresAt: new Date(Date.now() + 60_000), ...extra });
  return token;
}

test('a catalog locality classifies and publishes an exact hotel without any destination provider requests', async () => {
  clearRegistryCache();
  const admin = createDestinationMemoryAdmin({ 'countries/AL': country });
  const candidate = { id: 'al-ksamil', countryCode: 'AL', names: { he: 'קסאמיל', en: 'Ksamil' },
    aliases: ['Ksamil'], kind: 'city_hub', groupingPolicy: 'self', center: locality.coordinates,
    researchSources: [{ url: 'https://example.org/ksamil' }] };
  const plan = buildPlan(await inventory(admin.firestore()), { candidates: [candidate] });
  await applyPlan(admin.firestore(), plan, admin);
  const token = tokenFor(admin);
  const result = await resolveDestinationFromToken({ admin, auth, providerRateLimitKey: key, resolvedPlaceToken: token });
  assert.equal(result.cityId, plan.actions[0].cityId);
  assert.equal(result.providerCallCount, 0); assert.equal(result.place.placeId, venue.placeId);
  const saved = await saveRecommendation({ admin, auth, providerRateLimitKey: key, data: {
    resolvedPlaceToken: token, placeId: venue.placeId, recommendation: content } });
  assert.equal(saved.publicationStatus, 'active');
  assert.equal(admin.documents.get(`recommendations/${saved.recommendationId}`).destination.cityName, 'קסאמיל');
});

test('a newly verified locality asks only for its Hebrew name and the next hotel reuses it immediately', async () => {
  clearRegistryCache();
  const admin = createDestinationMemoryAdmin({ 'countries/AL': country });
  await registryEntriesForCountry(admin.firestore(), 'AL');
  const token = tokenFor(admin, { ...venue, placeId: 'synthetic-bar' }, { pendingDestinationNaming: { he: locality, en: locality } });
  const args = { admin, auth, providerRateLimitKey: key, data: { resolvedPlaceToken: token, supportsLocationRecovery: true } };
  const naming = await resolveRecommendationDestination(args);
  assert.equal(naming.status, 'destination_name_confirmation_required');
  assert.equal(naming.nameConfirmation.scope, 'containing_destination');
  assert.equal(naming.place.placeId, 'synthetic-bar');
  const named = await resolveRecommendationDestination({ ...args, data: { ...args.data, confirmedHebrewName: 'קסאמיל' } });
  assert.equal(named.status, 'resolved'); assert.equal(named.place.placeId, 'synthetic-bar');
  const saved = await saveRecommendation({ admin, auth, providerRateLimitKey: key,
    data: { resolvedPlaceToken: token, recommendation: content } });
  assert.equal(saved.publicationStatus, 'active');
  const hotelToken = tokenFor(admin);
  const revision = admin.documents.get('system/destinationRegistry').countryRevisions.AL;
  await saveRecommendation({ admin, auth, providerRateLimitKey: key,
    data: { resolvedPlaceToken: token, recommendation: { ...content, title: 'Another synthetic recommendation' } } });
  assert.equal(admin.documents.get('system/destinationRegistry').countryRevisions.AL, revision);
  const hotel = await resolveDestinationFromToken({ admin, auth, providerRateLimitKey: key, resolvedPlaceToken: hotelToken });
  assert.equal(hotel.cityId, saved.city.id); assert.equal(hotel.providerCallCount, 0);
  // Explicitly replay the old stale-registry path, which previously treated a boolean as a destination.
  const { catalogData } = require('./destinationCatalogService');
  admin.documents.set('destinationCatalog/synthetic-ksamil', catalogData({ countryId: 'AL', cityId: saved.city.id,
    country, city: hotel.cityData, timestamp: new Date() }));
  admin.documents.delete(`system/destinationRegistry/entries/${hotel.cityData.canonicalPolicy.registryId}`);
  clearRegistryCache();
  const legacy = await resolveGoogleDestination({ admin, placeId: venue.placeId,
    resolvedPlace: { he: venue, en: venue } });
  assert.equal(legacy.cityId, saved.city.id);
});

test('a transient destination failure preserves a verified venue but foreign token owners cannot recover it', async () => {
  const admin = createDestinationMemoryAdmin({ 'countries/AL': country });
  const token = tokenFor(admin);
  const db = admin.firestore(); const collection = db.collection;
  db.collection = path => { if (path === 'system/destinationRegistry/entries') throw new Error('Synthetic database unavailable'); return collection(path); };
  clearRegistryCache();
  const args = { admin, auth, providerRateLimitKey: key, data: { resolvedPlaceToken: token, supportsLocationRecovery: true } };
  const result = await resolveRecommendationDestination(args);
  assert.equal(result.status, 'destination_resolution_unavailable');
  assert.equal(result.place.placeId, venue.placeId); assert.equal(result.resolvedPlaceToken, token);
  assert.equal(result.destination, undefined);
  await assert.rejects(resolveRecommendationDestination({ ...args, auth: { ...auth, uid: 'different-owner' } }),
    error => ['permission-denied', 'unauthenticated'].includes(error.code));
});
