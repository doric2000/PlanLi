const test = require('node:test');
const assert = require('node:assert/strict');

const {
  NEW_AUTOCOMPLETE_FIELD_MASK,
  NEW_DETAILS_FIELD_MASK,
  fetchNewBilingualPlace,
  fetchLocalityPlaceId,
  newAutocomplete,
  parseNewLocalizedPlace,
} = require('./placesProviderAdapter');

function details(language) {
  return {
    id: 'place-paris',
    displayName: { text: language === 'he' ? 'פריז' : 'Paris', languageCode: language },
    formattedAddress: language === 'he' ? 'פריז, צרפת' : 'Paris, France',
    addressComponents: [
      { longText: language === 'he' ? 'פריז' : 'Paris', types: ['locality', 'political'] },
      { longText: language === 'he' ? 'צרפת' : 'France', shortText: 'FR', types: ['country', 'political'] },
    ],
    location: { latitude: 48.8566, longitude: 2.3522 },
    viewport: {
      low: { latitude: 48.815, longitude: 2.225 },
      high: { latitude: 48.902, longitude: 2.47 },
    },
    types: ['locality', 'political'],
    primaryType: 'locality',
    businessStatus: 'OPERATIONAL',
  };
}

test('Places API New autocomplete uses a session token and a minimal field mask', async () => {
  let request;
  const predictions = await newAutocomplete({
    query: 'Paris',
    newPlacesKey: 'new-key',
    language: 'he',
    sessionToken: 'session-1',
    randomSelectionId: () => 'sel-1',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        status: 200,
        json: async () => ({ suggestions: [{ placePrediction: {
          placeId: 'place-paris',
          structuredFormat: {
            mainText: { text: 'פריז' },
            secondaryText: { text: 'צרפת' },
          },
          types: ['locality'],
        } }] }),
      };
    },
  });
  assert.equal(request.url, 'https://places.googleapis.com/v1/places:autocomplete');
  assert.equal(request.options.headers['X-Goog-FieldMask'], NEW_AUTOCOMPLETE_FIELD_MASK);
  assert.deepEqual(JSON.parse(request.options.body), {
    input: 'Paris', languageCode: 'he', sessionToken: 'session-1', includePureServiceAreaBusinesses: false,
  });
  assert.deepEqual(predictions, [{
    selectionId: 'sel-1', placeId: 'place-paris', text: 'פריז', secondaryText: 'צרפת', types: ['locality'],
  }]);
});

test('Places API New fetches matching Hebrew and English details exactly once', async () => {
  const calls = [];
  const bilingual = await fetchNewBilingualPlace({
    placeId: 'place-paris',
    newPlacesKey: 'new-key',
    sessionToken: 'session-1',
    fetchImpl: async (url, options) => {
      const request = new URL(url);
      const language = request.searchParams.get('languageCode');
      calls.push(language);
      assert.equal(request.searchParams.get('sessionToken'), 'session-1');
      assert.equal(options.headers['X-Goog-FieldMask'], NEW_DETAILS_FIELD_MASK);
      return { ok: true, status: 200, json: async () => details(language) };
    },
  });
  assert.deepEqual(calls.sort(), ['en', 'he']);
  assert.equal(bilingual.he.displayName, 'פריז');
  assert.equal(bilingual.en.displayName, 'Paris');
  assert.equal(bilingual.en.countryCode, 'FR');
  assert.deepEqual(bilingual.en.viewport, {
    southwest: { lat: 48.815, lng: 2.225 },
    northeast: { lat: 48.902, lng: 2.47 },
  });
});

test('Places API New rejects conflicting bilingual identities and moved places', async () => {
  await assert.rejects(fetchNewBilingualPlace({
    placeId: 'place-paris', newPlacesKey: 'new-key',
    fetchImpl: async (url) => {
      const value = details(new URL(url).searchParams.get('languageCode'));
      if (new URL(url).searchParams.get('languageCode') === 'en') value.id = 'different';
      return { ok: true, status: 200, json: async () => value };
    },
  }), /inconsistent place details/);

  await assert.rejects(fetchNewBilingualPlace({
    placeId: 'place-paris', newPlacesKey: 'new-key',
    fetchImpl: async (url) => ({
      ok: true, status: 200,
      json: async () => ({ ...details(new URL(url).searchParams.get('languageCode')), movedPlaceId: 'place-paris-new' }),
    }),
  }), /place has moved/i);
});

test('Places API New maps quota and provider errors to retryable callable codes', async () => {
  await assert.rejects(newAutocomplete({
    query: 'Paris', newPlacesKey: 'new-key', randomSelectionId: () => 'sel',
    fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({}) }),
  }), (error) => error.code === 'resource-exhausted');
  await assert.rejects(newAutocomplete({
    query: 'Paris', newPlacesKey: 'new-key', randomSelectionId: () => 'sel',
    fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }),
  }), (error) => error.code === 'unavailable');
});

test('locality resolution prefers a city over a same-name administrative area', async () => {
  const placeId = await fetchLocalityPlaceId({
    provider: 'new',
    localityName: 'Cusco',
    countryName: 'Peru',
    countryCode: 'PE',
    coordinates: { lat: -13.516, lng: -71.978 },
    newPlacesKey: 'new-key',
    fetchImpl: async (url) => {
      if (String(url).includes('places:autocomplete')) {
        return { ok: true, status: 200, json: async () => ({ suggestions: [
          { placePrediction: { placeId: 'city', structuredFormat: { mainText: { text: 'Cusco' } }, types: ['locality'] } },
          { placePrediction: { placeId: 'admin', structuredFormat: { mainText: { text: 'Cusco' } }, types: ['administrative_area_level_3'] } },
        ] }) };
      }
      const id = decodeURIComponent(new URL(url).pathname.split('/').at(-1));
      const localityType = id === 'city' ? 'locality' : 'administrative_area_level_3';
      return { ok: true, status: 200, json: async () => ({
        id,
        displayName: { text: 'Cusco' },
        addressComponents: [
          { longText: 'Cusco', types: [localityType, 'political'] },
          { longText: 'Peru', shortText: 'PE', types: ['country', 'political'] },
        ],
        location: { latitude: -13.52, longitude: -71.98 },
        types: [localityType],
      }) };
    },
  });
  assert.equal(placeId, 'city');
});

test('locality resolution falls back from a district to its containing city', async () => {
  const venue = parseNewLocalizedPlace({
    id: 'wat-doi-kham',
    displayName: { text: 'Wat Phra That Doi Kham' },
    addressComponents: [
      { longText: 'Mueang Chiang Mai District', types: ['administrative_area_level_2'] },
      { longText: 'Chiang Mai', types: ['administrative_area_level_1'] },
      { longText: 'Thailand', shortText: 'TH', types: ['country'] },
    ],
    location: { latitude: 18.759, longitude: 98.918 },
    types: ['tourist_attraction', 'place_of_worship'],
  });
  assert.deepEqual(venue.localityCandidates, ['Mueang Chiang Mai District', 'Chiang Mai']);

  const searched = [];
  const placeId = await fetchLocalityPlaceId({
    provider: 'new',
    localityName: venue.localityName,
    localityCandidates: venue.localityCandidates,
    countryName: venue.countryName,
    countryCode: venue.countryCode,
    coordinates: venue.coordinates,
    newPlacesKey: 'new-key',
    fetchImpl: async (url, options) => {
      if (String(url).includes('places:autocomplete')) {
        const input = JSON.parse(options.body).input;
        searched.push(input);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            suggestions: input.startsWith('Chiang Mai ')
              ? [{ placePrediction: {
                  placeId: 'chiang-mai-city',
                  structuredFormat: { mainText: { text: 'Chiang Mai' } },
                  types: ['locality'],
                } }]
              : [],
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'chiang-mai-city',
          displayName: { text: 'Chiang Mai' },
          addressComponents: [
            { longText: 'Chiang Mai', types: ['locality'] },
            { longText: 'Thailand', shortText: 'TH', types: ['country'] },
          ],
          location: { latitude: 18.7883, longitude: 98.9853 },
          types: ['locality'],
        }),
      };
    },
  });

  assert.equal(placeId, 'chiang-mai-city');
  assert.deepEqual(searched, [
    'Mueang Chiang Mai District Thailand',
    'Chiang Mai Thailand',
  ]);
});
