const { HttpsError } = require('firebase-functions/v2/https');
const { locationLog } = require('./locationDiagnostics');
const { distanceKm, normalize } = require('./destinationIdentityService');
const {
  billingProjectId,
  getGoogleMapsAccessToken,
} = require('./googleMapsOAuth');
const { DESTINATION_AUTOCOMPLETE_TYPES } = require('./destinationResolutionPolicy');

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
  'addressDescriptor',
].join(',');

const NEW_CONTAINING_PLACES_FIELD_MASK = 'containingPlaces';

function assert(condition, code, message) {
  if (!condition) throw new HttpsError(code, message);
}

function selectedProvider(value) {
  const provider = String(value || 'new').trim().toLowerCase();
  assert(provider === 'new', 'failed-precondition', 'The legacy Google Places provider is disabled.');
  return provider;
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

async function fetchWithGoogleMapsOAuth(url, options = {}, {
  fetchImpl = global.fetch,
  requestContext,
  timeoutMs = PROVIDER_REQUEST_TIMEOUT_MS,
  accessTokenProvider = getGoogleMapsAccessToken,
  projectId,
} = {}) {
  const quotaProject = billingProjectId(projectId);
  const execute = async (forceRefresh) => {
    const token = await accessTokenProvider({ forceRefresh });
    assert(typeof token === 'string' && token.trim(), 'failed-precondition',
      'Google Maps OAuth credentials are unavailable.');
    return fetchWithProviderPolicy(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${token.trim()}`,
        'X-Goog-User-Project': quotaProject,
      },
    }, { fetchImpl, requestContext, timeoutMs });
  };
  const response = await execute(false);
  return response?.status === 401 ? execute(true) : response;
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

function localityTypesForCountry(countryCode) {
  if (String(countryCode || '').toUpperCase() !== 'TH') return LOCALITY_TYPES;
  return [
    'administrative_area_level_1',
    ...LOCALITY_TYPES.filter((type) => type !== 'administrative_area_level_1'),
  ];
}

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
    addressDescriptorCandidates: [
      ...(details?.addressDescriptor?.areas || []),
      ...(details?.addressDescriptor?.landmarks || []).filter((entry) => entry?.spatialRelationship === 'WITHIN'),
    ].map((entry) => ({
      placeId: String(entry?.placeId || '').trim(),
      name: String(entry?.displayName?.text || '').trim(),
      containment: entry?.containment || entry?.spatialRelationship || null,
    })).filter((entry) => entry.placeId || entry.name),
  };
}

async function fetchNewContainingPlaces(options) {
  const details = await fetchNewPlaceDetails({
    ...options,
    language: 'en',
    fieldMask: NEW_CONTAINING_PLACES_FIELD_MASK,
  });
  return (Array.isArray(details?.containingPlaces) ? details.containingPlaces : [])
    .map((entry) => ({
      placeId: String(entry?.id || entry?.placeId || '').trim(),
      name: String(entry?.displayName?.text || '').trim(),
      types: Array.isArray(entry?.types) ? entry.types : [],
    }))
    .filter((entry) => entry.placeId || entry.name);
}

async function fetchNewPlaceDetails({
  placeId,
  language,
  sessionToken,
  fetchImpl = global.fetch,
  requestContext,
  fieldMask = NEW_DETAILS_FIELD_MASK,
  accessTokenProvider,
  projectId,
}) {
  assert(typeof placeId === 'string' && placeId.trim().length >= 3, 'invalid-argument', 'placeId is invalid.');
  const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId.trim())}`);
  url.searchParams.set('languageCode', language);
  if (sessionToken) url.searchParams.set('sessionToken', sessionToken);
  const response = await fetchWithGoogleMapsOAuth(url, {
    headers: {
      'X-Goog-FieldMask': fieldMask,
    },
  }, { fetchImpl, requestContext, accessTokenProvider, projectId });
  return parseGoogleResponse(response);
}

async function fetchNewBilingualPlace({
  placeId,
  sessionToken,
  fetchImpl = global.fetch,
  requestContext,
  accessTokenProvider,
  projectId,
}) {
  const [heDetails, enDetails] = await Promise.all([
    fetchNewPlaceDetails({ placeId, language: 'he', sessionToken, fetchImpl, requestContext, accessTokenProvider, projectId }),
    fetchNewPlaceDetails({ placeId, language: 'en', sessionToken, fetchImpl, requestContext, accessTokenProvider, projectId }),
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

async function fetchNewSelectionPlace({ prediction, mode, ...options }) {
  if (mode === 'destinations') {
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
  language = 'he',
  mode = 'places',
  sessionToken,
  fetchImpl = global.fetch,
  randomSelectionId,
  coordinates,
  requestContext,
  accessTokenProvider,
  projectId,
}) {
  const response = await fetchWithGoogleMapsOAuth(
    'https://places.googleapis.com/v1/places:autocomplete',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-FieldMask': NEW_AUTOCOMPLETE_FIELD_MASK,
      },
      body: JSON.stringify({
        input: query,
        languageCode: language,
        ...(sessionToken ? { sessionToken } : {}),
        // Google does not allow the `(cities)` collection to be combined with
        // natural-feature primary types. Destination mode therefore uses the
        // same single autocomplete call and filters the returned predictions
        // below, instead of issuing a second billable provider request.
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
    { fetchImpl, requestContext, accessTokenProvider, projectId }
  );
  const payload = await parseGoogleResponse(response, { notFoundMessage: 'No matching places were found.' });
  const predictions = (Array.isArray(payload?.suggestions) ? payload.suggestions : [])
    .map((suggestion) => normalizeNewPrediction(suggestion, randomSelectionId))
    .filter(Boolean);
  return mode === 'destinations'
    ? predictions.filter((prediction) => prediction.types.some((type) =>
        DESTINATION_AUTOCOMPLETE_TYPES.has(type)))
    : predictions;
}

async function autocompletePlaces(options) {
  selectedProvider(options.provider);
  return newAutocomplete(options);
}

async function fetchBilingualPlace(options) {
  selectedProvider(options.provider);
  return fetchNewBilingualPlace(options);
}

async function fetchNewLocalityPlaceId(options) {
  const wantedAliases = localityAliases(options.localityName, options.countryCode);
  const wanted = wantedAliases[0];
  assert(wanted, 'failed-precondition', 'The selected place has no trustworthy containing locality.');
  const predictions = await newAutocomplete({
    query: [options.localityName, options.countryName].filter(Boolean).join(' '),
    language: 'en',
    mode: 'destinations',
    sessionToken: options.sessionToken,
    fetchImpl: options.fetchImpl,
    randomSelectionId: () => '',
    coordinates: options.coordinates,
    requestContext: options.requestContext,
    accessTokenProvider: options.accessTokenProvider,
    projectId: options.projectId,
  });
  const matches = predictions.filter((prediction) =>
    localityAliases(prediction.text, options.countryCode)
      .some((alias) => wantedAliases.includes(alias))
  );
  const ids = [...new Set(matches.map((entry) => entry.placeId))];
  if (!ids.length) return null;
  const candidates = (await Promise.all(ids.slice(0, MAX_LOCALITY_CANDIDATES_PER_QUERY).map(async (placeId) => {
    const details = parseNewLocalizedPlace(await fetchNewPlaceDetails({
      placeId,
      language: 'en',
      sessionToken: options.sessionToken,
      fetchImpl: options.fetchImpl,
      requestContext: options.requestContext,
      accessTokenProvider: options.accessTokenProvider,
      projectId: options.projectId,
    }));
    const candidateNames = localityAliases(
      details.localityName || details.displayName,
      options.countryCode
    );
    const expectedCountry = String(options.countryCode || '').toUpperCase();
    if (!candidateNames.some((alias) => wantedAliases.includes(alias)) ||
        (expectedCountry && details.countryCode !== expectedCountry) ||
        !details.coordinates || !options.coordinates) return null;
    const localityTypes = localityTypesForCountry(options.countryCode);
    const typeIndex = localityTypes.indexOf(details.localityType);
    const priority = typeIndex < 0 ? localityTypes.length : typeIndex;
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
  selectedProvider(options.provider);
  return fetchNewSelectionPlace(options);
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
const ALBANIAN_LOCALITY_EQUIVALENTS = [
  ['vlora', 'vlore'],
];

function localityAliases(value, countryCode) {
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
  if (String(countryCode || '').toUpperCase() === 'AL') {
    const albanianForms = new Set(aliases);
    for (const alias of albanianForms) {
      if (alias.endsWith('es')) albanianForms.add(alias.slice(0, -1));
    }
    for (const equivalents of ALBANIAN_LOCALITY_EQUIVALENTS) {
      if (equivalents.some((alias) => albanianForms.has(alias))) {
        equivalents.forEach((alias) => aliases.add(alias));
      }
    }
    albanianForms.forEach((alias) => aliases.add(alias));
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
    const aliases = localityAliases(raw, options.countryCode);
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

function geocodeComponent(result, type) {
  return (Array.isArray(result?.addressComponents) ? result.addressComponents : [])
    .find((entry) => entry?.types?.includes(type));
}

async function fetchReverseLocalityCandidates(options) {
  if (!options.coordinates) return null;
  const url = new URL(`https://geocode.googleapis.com/v4/geocode/location/${encodeURIComponent(`${options.coordinates.lat},${options.coordinates.lng}`)}`);
  for (const type of [
    'locality',
    'postal_town',
    'administrative_area_level_3',
    'administrative_area_level_2',
    'administrative_area_level_1',
  ]) url.searchParams.append('types', type);
  url.searchParams.set('languageCode', 'en');
  let response;
  try {
    response = await fetchWithGoogleMapsOAuth(url, {
      headers: {
        'X-Goog-FieldMask': 'results.placeId,results.addressComponents,results.types,results.location',
      },
    }, {
      fetchImpl: options.fetchImpl,
      requestContext: options.requestContext,
      accessTokenProvider: options.accessTokenProvider,
      projectId: options.projectId,
    });
  } catch (error) {
    if (String(error?.code || '').replace(/^functions\//, '') === 'resource-exhausted') throw error;
    return null;
  }
  if (response?.status === 429) {
    throw new HttpsError('resource-exhausted', 'Google Geocoding quota is temporarily unavailable.');
  }
  if (!response?.ok) return null;
  const payload = await response.json();
  if (!Array.isArray(payload?.results)) return null;
  const expectedCountry = String(options.countryCode || '').toUpperCase();
  const candidates = payload.results.map((result) => {
    const placeId = String(result?.placeId || '').trim();
    const country = geocodeComponent(result, 'country');
    const countryCode = String(country?.shortText || '').toUpperCase();
    const types = Array.isArray(result?.types) ? result.types : [];
    const lat = Number(result?.location?.latitude);
    const lng = Number(result?.location?.longitude);
    const coordinates = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
    if (!placeId || !coordinates || (expectedCountry && countryCode !== expectedCountry)) return null;
    return { placeId, types, distanceKm: distanceKm(options.coordinates, coordinates) };
  }).filter((entry) => entry && entry.distanceKm <= 50);

  function choose(typePriority) {
    const ranked = candidates.map((candidate) => {
      const priority = typePriority.findIndex((type) => candidate.types.includes(type));
      return priority < 0 ? null : { ...candidate, priority };
    }).filter(Boolean).sort((left, right) =>
      left.priority - right.priority || left.distanceKm - right.distanceKm ||
      left.placeId.localeCompare(right.placeId)
    );
    if (!ranked.length) return null;
    return {
      placeId: ranked[0].placeId,
      ambiguous: ranked.length > 1 && ranked[0].priority === ranked[1].priority &&
        ranked[1].distanceKm - ranked[0].distanceKm < 5,
    };
  }

  const settlement = choose(['locality', 'postal_town', 'administrative_area_level_3']);
  const administrative = choose(expectedCountry === 'TH'
    ? ['administrative_area_level_1', 'administrative_area_level_2']
    : ['administrative_area_level_2', 'administrative_area_level_1']);
  return {
    settlement: settlement?.placeId || null,
    settlementAmbiguous: settlement?.ambiguous || false,
    administrative: administrative?.placeId || null,
    administrativeAmbiguous: administrative?.ambiguous || false,
  };
}

function rejectAmbiguousReverseCandidate(ambiguous) {
  if (ambiguous) {
    throw new HttpsError('failed-precondition',
      'The destination locality is ambiguous. Please select a more specific place.');
  }
}

async function fetchReverseLocalityPlaceId(options) {
  const candidates = await fetchReverseLocalityCandidates(options);
  if (!candidates) return null;
  if (String(options.countryCode || '').toUpperCase() === 'TH') {
    if (candidates.administrative) {
      rejectAmbiguousReverseCandidate(candidates.administrativeAmbiguous);
      return candidates.administrative;
    }
    rejectAmbiguousReverseCandidate(candidates.settlementAmbiguous);
    return candidates.settlement;
  }
  if (candidates.settlement) {
    rejectAmbiguousReverseCandidate(candidates.settlementAmbiguous);
    return candidates.settlement;
  }
  rejectAmbiguousReverseCandidate(candidates.administrativeAmbiguous);
  return candidates.administrative;
}

async function fetchLocalityPlaceId(options) {
  const localityNames = localitySearchNames(options);
  assert(localityNames.length, 'failed-precondition',
    'The selected place has no trustworthy containing locality.');
  const reverseCandidates = await fetchReverseLocalityCandidates(options);
  if (String(options.countryCode || '').toUpperCase() === 'TH') {
    const thaiCandidate = reverseCandidates?.administrative || reverseCandidates?.settlement;
    if (thaiCandidate) {
      rejectAmbiguousReverseCandidate(reverseCandidates.administrative
        ? reverseCandidates.administrativeAmbiguous
        : reverseCandidates.settlementAmbiguous);
      return thaiCandidate;
    }
  }
  if (reverseCandidates?.settlement) {
    rejectAmbiguousReverseCandidate(reverseCandidates.settlementAmbiguous);
    return reverseCandidates.settlement;
  }
  for (const localityName of localityNames) {
    const request = { ...options, localityName };
    selectedProvider(options.provider);
    const placeId = await fetchNewLocalityPlaceId(request);
    if (placeId) return placeId;
  }
  if (String(options.countryCode || '').toUpperCase() === 'TH') return null;
  rejectAmbiguousReverseCandidate(reverseCandidates?.administrativeAmbiguous);
  return reverseCandidates?.administrative || null;
}

module.exports = {
  NEW_AUTOCOMPLETE_FIELD_MASK,
  NEW_DETAILS_FIELD_MASK,
  NEW_SELECTION_DETAILS_FIELD_MASK,
  NEW_CONTAINING_PLACES_FIELD_MASK,
  MAX_PROVIDER_REQUESTS_PER_ATTEMPT,
  autocompletePlaces,
  fetchBilingualPlace,
  fetchLocalityPlaceId,
  fetchNewBilingualPlace,
  fetchNewContainingPlaces,
  fetchNewPlaceDetails,
  fetchNewSelectionPlace,
  fetchPlaceSelection,
  fetchReverseLocalityCandidates,
  fetchReverseLocalityPlaceId,
  fetchWithProviderPolicy,
  fetchWithGoogleMapsOAuth,
  localityAliases,
  localitySearchNames,
  newAutocomplete,
  normalizeNewPrediction,
  parseNewLocalizedPlace,
  providerEndpointFor,
  providerRequestContext,
  selectedProvider,
};
