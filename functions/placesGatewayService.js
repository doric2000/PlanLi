const crypto = require('crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const {
  autocompletePlaces,
  fetchPlaceSelection,
  providerRequestContext,
} = require('./placesProviderAdapter');
const { consumeProviderBudget } = require('./providerRateLimitService');
const { DESTINATION_NAMING_POLICY_VERSION } = require('./destinationLocalizationService');
const {
  createIncidentId,
  decorateLocationError,
  locationLog,
  reasonForLocationError,
} = require('./locationDiagnostics');

const SESSION_TTL_MS = 5 * 60 * 1000;
const RESOLVED_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_QUERY_LENGTH = 180;
const MAX_PREDICTIONS = 10;

function assert(condition, code, message) {
  if (!condition) throw new HttpsError(code, message);
}

function randomId(prefix) {
  return `${prefix}_${crypto.randomBytes(18).toString('base64url')}`;
}

function signResolvedTokenId(tokenId, key) {
  assert(typeof key === 'string' && key.length >= 16, 'failed-precondition', 'Resolved place tokens are not configured.');
  return crypto.createHmac('sha256', key).update(tokenId).digest('base64url');
}

function createResolvedPlaceToken(key) {
  const tokenId = randomId('rpt');
  return `${tokenId}.${signResolvedTokenId(tokenId, key)}`;
}

function verifyResolvedPlaceToken(token, key) {
  const [tokenId, signature, extra] = String(token || '').split('.');
  if (!tokenId?.startsWith('rpt_') || !signature || extra) return false;
  const expected = signResolvedTokenId(tokenId, key);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
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
  if (response?.status === 429) throw new HttpsError('resource-exhausted', 'Google Places quota is temporarily unavailable.');
  if (!response?.ok) throw new HttpsError('unavailable', 'Google Places request failed.');
  const payload = await response.json();
  if (payload?.status === 'ZERO_RESULTS') return [];
  if (payload?.status === 'OVER_QUERY_LIMIT') throw new HttpsError('resource-exhausted', 'Google Places quota is temporarily unavailable.');
  if (payload?.status === 'UNKNOWN_ERROR') throw new HttpsError('unavailable', 'Google Places is temporarily unavailable.');
  if (payload?.status === 'REQUEST_DENIED') throw new HttpsError('failed-precondition', 'Google Places is not configured correctly.');
  if (payload?.status === 'INVALID_REQUEST') throw new HttpsError('invalid-argument', 'Google Places rejected the search request.');
  if (payload?.status !== 'OK' || !Array.isArray(payload.predictions)) {
    throw new HttpsError('failed-precondition', 'Google Places returned an invalid search response.');
  }
  return payload.predictions.map(normalizePrediction).filter(Boolean).slice(0, MAX_PREDICTIONS);
}

async function searchPlacesInternal({
  admin,
  auth,
  data,
  mapsKey,
  newPlacesKey,
  placesProvider = 'legacy',
  providerRateLimitKey,
  fetchImpl = global.fetch,
  consumeBudget = consumeProviderBudget,
}) {
  const incidentId = createIncidentId(data?.incidentId);
  const requestContext = providerRequestContext({ incidentId });
  assert(auth?.uid, 'unauthenticated', 'You must be signed in.');
  const query = String(data?.query || '').trim();
  const mode = data?.mode === 'destinations' ? 'destinations' : data?.mode === 'places' ? 'places' : null;
  assert(query.length >= 2 && query.length <= MAX_QUERY_LENGTH, 'invalid-argument', 'Query must contain 2–180 characters.');
  assert(mode, 'invalid-argument', 'mode must be places or destinations.');
  await consumeBudget({ admin, auth, action: 'autocomplete', key: providerRateLimitKey });
  const providerSessionToken = randomId('gst');
  const predictions = (await autocompletePlaces({
    provider: placesProvider,
    query,
    mapsKey,
    newPlacesKey,
    fetchImpl,
    mode,
    sessionToken: providerSessionToken,
    randomSelectionId: () => randomId('sel'),
    legacyAutocomplete,
    requestContext,
  })).slice(0, MAX_PREDICTIONS);
  if (requestContext.count === 0) requestContext.count = 1;
  const sessionId = randomId('ps');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await sessionRef(admin.firestore(), sessionId).create({
    uid: auth.uid,
    mode,
    predictions,
    provider: placesProvider,
    providerSessionToken,
    incidentId,
    providerCallCount: requestContext.count,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt,
  });
  return {
    predictions: predictions.map(({ selectionId, placeId, text, secondaryText, types }) => ({
      selectionId,
      placeId,
      provider: 'google',
      providerPlaceId: placeId,
      primaryText: text,
      text,
      secondaryText,
      types,
    })),
    sessionId,
    expiresAt,
    incidentId,
    providerCallCount: requestContext.count,
  };
}

async function searchPlaces(options) {
  const incidentId = createIncidentId(options?.data?.incidentId);
  const startedAt = Date.now();
  try {
    const result = await searchPlacesInternal({
      ...options,
      data: { ...(options?.data || {}), incidentId },
    });
    locationLog('search', {
      incidentId,
      outcome: 'succeeded',
      durationMs: Date.now() - startedAt,
      providerCalls: result.providerCallCount,
    });
    const { providerCallCount, ...clientResult } = result;
    return clientResult;
  } catch (error) {
    const reason = reasonForLocationError(error, 'search_failed');
    locationLog('search', {
      incidentId,
      outcome: 'failed',
      durationMs: Date.now() - startedAt,
      reason,
    });
    throw decorateLocationError(error, incidentId, 'search_failed');
  }
}

async function resolvePlaceSelectionInternal({
  admin,
  auth,
  data,
  mapsKey,
  newPlacesKey,
  placesProvider = 'legacy',
  providerRateLimitKey,
  fetchImpl = global.fetch,
  diagnosticContext,
}) {
  assert(auth?.uid, 'unauthenticated', 'You must be signed in.');
  const sessionId = String(data?.sessionId || '').trim();
  const selectionId = String(data?.selectionId || '').trim();
  assert(sessionId.startsWith('ps_') && selectionId.startsWith('sel_'), 'invalid-argument', 'The place selection is invalid.');
  const snapshot = await sessionRef(admin.firestore(), sessionId).get();
  assert(snapshot.exists, 'not-found', 'The place search has expired. Search again.');
  const session = snapshot.data() || {};
  const incidentId = createIncidentId(session.incidentId || data?.incidentId);
  if (diagnosticContext) diagnosticContext.incidentId = incidentId;
  const requestContext = providerRequestContext({
    count: Number(session.providerCallCount || 1),
    incidentId,
  });
  assert(session.uid === auth.uid, 'permission-denied', 'This place selection belongs to another user.');
  assert(session.expiresAt?.toDate?.().getTime() > Date.now(), 'deadline-exceeded', 'The place search has expired. Search again.');
  const prediction = (session.predictions || []).find((entry) => entry.selectionId === selectionId);
  assert(prediction?.placeId, 'not-found', 'The selected place is no longer available. Search again.');
  await consumeProviderBudget({ admin, auth, action: 'bilingualResolution', key: providerRateLimitKey });
  const providerCallsBefore = requestContext.count;
  const bilingual = await fetchPlaceSelection({
    provider: session.provider || placesProvider,
    prediction,
    mapsKey,
    newPlacesKey,
    sessionToken: session.providerSessionToken,
    fetchImpl,
    requestContext,
  });
  if (requestContext.count === providerCallsBefore) requestContext.count += 2;
  assert(requestContext.count <= requestContext.maximum, 'resource-exhausted',
    'Location resolution reached its safe Google request limit.');
  const resolvedPlaceToken = createResolvedPlaceToken(providerRateLimitKey);
  const expiresAt = new Date(Date.now() + RESOLVED_TOKEN_TTL_MS);
  await resolvedTokenRef(admin.firestore(), resolvedPlaceToken).create({
    uid: auth.uid,
    placeId: bilingual.he.placeId,
    he: bilingual.he,
    en: bilingual.en,
    incidentId,
    providerCallCount: requestContext.count,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt,
  });
  return {
    status: 'place_resolved',
    resolvedPlaceToken,
    incidentId,
    place: {
      placeId: bilingual.he.placeId,
      name: bilingual.he.displayName || bilingual.en.displayName,
      names: { he: bilingual.he.displayName, en: bilingual.en.displayName },
      address: bilingual.he.address,
      coordinates: bilingual.he.coordinates || bilingual.en.coordinates || null,
      types: bilingual.he.types,
    },
    expiresAt,
    providerCallCount: requestContext.count,
  };
}

async function resolvePlaceSelection(options) {
  const startedAt = Date.now();
  const diagnosticContext = {
    incidentId: createIncidentId(options?.data?.incidentId),
  };
  try {
    const result = await resolvePlaceSelectionInternal({
      ...options,
      data: { ...(options?.data || {}), incidentId: diagnosticContext.incidentId },
      diagnosticContext,
    });
    diagnosticContext.incidentId = result.incidentId;
    locationLog('selection', {
      incidentId: diagnosticContext.incidentId,
      outcome: 'succeeded',
      durationMs: Date.now() - startedAt,
      providerCalls: result.providerCallCount,
    });
    const { providerCallCount, ...clientResult } = result;
    return clientResult;
  } catch (error) {
    const reason = reasonForLocationError(error, 'selection_failed');
    locationLog('selection', {
      incidentId: diagnosticContext.incidentId,
      outcome: 'failed',
      durationMs: Date.now() - startedAt,
      reason,
    });
    throw decorateLocationError(error, diagnosticContext.incidentId, 'selection_failed');
  }
}

async function readResolvedPlaceToken({ admin, auth, resolvedPlaceToken, providerRateLimitKey }) {
  assert(auth?.uid, 'unauthenticated', 'You must be signed in.');
  const token = String(resolvedPlaceToken || '').trim();
  assert(verifyResolvedPlaceToken(token, providerRateLimitKey), 'invalid-argument', 'The resolved place token is invalid.');
  const snapshot = await resolvedTokenRef(admin.firestore(), token).get();
  assert(snapshot.exists, 'not-found', 'The resolved place has expired. Search again.');
  const value = snapshot.data() || {};
  assert(value.uid === auth.uid, 'permission-denied', 'This resolved place belongs to another user.');
  assert(value.expiresAt?.toDate?.().getTime() > Date.now(), 'deadline-exceeded', 'The resolved place has expired. Search again.');
  assert(value.he?.placeId && value.he.placeId === value.en?.placeId, 'failed-precondition', 'The resolved place is invalid. Search again.');
  return {
    he: value.he,
    en: value.en,
    destinationResolution: value.destinationResolution || null,
    destinationNamingPolicyVersion: Number(value.destinationNamingPolicyVersion || 0),
    incidentId: createIncidentId(value.incidentId),
    providerCallCount: Number(value.providerCallCount || 0),
  };
}

async function storeResolvedPlaceDestination({
  admin, auth, resolvedPlaceToken, destinationResolution, providerRateLimitKey,
  providerCallCount,
}) {
  const token = String(resolvedPlaceToken || '').trim();
  await readResolvedPlaceToken({
    admin, auth, resolvedPlaceToken: token, providerRateLimitKey,
  });
  assert(destinationResolution && typeof destinationResolution === 'object', 'invalid-argument', 'Destination resolution is invalid.');
  await resolvedTokenRef(admin.firestore(), token).set({
    destinationResolution,
    destinationNamingPolicyVersion: DESTINATION_NAMING_POLICY_VERSION,
    ...(Number.isFinite(providerCallCount) ? { providerCallCount } : {}),
  }, { merge: true });
}

module.exports = {
  RESOLVED_TOKEN_TTL_MS,
  SESSION_TTL_MS,
  createResolvedPlaceToken,
  legacyAutocomplete,
  readResolvedPlaceToken,
  resolvePlaceSelection,
  searchPlaces,
  signResolvedTokenId,
  storeResolvedPlaceDestination,
  verifyResolvedPlaceToken,
};
