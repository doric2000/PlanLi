const { HttpsError } = require('firebase-functions/v2/https');
const { normalize } = require('./destinationIdentityService');

const LEGACY_DETAILS_FIELDS = [
  'place_id',
  'name',
  'formatted_address',
  'address_components',
  'geometry',
  'types',
  'url',
].join(',');

const LOCALITY_COMPONENT_TYPES = Object.freeze([
  'locality',
  'postal_town',
  'administrative_area_level_3',
  'administrative_area_level_2',
  'administrative_area_level_1',
]);

function assert(condition, code, message) {
  if (!condition) throw new HttpsError(code, message);
}

function normalizeName(value) {
  return normalize(value).replace(/\s+/g, ' ').trim();
}

function componentFor(details, types) {
  const components = Array.isArray(details?.address_components) ? details.address_components : [];
  for (const type of types) {
    const component = components.find((entry) => entry?.types?.includes(type));
    if (component) return component;
  }
  return null;
}

function coordinatesFor(details) {
  const lat = Number(details?.geometry?.location?.lat);
  const lng = Number(details?.geometry?.location?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function parseLocalizedPlace(details) {
  assert(details && typeof details === 'object', 'failed-precondition', 'Google Places returned no result.');
  const country = componentFor(details, ['country']);
  const locality = componentFor(details, LOCALITY_COMPONENT_TYPES);
  return {
    placeId: String(details.place_id || '').trim(),
    displayName: String(details.name || locality?.long_name || '').trim(),
    address: String(details.formatted_address || '').trim(),
    countryName: String(country?.long_name || '').trim(),
    countryCode: String(country?.short_name || '').trim().toUpperCase(),
    localityName: String(locality?.long_name || '').trim(),
    localityType: locality?.types?.find((type) => LOCALITY_COMPONENT_TYPES.includes(type)) || null,
    coordinates: coordinatesFor(details),
    types: Array.isArray(details.types) ? details.types.filter((type) => typeof type === 'string') : [],
    url: String(details.url || '').trim(),
  };
}

async function fetchLegacyPlaceDetails({ placeId, mapsKey, language, fetchImpl = global.fetch }) {
  assert(typeof placeId === 'string' && placeId.trim().length >= 3, 'invalid-argument', 'placeId is invalid.');
  assert(typeof mapsKey === 'string' && mapsKey.trim(), 'failed-precondition', 'GOOGLE_MAPS_KEY is not configured.');
  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
  url.searchParams.set('place_id', placeId.trim());
  url.searchParams.set('fields', LEGACY_DETAILS_FIELDS);
  url.searchParams.set('language', language);
  url.searchParams.set('key', mapsKey);
  let response;
  try {
    response = await fetchImpl(url);
  } catch {
    throw new HttpsError('unavailable', 'Google Places is temporarily unavailable.');
  }
  if (!response?.ok) throw new HttpsError('unavailable', 'Google Places request failed.');
  const payload = await response.json();
  if (payload?.status === 'ZERO_RESULTS') throw new HttpsError('not-found', 'The selected place no longer exists.');
  if (payload?.status === 'OVER_QUERY_LIMIT') throw new HttpsError('resource-exhausted', 'Google Places quota is temporarily unavailable.');
  if (payload?.status !== 'OK' || !payload?.result) {
    throw new HttpsError('failed-precondition', 'Google Places returned an invalid place.');
  }
  return payload.result;
}

async function fetchLegacyBilingualPlace({ placeId, mapsKey, fetchImpl = global.fetch }) {
  const [heDetails, enDetails] = await Promise.all([
    fetchLegacyPlaceDetails({ placeId, mapsKey, language: 'he', fetchImpl }),
    fetchLegacyPlaceDetails({ placeId, mapsKey, language: 'en', fetchImpl }),
  ]);
  const he = parseLocalizedPlace(heDetails);
  const en = parseLocalizedPlace(enDetails);
  assert(he.placeId && he.placeId === en.placeId, 'failed-precondition', 'Google Places returned inconsistent place details.');
  assert(/^[A-Z]{2}$/.test(he.countryCode || en.countryCode), 'failed-precondition', 'The selected place has no trustworthy country.');
  return { he, en, fetchedAt: new Date() };
}

function isAreaDestination(place) {
  const types = new Set(place?.types || []);
  return types.has('natural_feature') || types.has('island') ||
    types.has('administrative_area_level_1') || types.has('administrative_area_level_2');
}

async function fetchLegacyLocalityPlaceId({
  localityName,
  countryName,
  coordinates,
  mapsKey,
  fetchImpl = global.fetch,
}) {
  assert(typeof localityName === 'string' && localityName.trim(), 'failed-precondition', 'The selected place has no trustworthy containing locality.');
  assert(typeof mapsKey === 'string' && mapsKey.trim(), 'failed-precondition', 'GOOGLE_MAPS_KEY is not configured.');
  const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
  url.searchParams.set('input', [localityName, countryName].filter(Boolean).join(' '));
  url.searchParams.set('types', '(cities)');
  url.searchParams.set('language', 'en');
  url.searchParams.set('key', mapsKey);
  if (coordinates) {
    url.searchParams.set('location', `${coordinates.lat},${coordinates.lng}`);
    url.searchParams.set('radius', '50000');
  }
  let response;
  try {
    response = await fetchImpl(url);
  } catch {
    throw new HttpsError('unavailable', 'Google Places is temporarily unavailable.');
  }
  if (!response?.ok) throw new HttpsError('unavailable', 'Google Places request failed.');
  const payload = await response.json();
  if (payload?.status === 'ZERO_RESULTS') return null;
  if (payload?.status === 'OVER_QUERY_LIMIT') throw new HttpsError('resource-exhausted', 'Google Places quota is temporarily unavailable.');
  if (payload?.status !== 'OK' || !Array.isArray(payload.predictions)) {
    throw new HttpsError('failed-precondition', 'Google Places returned an invalid locality search.');
  }
  const wanted = normalizeName(localityName);
  const matches = payload.predictions.filter((prediction) =>
    normalizeName(prediction?.structured_formatting?.main_text || prediction?.description) === wanted
  );
  if (!matches.length) return null;
  const uniqueIds = [...new Set(matches.map((prediction) => prediction?.place_id).filter(Boolean))];
  assert(uniqueIds.length === 1, 'failed-precondition', 'The destination locality is ambiguous. Please select a more specific place.');
  return uniqueIds[0];
}

function destinationTypeFor({ types = [], localityName, displayName }) {
  const normalized = normalizeName(`${displayName || ''} ${localityName || ''}`);
  if (types.includes('natural_feature') && /\b(lake|lagoon)\b/.test(normalized)) return 'lake';
  if (types.includes('natural_feature')) return 'natural_feature';
  if (types.includes('island')) return 'island';
  if (types.includes('administrative_area_level_1') || types.includes('administrative_area_level_2')) return 'region';
  if (types.includes('locality')) return 'city';
  if (types.includes('postal_town') || types.includes('administrative_area_level_3')) return 'town';
  return localityName ? 'town' : 'region';
}

function googleCacheFor({ he, en, fetchedAt = new Date() }) {
  const refreshAfter = new Date(fetchedAt.getTime() + 24 * 24 * 60 * 60 * 1000);
  const expiresAt = new Date(fetchedAt.getTime() + 28 * 24 * 60 * 60 * 1000);
  return {
    names: { he: he.displayName, en: en.displayName },
    coordinates: he.coordinates || en.coordinates || null,
    countryCode: he.countryCode || en.countryCode,
    types: Array.from(new Set([...(he.types || []), ...(en.types || [])])),
    fetchedAt,
    refreshAfter,
    expiresAt,
  };
}

module.exports = {
  LEGACY_DETAILS_FIELDS,
  LOCALITY_COMPONENT_TYPES,
  destinationTypeFor,
  fetchLegacyBilingualPlace,
  fetchLegacyPlaceDetails,
  fetchLegacyLocalityPlaceId,
  googleCacheFor,
  isAreaDestination,
  normalizeName,
  parseLocalizedPlace,
};
