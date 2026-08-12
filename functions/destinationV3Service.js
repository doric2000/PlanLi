const crypto = require('crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { distanceKm, normalize } = require('./destinationIdentityService');
const { destinationTypeFor, googleCacheFor, normalizeName } = require('./legacyPlacesAdapter');

const MAX_LOCALITY_DISTANCE_KM = 50;

function assert(condition, code, message) {
  if (!condition) throw new HttpsError(code, message);
}

function stableDestinationId(countryId, googlePlaceId) {
  const seed = `${String(countryId || '').trim()}:${String(googlePlaceId || '').trim()}`;
  assert(!seed.startsWith(':'), 'invalid-argument', 'A destination requires a country and Google Place ID.');
  return `dst_${crypto.createHash('sha256').update(seed).digest('base64url').slice(0, 20)}`;
}

function destinationName(place) {
  const type = destinationType(place);
  const area = ['region', 'island', 'lake', 'natural_feature'].includes(type);
  return String(area
    ? place?.displayName || place?.localityName || ''
    : place?.localityName || place?.displayName || '').trim();
}

function destinationType(place) {
  return destinationTypeFor({
    types: place?.types || [],
    localityName: place?.localityName,
    displayName: place?.displayName,
  });
}

function buildDestinationV3({ countryId, he, en, fetchedAt = new Date() }) {
  assert(typeof countryId === 'string' && countryId.trim(), 'invalid-argument', 'A destination requires a country.');
  assert(he?.placeId && he.placeId === en?.placeId, 'failed-precondition', 'Google Places returned inconsistent destination details.');
  assert(he?.coordinates || en?.coordinates, 'failed-precondition', 'The destination has no valid coordinates.');
  const nameHe = destinationName(he);
  const nameEn = destinationName(en);
  assert(nameHe && nameEn, 'failed-precondition', 'The destination has no trustworthy localized name.');
  const type = destinationType(en);
  return {
    id: stableDestinationId(countryId, he.placeId),
    data: {
      schemaVersion: 3,
      countryId: countryId.trim(),
      destinationType: type,
      providerRefs: { googlePlaceId: he.placeId },
      googleCache: {
        ...googleCacheFor({ he: { ...he, displayName: nameHe }, en: { ...en, displayName: nameEn }, fetchedAt }),
        names: { he: nameHe, en: nameEn },
      },
      stats: { recommendationCount: 0 },
      status: 'active',
    },
  };
}

function candidateMatchesLocality(candidate, { countryCode, localityName, coordinates }) {
  const candidateCountry = String(candidate?.countryCode || candidate?.googleCache?.countryCode || '').toUpperCase();
  const candidateName = candidate?.nameEn || candidate?.googleCache?.names?.en || candidate?.name || '';
  const candidateCoordinates = candidate?.coordinates || candidate?.googleCache?.coordinates || null;
  const exactName = normalizeName(candidateName) === normalizeName(localityName);
  const km = coordinates && candidateCoordinates ? distanceKm(coordinates, candidateCoordinates) : Infinity;
  return candidateCountry === String(countryCode || '').toUpperCase() && exactName && km <= MAX_LOCALITY_DISTANCE_KM
    ? { ...candidate, distanceKm: km }
    : null;
}

function chooseLocalityCandidate(candidates, expected) {
  const matches = (Array.isArray(candidates) ? candidates : [])
    .map((candidate) => candidateMatchesLocality(candidate, expected))
    .filter(Boolean)
    .sort((left, right) => left.distanceKm - right.distanceKm || String(left.placeId || left.id).localeCompare(String(right.placeId || right.id)));
  if (!matches.length) return null;
  if (matches.length > 1 && matches[1].distanceKm - matches[0].distanceKm < 5) {
    throw new HttpsError('failed-precondition', 'The destination locality is ambiguous. Please select a more specific place.');
  }
  return matches[0];
}

function destinationClaimId({ countryId, type, nameEn }) {
  const normalized = normalize(`${countryId}:${type}:${nameEn}`);
  assert(normalized, 'invalid-argument', 'A destination claim requires a normalized name.');
  return `dstclaim_${crypto.createHash('sha256').update(normalized).digest('base64url').slice(0, 28)}`;
}

module.exports = {
  MAX_LOCALITY_DISTANCE_KM,
  buildDestinationV3,
  candidateMatchesLocality,
  chooseLocalityCandidate,
  destinationClaimId,
  destinationName,
  destinationType,
  stableDestinationId,
};
