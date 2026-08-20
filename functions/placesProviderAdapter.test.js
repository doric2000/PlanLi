const test = require('node:test');
const assert = require('node:assert/strict');

const {
  NEW_AUTOCOMPLETE_FIELD_MASK,
  NEW_DETAILS_FIELD_MASK,
  NEW_SELECTION_DETAILS_FIELD_MASK,
  autocompletePlaces,
  fetchWithProviderPolicy,
  fetchNewBilingualPlace,
  fetchNewSelectionPlace,
  fetchLocalityPlaceId,
  localityAliases,
  newAutocomplete,
  parseNewLocalizedPlace,
  providerEndpointFor,
  providerRequestContext,
} = require('./placesProviderAdapter');

test('Thai tambon prefixes normalize to the same locality alias as Google locality details', () => {
  assert.deepEqual(localityAliases('Tambon Wiang Chai'), ['wiang chai', 'tambon wiang chai']);
});

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
  assert.deepEqual(searched, ['Chiang Mai Thailand']);
});

test('ordinary exact-place selection uses one Essentials details request', async () => {
  const calls = [];
  const selected = await fetchNewSelectionPlace({
    prediction: {
      placeId: 'hotel-chiang-rai',
      text: 'One Budget Hotel Chiangrai Soi Sawan',
      types: ['lodging'],
    },
    newPlacesKey: 'new-key',
    sessionToken: 'session-1',
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), fieldMask: options.headers['X-Goog-FieldMask'] });
      return { ok: true, status: 200, json: async () => ({
        id: 'hotel-chiang-rai',
        formattedAddress: 'Chiang Rai, Thailand',
        addressComponents: [
          { longText: 'Amphoe Mueang Chiang Rai', types: ['administrative_area_level_2'] },
          { longText: 'Chang Wat Chiang Rai', types: ['administrative_area_level_1'] },
          { longText: 'Thailand', shortText: 'TH', types: ['country'] },
        ],
        location: { latitude: 19.8587, longitude: 99.8416 },
        types: ['lodging'],
      }) };
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].fieldMask, NEW_SELECTION_DETAILS_FIELD_MASK);
  assert.equal(new URL(calls[0].url).searchParams.get('languageCode'), 'en');
  assert.equal(selected.he.displayName, 'One Budget Hotel Chiangrai Soi Sawan');
  assert.equal(selected.en.countryCode, 'TH');
});

test('Chiang Rai district aliases resolve through one exact-coordinate reverse lookup', async () => {
  const venue = parseNewLocalizedPlace({
    id: 'one-budget-hotel-chiangrai',
    displayName: { text: 'One Budget Hotel Chiangrai Soi Sawan' },
    addressComponents: [
      { longText: 'Amphoe Mueang Chiang Rai', types: ['administrative_area_level_2'] },
      { longText: 'Chang Wat Chiang Rai', types: ['administrative_area_level_1'] },
      { longText: 'Thailand', shortText: 'TH', types: ['country'] },
    ],
    location: { latitude: 19.8587, longitude: 99.8416 },
    types: ['lodging'],
  });
  const requestContext = providerRequestContext();
  const urls = [];
  const placeId = await fetchLocalityPlaceId({
    provider: 'new',
    localityName: venue.localityName,
    localityCandidates: venue.localityCandidates,
    countryName: venue.countryName,
    countryCode: venue.countryCode,
    coordinates: venue.coordinates,
    mapsKey: 'maps-key',
    newPlacesKey: 'new-key',
    requestContext,
    fetchImpl: async (url) => {
      urls.push(String(url));
      return { ok: true, status: 200, json: async () => ({
        status: 'OK',
        results: [{
          place_id: 'chiang-rai-city',
          types: ['locality', 'political'],
          address_components: [
            { long_name: 'Thailand', short_name: 'TH', types: ['country'] },
          ],
          geometry: { location: { lat: 19.9105, lng: 99.8406 } },
        }],
      }) };
    },
  });

  assert.equal(placeId, 'chiang-rai-city');
  assert.equal(requestContext.count, 1);
  assert.equal(urls.length, 1);
  assert.match(urls[0], /geocode\/json/);
});

test('provider retry cannot exceed the ten-request ceiling', async () => {
  const requestContext = providerRequestContext({ count: 9, maximum: 10 });
  let calls = 0;
  await assert.rejects(fetchWithProviderPolicy(
    'https://places.googleapis.com/v1/places:test',
    {},
    {
      requestContext,
      fetchImpl: async () => {
        calls += 1;
        return { ok: false, status: 503, json: async () => ({}) };
      },
    }
  ), (error) => error.code === 'resource-exhausted');
  assert.equal(calls, 1);
  assert.equal(requestContext.count, 10);
});

test('legacy rollback requests use the same timeout, retry, and request counter', async () => {
  const requestContext = providerRequestContext();
  let calls = 0;
  const predictions = await autocompletePlaces({
    provider: 'legacy',
    requestContext,
    fetchImpl: async () => {
      calls += 1;
      return { ok: true, status: 200 };
    },
    legacyAutocomplete: async ({ fetchImpl }) => {
      const response = await fetchImpl('https://maps.googleapis.com/maps/api/place/autocomplete/json');
      assert.equal(response.ok, true);
      return [{ placeId: 'legacy-place' }];
    },
  });

  assert.deepEqual(predictions, [{ placeId: 'legacy-place' }]);
  assert.equal(calls, 1);
  assert.equal(requestContext.count, 1);
});

test('provider endpoint diagnostics never include a Place ID or query', () => {
  assert.equal(
    providerEndpointFor('https://places.googleapis.com/v1/places/private-place-id?languageCode=en'),
    'places_details'
  );
  assert.equal(
    providerEndpointFor('https://maps.googleapis.com/maps/api/geocode/json?latlng=1,2&key=secret'),
    'geocode'
  );
});
