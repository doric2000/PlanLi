const { HttpsError } = require('firebase-functions/v2/https');
const {
  fetchLegacyBilingualPlace,
  fetchLegacyLocalityPlaceId,
} = require('./legacyPlacesAdapter');
const { distanceKm, normalize } = require('./destinationIdentityService');

const NEW_AUTOCOMPLETE_FIELD_MASK = [
  'suggestions.placePrediction.placeId',
  'suggestions.placePrediction.structuredFormat',
  'suggestions.placePrediction.types',
].join(',');

const NEW_DETAILS_FIELD_MASK = [
  'id',
  'displayName',
  'addressComponents',
  'formattedAddress',
  'location',
  'viewport',
  'types',
  'primaryType',
  'businessStatus',
  'movedPlaceId',
].join(',');

function assert(condition, code, message) {
  if (!condition) throw new HttpsError(code, message);
}

function selectedProvider(value) {
  return String(value || 'legacy').trim().toLowerCase() === 'new' ? 'new' : 'legacy';
}

function providerKey({ provider, mapsKey, newPlacesKey }) {
  const key = selectedProvider(provider) === 'new' ? newPlacesKey : mapsKey;
  assert(typeof key === 'string' && key.trim(), 'failed-precondition',
    selectedProvider(provider) === 'new'
      ? 'GOOGLE_PLACES_NEW_KEY is not configured.'
      : 'GOOGLE_MAPS_KEY is not configured.');
  return key.trim();
}

async function parseGoogleResponse(response, { notFoundMessage = 'The selected place no longer exists.' } = {}) {
  if (response?.status === 429) {
    throw new HttpsError('resource-exhausted', 'Google Places quota is temporarily unavailable.');
  }
  if (response?.status === 404) throw new HttpsError('not-found', notFoundMessage);
  if (response?.status === 400) throw new HttpsError('invalid-argument', 'Google Places rejected the request.');
  if (response?.status === 401 || response?.status === 403) {
    throw new HttpsError('failed-precondition', 'Google Places is not configured correctly.');
  }
  if (!response?.ok) throw new HttpsError('unavailable', 'Google Places is temporarily unavailable.');
  return response.json();
}

function newComponentFor(details, types) {
  const components = Array.isArray(details?.addressComponents) ? details.addressComponents : [];
  for (const type of types) {
    const component = components.find((entry) => entry?.types?.includes(type));
    if (component) return component;
  }
  return null;
}

const LOCALITY_TYPES = [
  'locality',
  'postal_town',
  'administrative_area_level_3',
  'administrative_area_level_2',
  'administrative_area_level_1',
];

function newLocalityCandidatesFor(details) {
  const components = Array.isArray(details?.addressComponents) ? details.addressComponents : [];
  return Array.from(new Set(LOCALITY_TYPES.flatMap((type) =>
    components
      .filter((entry) => entry?.types?.includes(type))
      .map((entry) => String(entry.longText || '').trim())
      .filter(Boolean)
  )));
}

function parseNewLocalizedPlace(details) {
  assert(details && typeof details === 'object', 'failed-precondition', 'Google Places returned no result.');
  const country = newComponentFor(details, ['country']);
  const locality = newComponentFor(details, LOCALITY_TYPES);
  const lat = Number(details?.location?.latitude);
  const lng = Number(details?.location?.longitude);
  const lowLat = Number(details?.viewport?.low?.latitude);
  const lowLng = Number(details?.viewport?.low?.longitude);
  const highLat = Number(details?.viewport?.high?.latitude);
  const highLng = Number(details?.viewport?.high?.longitude);
  return {
    placeId: String(details.id || '').trim(),
    movedPlaceId: String(details.movedPlaceId || '').trim() || null,
    displayName: String(details?.displayName?.text || locality?.longText || '').trim(),
    address: String(details.formattedAddress || '').trim(),
    countryName: String(country?.longText || '').trim(),
    countryCode: String(country?.shortText || '').trim().toUpperCase(),
    localityName: String(locality?.longText || '').trim(),
    localityCandidates: newLocalityCandidatesFor(details),
    localityType: locality?.types?.find((type) => LOCALITY_TYPES.includes(type)) || null,
    coordinates: Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null,
    viewport: [lowLat, lowLng, highLat, highLng].every(Number.isFinite)
      ? {
          southwest: { lat: lowLat, lng: lowLng },
          northeast: { lat: highLat, lng: highLng },
        }
      : null,
    types: Array.from(new Set([
      ...(Array.isArray(details.types) ? details.types : []),
      ...(details.primaryType ? [details.primaryType] : []),
    ])).filter((type) => typeof type === 'string'),
    businessStatus: details.businessStatus || null,
    url: '',
  };
}

async function fetchNewPlaceDetails({
  placeId,
  newPlacesKey,
  language,
  sessionToken,
  fetchImpl = global.fetch,
}) {
  assert(typeof placeId === 'string' && placeId.trim().length >= 3, 'invalid-argument', 'placeId is invalid.');
  providerKey({ provider: 'new', newPlacesKey });
  const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId.trim())}`);
  url.searchParams.set('languageCode', language);
  if (sessionToken) url.searchParams.set('sessionToken', sessionToken);
  let response;
  try {
    response = await fetchImpl(url, {
      headers: {
        'X-Goog-Api-Key': newPlacesKey.trim(),
        'X-Goog-FieldMask': NEW_DETAILS_FIELD_MASK,
      },
    });
  } catch {
    throw new HttpsError('unavailable', 'Google Places is temporarily unavailable.');
  }
  return parseGoogleResponse(response);
}

async function fetchNewBilingualPlace({
  placeId,
  newPlacesKey,
  sessionToken,
  fetchImpl = global.fetch,
}) {
  const [heDetails, enDetails] = await Promise.all([
    fetchNewPlaceDetails({ placeId, newPlacesKey, language: 'he', sessionToken, fetchImpl }),
    fetchNewPlaceDetails({ placeId, newPlacesKey, language: 'en', sessionToken, fetchImpl }),
  ]);
  const he = parseNewLocalizedPlace(heDetails);
  const en = parseNewLocalizedPlace(enDetails);
  assert(he.placeId && he.placeId === en.placeId, 'failed-precondition',
    'Google Places returned inconsistent place details.');
  assert(!he.countryCode || !en.countryCode || he.countryCode === en.countryCode,
    'failed-precondition', 'Google Places returned inconsistent country details.');
  assert(!he.movedPlaceId || !en.movedPlaceId || he.movedPlaceId === en.movedPlaceId,
    'failed-precondition', 'Google Places returned inconsistent moved-place details.');
  if (he.movedPlaceId && he.movedPlaceId !== he.placeId) {
    throw new HttpsError('failed-precondition', 'This place has moved. Search for it again to use its current Google Place ID.');
  }
  return { he, en, fetchedAt: new Date() };
}

function normalizeNewPrediction(suggestion, randomSelectionId) {
  const prediction = suggestion?.placePrediction;
  const placeId = String(prediction?.placeId || '').trim();
  const text = String(prediction?.structuredFormat?.mainText?.text || '').trim();
  if (!placeId || !text) return null;
  return {
    selectionId: randomSelectionId(),
    placeId,
    text,
    secondaryText: String(prediction?.structuredFormat?.secondaryText?.text || '').trim(),
    types: Array.isArray(prediction.types)
      ? prediction.types.filter((type) => typeof type === 'string').slice(0, 12)
      : [],
  };
}

async function newAutocomplete({
  query,
  newPlacesKey,
  language = 'he',
  mode = 'places',
  sessionToken,
  fetchImpl = global.fetch,
  randomSelectionId,
}) {
  providerKey({ provider: 'new', newPlacesKey });
  let response;
  try {
    response = await fetchImpl('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': newPlacesKey.trim(),
        'X-Goog-FieldMask': NEW_AUTOCOMPLETE_FIELD_MASK,
      },
      body: JSON.stringify({
        input: query,
        languageCode: language,
        ...(sessionToken ? { sessionToken } : {}),
        ...(mode === 'destinations' ? { includedPrimaryTypes: ['(cities)'] } : {}),
        includePureServiceAreaBusinesses: false,
      }),
    });
  } catch {
    throw new HttpsError('unavailable', 'Google Places is temporarily unavailable.');
  }
  const payload = await parseGoogleResponse(response, { notFoundMessage: 'No matching places were found.' });
  return (Array.isArray(payload?.suggestions) ? payload.suggestions : [])
    .map((suggestion) => normalizeNewPrediction(suggestion, randomSelectionId))
    .filter(Boolean);
}

async function autocompletePlaces(options) {
  if (selectedProvider(options.provider) === 'new') return newAutocomplete(options);
  return options.legacyAutocomplete(options);
}

async function fetchBilingualPlace(options) {
  if (selectedProvider(options.provider) === 'new') return fetchNewBilingualPlace(options);
  return fetchLegacyBilingualPlace(options);
}

async function fetchNewLocalityPlaceId(options) {
  const wanted = normalize(options.localityName);
  assert(wanted, 'failed-precondition', 'The selected place has no trustworthy containing locality.');
  const predictions = await newAutocomplete({
    query: [options.localityName, options.countryName].filter(Boolean).join(' '),
    newPlacesKey: options.newPlacesKey,
    language: 'en',
    mode: 'destinations',
    sessionToken: options.sessionToken,
    fetchImpl: options.fetchImpl,
    randomSelectionId: () => '',
  });
  const matches = predictions.filter((prediction) => normalize(prediction.text) === wanted);
  const ids = [...new Set(matches.map((entry) => entry.placeId))];
  if (!ids.length) return null;
  const candidates = (await Promise.all(ids.slice(0, 5).map(async (placeId) => {
    const details = parseNewLocalizedPlace(await fetchNewPlaceDetails({
      placeId,
      newPlacesKey: options.newPlacesKey,
      language: 'en',
      sessionToken: options.sessionToken,
      fetchImpl: options.fetchImpl,
    }));
    const candidateName = normalize(details.localityName || details.displayName);
    const expectedCountry = String(options.countryCode || '').toUpperCase();
    if (candidateName !== wanted ||
        (expectedCountry && details.countryCode !== expectedCountry) ||
        !details.coordinates || !options.coordinates) return null;
    const typeIndex = LOCALITY_TYPES.indexOf(details.localityType);
    const priority = typeIndex < 0 ? LOCALITY_TYPES.length : typeIndex;
    return {
      placeId,
      priority,
      distanceKm: distanceKm(options.coordinates, details.coordinates),
    };
  }))).filter((entry) => entry && entry.distanceKm <= 50)
    .sort((left, right) => left.priority - right.priority ||
      left.distanceKm - right.distanceKm || left.placeId.localeCompare(right.placeId));
  if (!candidates.length) return null;
  const samePriority = candidates.filter((entry) => entry.priority === candidates[0].priority);
  if (samePriority.length > 1 && samePriority[1].distanceKm - samePriority[0].distanceKm < 5) {
    throw new HttpsError('failed-precondition',
      'The destination locality is ambiguous. Please select a more specific place.');
  }
  return candidates[0].placeId;
}

async function fetchLocalityPlaceId(options) {
  const localityNames = Array.from(new Set([
    ...(Array.isArray(options.localityCandidates) ? options.localityCandidates : []),
    options.localityName,
  ].map((value) => String(value || '').trim()).filter(Boolean))).slice(0, LOCALITY_TYPES.length);
  assert(localityNames.length, 'failed-precondition',
    'The selected place has no trustworthy containing locality.');
  for (const localityName of localityNames) {
    const request = { ...options, localityName };
    const placeId = selectedProvider(options.provider) === 'new'
      ? await fetchNewLocalityPlaceId(request)
      : await fetchLegacyLocalityPlaceId(request);
    if (placeId) return placeId;
  }
  return null;
}

module.exports = {
  NEW_AUTOCOMPLETE_FIELD_MASK,
  NEW_DETAILS_FIELD_MASK,
  autocompletePlaces,
  fetchBilingualPlace,
  fetchLocalityPlaceId,
  fetchNewBilingualPlace,
  fetchNewPlaceDetails,
  newAutocomplete,
  normalizeNewPrediction,
  parseNewLocalizedPlace,
  selectedProvider,
};
