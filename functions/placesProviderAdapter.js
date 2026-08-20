const { HttpsError } = require('firebase-functions/v2/https');
const { locationLog } = require('./locationDiagnostics');
const {
  fetchLegacyBilingualPlace,
  fetchLegacyLocalityPlaceId,
} = require('./legacyPlacesAdapter');
const { distanceKm, normalize } = require('./destinationIdentityService');

const PROVIDER_REQUEST_TIMEOUT_MS = 6000;
const MAX_PROVIDER_REQUESTS_PER_ATTEMPT = 10;
const MAX_PROVIDER_ATTEMPTS = 2;
const MAX_LOCALITY_QUERIES = 2;
const MAX_LOCALITY_CANDIDATES_PER_QUERY = 3;

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
  'movedPlaceId',
].join(',');

const NEW_SELECTION_DETAILS_FIELD_MASK = [
  'id',
  'addressComponents',
  'formattedAddress',
  'location',
  'types',
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

function providerRequestContext(value = {}) {
  const context = value && typeof value === 'object' ? value : {};
  if (!Number.isFinite(context.count)) context.count = 0;
  if (!Number.isFinite(context.maximum)) context.maximum = MAX_PROVIDER_REQUESTS_PER_ATTEMPT;
  return context;
}

function consumeProviderRequest(context) {
  const tracker = providerRequestContext(context);
  if (tracker.count >= tracker.maximum) {
    throw new HttpsError(
      'resource-exhausted',
      'Location resolution reached its safe Google request limit.'
    );
  }
  tracker.count += 1;
  return tracker;
}

function retryableResponse(response) {
  return response?.status === 429 || Number(response?.status || 0) >= 500;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function providerEndpointFor(value) {
  const url = String(value || '');
  if (url.includes('/v1/places:autocomplete')) return 'places_autocomplete';
  if (url.includes('/v1/places/')) return 'places_details';
  if (url.includes('/place/autocomplete/')) return 'legacy_autocomplete';
  if (url.includes('/place/details/')) return 'legacy_details';
  if (url.includes('/geocode/')) return 'geocode';
  return 'google_provider';
}

function logProviderAttempt(requestContext, url, startedAt, providerStatus, outcome) {
  if (!requestContext?.incidentId) return;
  locationLog('provider', {
    incidentId: requestContext.incidentId,
    outcome,
    durationMs: Date.now() - startedAt,
    providerCalls: requestContext.count,
    providerEndpoint: providerEndpointFor(url),
    providerStatus,
  });
}

async function fetchWithProviderPolicy(url, options = {}, {
  fetchImpl = global.fetch,
  requestContext,
  timeoutMs = PROVIDER_REQUEST_TIMEOUT_MS,
} = {}) {
  let lastError = null;
  for (let attempt = 0; attempt < MAX_PROVIDER_ATTEMPTS; attempt += 1) {
    consumeProviderRequest(requestContext);
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { ...options, signal: controller.signal });
      logProviderAttempt(
        requestContext,
        url,
        startedAt,
        Number(response?.status || 0) || 'unknown',
        response?.ok ? 'succeeded' : 'failed'
      );
      if (!retryableResponse(response) || attempt === MAX_PROVIDER_ATTEMPTS - 1) return response;
      lastError = new Error(`Google provider returned HTTP ${response.status}.`);
    } catch (error) {
      lastError = error;
      logProviderAttempt(
        requestContext,
        url,
        startedAt,
        error?.name === 'AbortError' ? 'timeout' : 'network_error',
        'failed'
      );
      if (attempt === MAX_PROVIDER_ATTEMPTS - 1) break;
    } finally {
      clearTimeout(timeout);
    }
    await wait(250 + Math.floor(Math.random() * 250));
  }
  if (lastError?.name === 'AbortError') {
    throw new HttpsError('deadline-exceeded', 'Google Places took too long to respond.');
  }
  throw new HttpsError('unavailable', 'Google Places is temporarily unavailable.');
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
  requestContext,
  fieldMask = NEW_DETAILS_FIELD_MASK,
}) {
  assert(typeof placeId === 'string' && placeId.trim().length >= 3, 'invalid-argument', 'placeId is invalid.');
  providerKey({ provider: 'new', newPlacesKey });
  const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId.trim())}`);
  url.searchParams.set('languageCode', language);
  if (sessionToken) url.searchParams.set('sessionToken', sessionToken);
  const response = await fetchWithProviderPolicy(url, {
    headers: {
      'X-Goog-Api-Key': newPlacesKey.trim(),
      'X-Goog-FieldMask': fieldMask,
    },
  }, { fetchImpl, requestContext });
  return parseGoogleResponse(response);
}

async function fetchNewBilingualPlace({
  placeId,
  newPlacesKey,
  sessionToken,
  fetchImpl = global.fetch,
  requestContext,
}) {
  const [heDetails, enDetails] = await Promise.all([
    fetchNewPlaceDetails({ placeId, newPlacesKey, language: 'he', sessionToken, fetchImpl, requestContext }),
    fetchNewPlaceDetails({ placeId, newPlacesKey, language: 'en', sessionToken, fetchImpl, requestContext }),
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

async function fetchNewSelectionPlace({ prediction, ...options }) {
  const predictionTypes = new Set(prediction?.types || []);
  const selectedIsDestination = [
    'locality',
    'postal_town',
    'administrative_area_level_3',
    'administrative_area_level_2',
    'administrative_area_level_1',
    'natural_feature',
    'island',
  ].some((type) => predictionTypes.has(type));
  if (selectedIsDestination) {
    return fetchNewBilingualPlace({ ...options, placeId: prediction.placeId });
  }
  const details = await fetchNewPlaceDetails({
    ...options,
    placeId: prediction.placeId,
    language: 'en',
    fieldMask: NEW_SELECTION_DETAILS_FIELD_MASK,
  });
  const parsed = parseNewLocalizedPlace(details);
  if (parsed.movedPlaceId && parsed.movedPlaceId !== parsed.placeId) {
    throw new HttpsError('failed-precondition',
      'This place has moved. Search for it again to use its current Google Place ID.');
  }
  const exactName = String(prediction?.text || '').trim() || parsed.displayName;
  const exact = { ...parsed, displayName: exactName };
  return { he: exact, en: exact, fetchedAt: new Date() };
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
  coordinates,
  requestContext,
}) {
  providerKey({ provider: 'new', newPlacesKey });
  const response = await fetchWithProviderPolicy(
    'https://places.googleapis.com/v1/places:autocomplete',
    {
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
        ...(coordinates ? {
          locationBias: {
            circle: {
              center: { latitude: coordinates.lat, longitude: coordinates.lng },
              radius: 50000,
            },
          },
        } : {}),
        includePureServiceAreaBusinesses: false,
      }),
    },
    { fetchImpl, requestContext }
  );
  const payload = await parseGoogleResponse(response, { notFoundMessage: 'No matching places were found.' });
  return (Array.isArray(payload?.suggestions) ? payload.suggestions : [])
    .map((suggestion) => normalizeNewPrediction(suggestion, randomSelectionId))
    .filter(Boolean);
}

async function autocompletePlaces(options) {
  if (selectedProvider(options.provider) === 'new') return newAutocomplete(options);
  return options.legacyAutocomplete({
    ...options,
    fetchImpl: legacyPolicyFetch(options),
  });
}

async function fetchBilingualPlace(options) {
  if (selectedProvider(options.provider) === 'new') return fetchNewBilingualPlace(options);
  return fetchLegacyBilingualPlace({
    ...options,
    fetchImpl: legacyPolicyFetch(options),
  });
}

function legacyPolicyFetch(options) {
  const fetchImpl = options.fetchImpl || global.fetch;
  return (url, requestOptions = {}) => fetchWithProviderPolicy(url, requestOptions, {
    fetchImpl,
    requestContext: options.requestContext,
  });
}

async function fetchNewLocalityPlaceId(options) {
  const wantedAliases = localityAliases(options.localityName);
  const wanted = wantedAliases[0];
  assert(wanted, 'failed-precondition', 'The selected place has no trustworthy containing locality.');
  const predictions = await newAutocomplete({
    query: [options.localityName, options.countryName].filter(Boolean).join(' '),
    newPlacesKey: options.newPlacesKey,
    language: 'en',
    mode: 'destinations',
    sessionToken: options.sessionToken,
    fetchImpl: options.fetchImpl,
    randomSelectionId: () => '',
    coordinates: options.coordinates,
    requestContext: options.requestContext,
  });
  const matches = predictions.filter((prediction) =>
    localityAliases(prediction.text).some((alias) => wantedAliases.includes(alias))
  );
  const ids = [...new Set(matches.map((entry) => entry.placeId))];
  if (!ids.length) return null;
  const candidates = (await Promise.all(ids.slice(0, MAX_LOCALITY_CANDIDATES_PER_QUERY).map(async (placeId) => {
    const details = parseNewLocalizedPlace(await fetchNewPlaceDetails({
      placeId,
      newPlacesKey: options.newPlacesKey,
      language: 'en',
      sessionToken: options.sessionToken,
      fetchImpl: options.fetchImpl,
      requestContext: options.requestContext,
    }));
    const candidateNames = localityAliases(details.localityName || details.displayName);
    const expectedCountry = String(options.countryCode || '').toUpperCase();
    if (!candidateNames.some((alias) => wantedAliases.includes(alias)) ||
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

async function fetchPlaceSelection(options) {
  if (selectedProvider(options.provider) === 'new') return fetchNewSelectionPlace(options);
  return fetchLegacyBilingualPlace({
    ...options,
    placeId: options.prediction.placeId,
    fetchImpl: legacyPolicyFetch(options),
  });
}

const ADMINISTRATIVE_NAME_PREFIXES = [
  'tambon',
  'amphoe',
  'mueang',
  'muang',
  'chang wat',
  'province of',
  'province',
  'district of',
  'district',
  'county of',
  'county',
  'prefecture',
  'governorate',
  'qarku i',
];
const ADMINISTRATIVE_NAME_SUFFIXES = [
  'district',
  'province',
  'county',
  'prefecture',
  'governorate',
];

function localityAliases(value) {
  const original = normalize(value);
  if (!original) return [];
  const aliases = new Set([original]);
  let stripped = original;
  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of ADMINISTRATIVE_NAME_PREFIXES) {
      if (stripped.startsWith(`${prefix} `)) {
        stripped = stripped.slice(prefix.length + 1).trim();
        aliases.add(stripped);
        changed = true;
        break;
      }
    }
  }
  for (const suffix of ADMINISTRATIVE_NAME_SUFFIXES) {
    if (stripped.endsWith(` ${suffix}`)) aliases.add(stripped.slice(0, -(suffix.length + 1)).trim());
  }
  return [...aliases].filter(Boolean).sort((left, right) => left.length - right.length);
}

function localitySearchNames(options) {
  const values = [
    ...(Array.isArray(options.localityCandidates) ? options.localityCandidates : []),
    options.localityName,
  ];
  const result = [];
  const seen = new Set();
  for (const value of values) {
    const raw = String(value || '').trim();
    const aliases = localityAliases(raw);
    for (const alias of aliases) {
      if (!alias || seen.has(alias)) continue;
      seen.add(alias);
      result.push({
        query: alias === normalize(raw)
          ? raw
          : alias.replace(/\b[a-z]/g, (character) => character.toUpperCase()),
        normalized: alias,
      });
    }
  }
  return result
    .sort((left, right) => left.normalized.length - right.normalized.length || left.normalized.localeCompare(right.normalized))
    .slice(0, MAX_LOCALITY_QUERIES)
    .map((entry) => entry.query);
}

function legacyComponent(result, type) {
  return (Array.isArray(result?.address_components) ? result.address_components : [])
    .find((entry) => entry?.types?.includes(type));
}

async function fetchReverseLocalityPlaceId(options) {
  if (!options.mapsKey || !options.coordinates) return null;
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('latlng', `${options.coordinates.lat},${options.coordinates.lng}`);
  url.searchParams.set(
    'result_type',
    'locality|postal_town|administrative_area_level_3|administrative_area_level_2|administrative_area_level_1'
  );
  url.searchParams.set('language', 'en');
  url.searchParams.set('key', options.mapsKey);
  let response;
  try {
    response = await fetchWithProviderPolicy(url, {}, {
      fetchImpl: options.fetchImpl,
      requestContext: options.requestContext,
    });
  } catch (error) {
    if (String(error?.code || '').replace(/^functions\//, '') === 'resource-exhausted') throw error;
    return null;
  }
  if (!response?.ok) return null;
  const payload = await response.json();
  if (payload?.status === 'ZERO_RESULTS') return null;
  if (payload?.status === 'OVER_QUERY_LIMIT') {
    throw new HttpsError('resource-exhausted', 'Google Places quota is temporarily unavailable.');
  }
  if (payload?.status !== 'OK' || !Array.isArray(payload.results)) return null;
  const expectedCountry = String(options.countryCode || '').toUpperCase();
  const candidates = payload.results.map((result) => {
    const placeId = String(result?.place_id || '').trim();
    const country = legacyComponent(result, 'country');
    const countryCode = String(country?.short_name || '').toUpperCase();
    const typeIndex = LOCALITY_TYPES.findIndex((type) => result?.types?.includes(type));
    const lat = Number(result?.geometry?.location?.lat);
    const lng = Number(result?.geometry?.location?.lng);
    const coordinates = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
    if (!placeId || typeIndex < 0 || !coordinates || (expectedCountry && countryCode !== expectedCountry)) return null;
    return { placeId, priority: typeIndex, distanceKm: distanceKm(options.coordinates, coordinates) };
  }).filter((entry) => entry && entry.distanceKm <= 50)
    .sort((left, right) => left.priority - right.priority || left.distanceKm - right.distanceKm);
  if (!candidates.length) return null;
  if (candidates.length > 1 && candidates[0].priority === candidates[1].priority &&
      candidates[1].distanceKm - candidates[0].distanceKm < 5) {
    throw new HttpsError('failed-precondition',
      'The destination locality is ambiguous. Please select a more specific place.');
  }
  return candidates[0].placeId;
}

async function fetchLocalityPlaceId(options) {
  const localityNames = localitySearchNames(options);
  assert(localityNames.length, 'failed-precondition',
    'The selected place has no trustworthy containing locality.');
  const reversePlaceId = await fetchReverseLocalityPlaceId(options);
  if (reversePlaceId) return reversePlaceId;
  for (const localityName of localityNames) {
    const request = { ...options, localityName };
    const placeId = selectedProvider(options.provider) === 'new'
      ? await fetchNewLocalityPlaceId(request)
      : await fetchLegacyLocalityPlaceId({
          ...request,
          fetchImpl: legacyPolicyFetch(request),
        });
    if (placeId) return placeId;
  }
  return null;
}

module.exports = {
  NEW_AUTOCOMPLETE_FIELD_MASK,
  NEW_DETAILS_FIELD_MASK,
  NEW_SELECTION_DETAILS_FIELD_MASK,
  MAX_PROVIDER_REQUESTS_PER_ATTEMPT,
  autocompletePlaces,
  fetchBilingualPlace,
  fetchLocalityPlaceId,
  fetchNewBilingualPlace,
  fetchNewPlaceDetails,
  fetchNewSelectionPlace,
  fetchPlaceSelection,
  fetchReverseLocalityPlaceId,
  fetchWithProviderPolicy,
  localityAliases,
  localitySearchNames,
  newAutocomplete,
  normalizeNewPrediction,
  parseNewLocalizedPlace,
  providerEndpointFor,
  providerRequestContext,
  selectedProvider,
};
