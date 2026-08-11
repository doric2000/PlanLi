const test = require('node:test');
const assert = require('node:assert/strict');

const {
  destinationTypeFor,
  fetchLegacyBilingualPlace,
  googleCacheFor,
} = require('./legacyPlacesAdapter');

function result(language) {
  return {
    status: 'OK',
    result: {
      place_id: 'place-paris',
      name: language === 'he' ? 'פריז' : 'Paris',
      formatted_address: language === 'he' ? 'פריז, צרפת' : 'Paris, France',
      address_components: [
        { long_name: language === 'he' ? 'פריז' : 'Paris', types: ['locality', 'political'] },
        { long_name: language === 'he' ? 'צרפת' : 'France', short_name: 'FR', types: ['country', 'political'] },
      ],
      geometry: { location: { lat: 48.8566, lng: 2.3522 } },
      types: ['locality', 'political'],
    },
  };
}

test('legacy adapter fetches Hebrew and English details once each into an expiring cache', async () => {
  const calls = [];
  const bilingual = await fetchLegacyBilingualPlace({
    placeId: 'place-paris',
    mapsKey: 'test-key',
    fetchImpl: async (url) => {
      const language = url.searchParams.get('language');
      calls.push(language);
      return { ok: true, json: async () => result(language) };
    },
  });
  assert.deepEqual(calls.sort(), ['en', 'he']);
  const cache = googleCacheFor(bilingual);
  assert.deepEqual(cache.names, { he: 'פריז', en: 'Paris' });
  assert.equal(cache.countryCode, 'FR');
  assert.equal(cache.refreshAfter.getTime() - cache.fetchedAt.getTime(), 24 * 24 * 60 * 60 * 1000);
  assert.equal(cache.expiresAt.getTime() - cache.fetchedAt.getTime(), 28 * 24 * 60 * 60 * 1000);
});

test('area destinations remain typed instead of being forced into cities', () => {
  assert.equal(destinationTypeFor({ types: ['natural_feature'], displayName: 'Lake Garda' }), 'lake');
  assert.equal(destinationTypeFor({ types: ['island'], displayName: 'Rhodes' }), 'island');
  assert.equal(destinationTypeFor({ types: ['administrative_area_level_1'], displayName: 'Tuscany' }), 'region');
});
