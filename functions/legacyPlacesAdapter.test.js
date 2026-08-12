const test = require('node:test');
const assert = require('node:assert/strict');

const {
  destinationTypeFor,
  fetchLegacyBilingualPlace,
  googleCacheFor,
  parseLocalizedPlace,
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
      geometry: {
        location: { lat: 48.8566, lng: 2.3522 },
        viewport: {
          northeast: { lat: 48.902, lng: 2.47 },
          southwest: { lat: 48.815, lng: 2.225 },
        },
      },
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
  assert.deepEqual(cache.viewport, {
    northeast: { lat: 48.902, lng: 2.47 },
    southwest: { lat: 48.815, lng: 2.225 },
  });
  assert.equal(cache.refreshAfter.getTime() - cache.fetchedAt.getTime(), 24 * 24 * 60 * 60 * 1000);
  assert.equal(cache.expiresAt.getTime() - cache.fetchedAt.getTime(), 28 * 24 * 60 * 60 * 1000);
});

test('legacy adapter rejects conflicting bilingual country codes', async () => {
  await assert.rejects(
    fetchLegacyBilingualPlace({
      placeId: 'place-paris',
      mapsKey: 'test-key',
      fetchImpl: async (url) => {
        const language = url.searchParams.get('language');
        const payload = result(language);
        if (language === 'en') {
          payload.result.address_components.at(-1).short_name = 'US';
        }
        return { ok: true, json: async () => payload };
      },
    }),
    /inconsistent country details/
  );
});

test('area destinations remain typed instead of being forced into cities', () => {
  assert.equal(destinationTypeFor({ types: ['natural_feature'], displayName: 'Lake Garda' }), 'lake');
  assert.equal(destinationTypeFor({ types: ['island'], displayName: 'Rhodes' }), 'island');
  assert.equal(destinationTypeFor({ types: ['administrative_area_level_1'], displayName: 'Tuscany' }), 'region');
});

test('legacy place parsing preserves the full containing locality hierarchy', () => {
  const place = parseLocalizedPlace({
    place_id: 'wat-doi-kham',
    name: 'Wat Phra That Doi Kham',
    address_components: [
      { long_name: 'Mueang Chiang Mai District', types: ['administrative_area_level_2'] },
      { long_name: 'Chiang Mai', types: ['administrative_area_level_1'] },
      { long_name: 'Thailand', short_name: 'TH', types: ['country'] },
    ],
    geometry: { location: { lat: 18.759, lng: 98.918 } },
    types: ['tourist_attraction'],
  });

  assert.equal(place.localityName, 'Mueang Chiang Mai District');
  assert.deepEqual(place.localityCandidates, ['Mueang Chiang Mai District', 'Chiang Mai']);
});
