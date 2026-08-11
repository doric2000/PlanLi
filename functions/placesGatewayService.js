const crypto = require('crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { fetchLegacyBilingualPlace } = require('./legacyPlacesAdapter');
const { consumeProviderBudget } = require('./providerRateLimitService');

const SESSION_TTL_MS = 5 * 60 * 1000;
const MAX_QUERY_LENGTH = 180;
const MAX_PREDICTIONS = 10;

function assert(condition, code, message) {
  if (!condition) throw new HttpsError(code, message);
}

function randomId(prefix) {
  return `${prefix}_${crypto.randomBytes(18).toString('base64url')}`;
}

function sessionRef(db, sessionId) {
  return db.doc(`system/runtime/placeSearchSessions/${sessionId}`);
}

function resolvedTokenRef(db, token) {
  return db.doc(`system/runtime/resolvedPlaceTokens/${token}`);
}

function normalizePrediction(prediction) {
  const placeId = String(prediction?.place_id || '').trim();
  const text = String(prediction?.structured_formatting?.main_text || prediction?.description || '').trim();
  const secondaryText = String(prediction?.structured_formatting?.secondary_text || '').trim();
  if (!placeId || !text) return null;
  return {
    selectionId: randomId('sel'),
    placeId,
    text,
    secondaryText,
    types: Array.isArray(prediction?.types) ? prediction.types.filter((type) => typeof type === 'string').slice(0, 12) : [],
  };
}

async function legacyAutocomplete({ query, mapsKey, fetchImpl = global.fetch, mode }) {
  const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
  url.searchParams.set('input', query);
  url.searchParams.set('language', 'he');
  url.searchParams.set('key', mapsKey);
  if (mode === 'destinations') url.searchParams.set('types', '(cities)');
  let response;
  try {
    response = await fetchImpl(url);
  } catch {
    throw new HttpsError('unavailable', 'Google Places is temporarily unavailable.');
  }
  if (!response?.ok) throw new HttpsError('unavailable', 'Google Places request failed.');
  const payload = await response.json();
  if (payload?.status === 'ZERO_RESULTS') return [];
  if (payload?.status === 'OVER_QUERY_LIMIT') throw new HttpsError('resource-exhausted', 'Google Places quota is temporarily unavailable.');
  if (payload?.status !== 'OK' || !Array.isArray(payload.predictions)) {
    throw new HttpsError('failed-precondition', 'Google Places returned an invalid search response.');
  }
  return payload.predictions.map(normalizePrediction).filter(Boolean).slice(0, MAX_PREDICTIONS);
}

async function searchPlaces({ admin, auth, data, mapsKey, providerRateLimitKey, fetchImpl = global.fetch }) {
  assert(auth?.uid, 'unauthenticated', 'You must be signed in.');
  const query = String(data?.query || '').trim();
  const mode = data?.mode === 'destinations' ? 'destinations' : data?.mode === 'places' ? 'places' : null;
  assert(query.length >= 2 && query.length <= MAX_QUERY_LENGTH, 'invalid-argument', 'Query must contain 2–180 characters.');
  assert(mode, 'invalid-argument', 'mode must be places or destinations.');
  await consumeProviderBudget({ admin, auth, action: 'autocomplete', key: providerRateLimitKey });
  const predictions = await legacyAutocomplete({ query, mapsKey, fetchImpl, mode });
  const sessionId = randomId('ps');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await sessionRef(admin.firestore(), sessionId).create({
    uid: auth.uid,
    mode,
    predictions,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt,
  });
  return {
    predictions: predictions.map(({ selectionId, text, secondaryText, types }) => ({ selectionId, text, secondaryText, types })),
    sessionId,
    expiresAt,
  };
}

async function resolvePlaceSelection({ admin, auth, data, mapsKey, providerRateLimitKey, fetchImpl = global.fetch }) {
  assert(auth?.uid, 'unauthenticated', 'You must be signed in.');
  const sessionId = String(data?.sessionId || '').trim();
  const selectionId = String(data?.selectionId || '').trim();
  assert(sessionId.startsWith('ps_') && selectionId.startsWith('sel_'), 'invalid-argument', 'The place selection is invalid.');
  const snapshot = await sessionRef(admin.firestore(), sessionId).get();
  assert(snapshot.exists, 'not-found', 'The place search has expired. Search again.');
  const session = snapshot.data() || {};
  assert(session.uid === auth.uid, 'permission-denied', 'This place selection belongs to another user.');
  assert(session.expiresAt?.toDate?.().getTime() > Date.now(), 'deadline-exceeded', 'The place search has expired. Search again.');
  const prediction = (session.predictions || []).find((entry) => entry.selectionId === selectionId);
  assert(prediction?.placeId, 'not-found', 'The selected place is no longer available. Search again.');
  await consumeProviderBudget({ admin, auth, action: 'bilingualResolution', key: providerRateLimitKey });
  const bilingual = await fetchLegacyBilingualPlace({ placeId: prediction.placeId, mapsKey, fetchImpl });
  const resolvedPlaceToken = randomId('rpt');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await resolvedTokenRef(admin.firestore(), resolvedPlaceToken).create({
    uid: auth.uid,
    placeId: bilingual.he.placeId,
    he: bilingual.he,
    en: bilingual.en,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt,
  });
  return {
    resolvedPlaceToken,
    place: {
      placeId: bilingual.he.placeId,
      names: { he: bilingual.he.displayName, en: bilingual.en.displayName },
      address: bilingual.he.address,
      coordinates: bilingual.he.coordinates || bilingual.en.coordinates || null,
      types: bilingual.he.types,
    },
    expiresAt,
  };
}

async function readResolvedPlaceToken({ admin, auth, resolvedPlaceToken }) {
  assert(auth?.uid, 'unauthenticated', 'You must be signed in.');
  const token = String(resolvedPlaceToken || '').trim();
  assert(token.startsWith('rpt_'), 'invalid-argument', 'The resolved place token is invalid.');
  const snapshot = await resolvedTokenRef(admin.firestore(), token).get();
  assert(snapshot.exists, 'not-found', 'The resolved place has expired. Search again.');
  const value = snapshot.data() || {};
  assert(value.uid === auth.uid, 'permission-denied', 'This resolved place belongs to another user.');
  assert(value.expiresAt?.toDate?.().getTime() > Date.now(), 'deadline-exceeded', 'The resolved place has expired. Search again.');
  assert(value.he?.placeId && value.he.placeId === value.en?.placeId, 'failed-precondition', 'The resolved place is invalid. Search again.');
  return { he: value.he, en: value.en };
}

module.exports = { SESSION_TTL_MS, legacyAutocomplete, readResolvedPlaceToken, resolvePlaceSelection, searchPlaces };
