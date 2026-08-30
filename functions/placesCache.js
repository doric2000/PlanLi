const { normalize } = require('./destinationIdentityService');

function normalizeName(value) {
  return normalize(value).replace(/\s+/g, ' ').trim();
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
    viewport: he.viewport || en.viewport || null,
    countryCode: he.countryCode || en.countryCode,
    types: Array.from(new Set([...(he.types || []), ...(en.types || [])])),
    fetchedAt,
    refreshAfter,
    expiresAt,
  };
}

function exactPlaceGoogleCacheFor(options) {
  const { coordinates, viewport, types, ...cache } = googleCacheFor(options);
  return cache;
}

module.exports = {
  destinationTypeFor,
  exactPlaceGoogleCacheFor,
  googleCacheFor,
  normalizeName,
};
