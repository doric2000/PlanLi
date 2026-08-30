const crypto = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');

const { hasActiveAdminAccess } = require('./adminAuthorization');
const {
  isVerifiedCaller,
  normalizeExternalUrl,
  normalizePublishRequestId,
  saveRecommendation,
} = require('./recommendationService');
const { RECOMMENDATION_CATALOG, taxonomy } = require('./travelTaxonomy');
const { consumeRateLimit } = require('./socialService');
const { renewResolvedPlaceTokenLeases } = require('./placesGatewayService');

const DRAFT_VERSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PUBLICATION_RECEIPT_TTL_MS = 24 * 60 * 60 * 1000;
const DETAIL_LIMITS = {
  contactName: 80,
  phone: 40,
  externalUrl: 500,
  priceNote: 120,
  accessibilityNote: 500,
};

function fail(code, reason, message) {
  throw new HttpsError(code, message, { reason });
}

function assert(condition, code, reason, message) {
  if (!condition) fail(code, reason, message);
}

function cleanString(value, field, { max = 5000, optional = true } = {}) {
  if ((value == null || value === '') && optional) return '';
  assert(typeof value === 'string', 'invalid-argument', 'RECOMMENDATION_DRAFT_INVALID', `${field} is invalid.`);
  const result = value.trim();
  assert(result.length <= max && (optional || result.length > 0),
    'invalid-argument', 'RECOMMENDATION_DRAFT_INVALID', `${field} is invalid.`);
  return result;
}

function cleanId(value, field, optional = true) {
  const result = cleanString(value, field, { max: 180, optional });
  assert(!result || !result.includes('/'), 'invalid-argument', 'RECOMMENDATION_DRAFT_INVALID', `${field} is invalid.`);
  return result;
}

function cleanCoordinate(value) {
  if (value == null) return null;
  const lat = Number(value?.lat ?? value?.latitude);
  const lng = Number(value?.lng ?? value?.longitude);
  assert(Number.isFinite(lat) && lat >= -90 && lat <= 90 && Number.isFinite(lng) && lng >= -180 && lng <= 180,
    'invalid-argument', 'RECOMMENDATION_DRAFT_INVALID', 'coordinates are invalid.');
  return { lat, lng };
}

function cleanCountry(value) {
  if (!value) return null;
  return {
    id: cleanId(value.id || value.countryId, 'country.id', false),
    name: cleanString(value.name || value.countryName || '', 'country.name', { max: 200 }),
  };
}

function cleanCity(value) {
  if (!value) return null;
  const providerPlaceId = cleanString(
    value.providerPlaceId || value.googlePlaceId || '',
    'city.providerPlaceId',
    { max: 300 }
  );
  const resolvedPlaceToken = providerPlaceId
    ? cleanString(value.resolvedPlaceToken || '', 'city.resolvedPlaceToken', { max: 500 })
    : '';
  return {
    id: cleanId(value.id || value.cityId, 'city.id', false),
    name: cleanString(value.name || value.cityName || '', 'city.name', { max: 200 }),
    ...(providerPlaceId ? {
      provider: 'google',
      providerPlaceId,
      googlePlaceId: providerPlaceId,
      ...(resolvedPlaceToken ? { resolvedPlaceToken } : {}),
    } : {}),
  };
}

function cleanDestination(value) {
  if (!value) return null;
  const coordinate = cleanCoordinate(value.coordinates || value.geometry?.location);
  const providerPlaceId = cleanString(
    value.providerPlaceId || '', 'destination.providerPlaceId', { max: 300 }
  );
  const resolvedPlaceToken = providerPlaceId
    ? cleanString(value.resolvedPlaceToken || '', 'destination.resolvedPlaceToken', { max: 500 })
    : '';
  return {
    countryId: cleanId(value.countryId, 'destination.countryId', false),
    cityId: cleanId(value.cityId, 'destination.cityId', false),
    countryName: cleanString(value.countryName || '', 'destination.countryName', { max: 200 }),
    name: cleanString(value.name || value.cityName || '', 'destination.name', { max: 200 }),
    label: cleanString(value.label || '', 'destination.label', { max: 300 }),
    ...(providerPlaceId ? {
      provider: 'google',
      providerPlaceId,
      ...(resolvedPlaceToken ? { resolvedPlaceToken } : {}),
    } : {}),
    ...(coordinate ? { coordinates: coordinate } : {}),
  };
}

function cleanPlace(value) {
  if (!value) return null;
  const coordinate = cleanCoordinate(value.coordinates || value.geometry?.location);
  const placeId = cleanString(value.placeId || value.place_id || '', 'place.placeId', { max: 300 });
  const token = cleanString(value.resolvedPlaceToken || '', 'place.resolvedPlaceToken', { max: 500 });
  return {
    placeId,
    ...(token ? { resolvedPlaceToken: token } : {}),
    name: cleanString(value.name || '', 'place.name', { max: 200 }),
    address: cleanString(value.address || '', 'place.address', { max: 500 }),
    types: Array.isArray(value.types)
      ? Array.from(new Set(value.types.slice(0, 30).map((entry) => cleanString(entry, 'place.types', { max: 80, optional: false }))))
      : [],
    ...(coordinate ? { coordinates: coordinate, geometry: { location: coordinate } } : {}),
  };
}

function cleanMedia(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const assetId = cleanString(value.assetId || '', 'media.assetId', { max: 180 });
  if (!assetId) return null;
  const variant = (name) => {
    const input = value[name];
    if (!input || typeof input !== 'object') return null;
    const url = cleanString(input.url || '', `media.${name}.url`, { max: 1000 });
    const path = cleanString(input.path || '', `media.${name}.path`, { max: 500 });
    return url || path ? { ...(url ? { url } : {}), ...(path ? { path } : {}) } : null;
  };
  return { assetId, large: variant('large'), feed: variant('feed'), thumb: variant('thumb') };
}

function cleanDetails(value) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  assert(Object.keys(input).every((key) => Object.hasOwn(DETAIL_LIMITS, key)),
    'invalid-argument', 'RECOMMENDATION_DRAFT_INVALID', 'details are invalid.');
  return Object.fromEntries(Object.entries(DETAIL_LIMITS).map(([key, max]) => [
    key, cleanString(
      key === 'externalUrl' ? normalizeExternalUrl(input[key]) : input[key] || '',
      `details.${key}`,
      { max }
    ),
  ]).filter(([, entry]) => entry));
}

function sanitizeRecommendationDraft(value) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const step = Number(input.step || 1);
  assert(Number.isSafeInteger(step) && step >= 1 && step <= 4,
    'invalid-argument', 'RECOMMENDATION_DRAFT_INVALID', 'step is invalid.');
  const locationMode = cleanString(input.locationMode || 'exact', 'locationMode', { max: 20, optional: false });
  assert(['exact', 'destination', 'pin'].includes(locationMode),
    'invalid-argument', 'RECOMMENDATION_DRAFT_INVALID', 'locationMode is invalid.');
  const subcategoryIds = Array.isArray(input.subcategoryIds) ? input.subcategoryIds : [];
  assert(subcategoryIds.length <= 3, 'invalid-argument', 'RECOMMENDATION_DRAFT_INVALID', 'Too many subcategories.');
  const media = Array.isArray(input.media) ? input.media.map(cleanMedia).filter(Boolean) : [];
  assert(media.length <= 5, 'invalid-argument', 'RECOMMENDATION_DRAFT_INVALID', 'Too many images.');
  const localMediaCount = Number(input.localMediaCount || 0);
  assert(Number.isSafeInteger(localMediaCount) && localMediaCount >= 0 && localMediaCount <= 5,
    'invalid-argument', 'RECOMMENDATION_DRAFT_INVALID', 'localMediaCount is invalid.');
  assert(media.length + localMediaCount <= 5,
    'invalid-argument', 'RECOMMENDATION_DRAFT_INVALID', 'Too many images.');
  return {
    composerKind: 'catalog-v1',
    step,
    locationMode,
    generalDestination: cleanDestination(input.generalDestination),
    manualCoordinate: cleanCoordinate(input.manualCoordinate),
    selectedCountry: cleanCountry(input.selectedCountry),
    selectedCity: cleanCity(input.selectedCity),
    selectedPlace: cleanPlace(input.selectedPlace),
    locationQuery: cleanString(input.locationQuery || '', 'locationQuery', { max: 500 }),
    categoryId: cleanId(input.categoryId || '', 'categoryId'),
    subcategoryIds: Array.from(new Set(subcategoryIds.map((entry) => cleanId(entry, 'subcategoryId', false)))),
    customSubcategoryLabel: cleanString(input.customSubcategoryLabel || '', 'customSubcategoryLabel', { max: 40 }),
    title: cleanString(input.title || '', 'title', { max: 120 }),
    description: cleanString(input.description || '', 'description', { max: 5000 }),
    budget: cleanId(input.budget || '', 'budget'),
    details: cleanDetails(input.details),
    eventSchedule: cleanString(input.eventSchedule || '', 'eventSchedule', { max: 160 }),
    media,
    localMediaCount,
  };
}

function pointerRef(db, uid) {
  return db.doc(`system/recommendationDrafts/owners/${uid}`);
}

function receiptRef(db, uid, draftId) {
  return pointerRef(db, uid).collection('publicationReceipts').doc(draftId);
}

async function assertEditableSource({ admin, auth, sourceRecommendationId }) {
  if (!sourceRecommendationId) return null;
  const snapshot = await admin.firestore().doc(`recommendations/${sourceRecommendationId}`).get();
  assert(snapshot.exists, 'not-found', 'RECOMMENDATION_SOURCE_NOT_FOUND', 'Recommendation does not exist.');
  const recommendation = snapshot.data() || {};
  const adminAccess = recommendation.ownerId === auth.uid
    ? false
    : await hasActiveAdminAccess({ admin, auth, requireRecentTotp: true });
  assert(recommendation.ownerId === auth.uid || adminAccess,
    'permission-denied', 'RECOMMENDATION_SOURCE_FORBIDDEN', 'Recommendation is unavailable.');
  assert(['active', 'moderation_hold'].includes(recommendation.status || 'active'),
    'failed-precondition', 'RECOMMENDATION_SOURCE_UNAVAILABLE', 'Recommendation cannot be edited right now.');
  return recommendation;
}

async function readVersion(db, pointer) {
  const snapshot = await db.doc(pointer.versionPath).get();
  assert(snapshot.exists, 'not-found', 'RECOMMENDATION_DRAFT_NOT_FOUND', 'Recommendation draft does not exist.');
  const version = snapshot.data() || {};
  assert(version.ownerId === pointer.ownerId && version.state === 'draft',
    'permission-denied', 'RECOMMENDATION_DRAFT_FORBIDDEN', 'Recommendation draft is unavailable.');
  return { ref: snapshot.ref, version };
}

function requireDraftAuth(auth) {
  assert(auth?.uid, 'unauthenticated', 'RECOMMENDATION_DRAFT_AUTH_REQUIRED', 'You must be signed in.');
  assert(isVerifiedCaller(auth), 'permission-denied', 'RECOMMENDATION_DRAFT_AUTH_REQUIRED', 'Email verification is required.');
}

async function getCurrentRecommendationDraft({ admin, auth }) {
  requireDraftAuth(auth);
  const db = admin.firestore();
  const snapshot = await pointerRef(db, auth.uid).get();
  if (!snapshot.exists) return { draft: null };
  const pointer = snapshot.data() || {};
  assert(pointer.ownerId === auth.uid, 'permission-denied', 'RECOMMENDATION_DRAFT_FORBIDDEN', 'Recommendation draft is unavailable.');
  const loaded = await readVersion(db, pointer);
  return { draft: {
    id: pointer.draftId,
    version: pointer.version,
    sourceRecommendationId: pointer.sourceRecommendationId || null,
    updatedAt: pointer.updatedAt || loaded.version.updatedAt || null,
    ...(loaded.version.draft || {}),
  } };
}

async function saveRecommendationDraft({
  admin,
  auth,
  data,
  consumeRateLimitImpl = consumeRateLimit,
  renewTokensImpl = renewResolvedPlaceTokenLeases,
  providerRateLimitKey,
}) {
  requireDraftAuth(auth);
  const db = admin.firestore();
  const incomingDraftId = cleanId(data?.draftId || '', 'draftId');
  const sourceRecommendationId = cleanId(data?.sourceRecommendationId || '', 'sourceRecommendationId');
  const saveRequestId = normalizePublishRequestId(data?.saveRequestId);
  const expectedVersion = data?.expectedVersion == null ? null : Number(data.expectedVersion);
  assert(expectedVersion == null || (Number.isSafeInteger(expectedVersion) && expectedVersion >= 0),
    'invalid-argument', 'RECOMMENDATION_DRAFT_INVALID', 'expectedVersion is invalid.');
  await assertEditableSource({ admin, auth, sourceRecommendationId });
  const draft = sanitizeRecommendationDraft(data?.draft);
  const ownerRef = pointerRef(db, auth.uid);
  const currentSnapshot = await ownerRef.get();
  const current = currentSnapshot.exists ? currentSnapshot.data() || {} : null;
  if (current && saveRequestId && current.lastSaveRequestId === saveRequestId) {
    assert(current.ownerId === auth.uid,
      'permission-denied', 'RECOMMENDATION_DRAFT_FORBIDDEN', 'Recommendation draft is unavailable.');
    assert((current.sourceRecommendationId || '') === (sourceRecommendationId || ''),
      'failed-precondition', 'RECOMMENDATION_DRAFT_SOURCE_MISMATCH', 'Recommendation draft belongs to another recommendation.');
    return {
      draftId: current.draftId,
      version: current.version,
      sourceRecommendationId: current.sourceRecommendationId || null,
      idempotentReplay: true,
    };
  }
  if (current && !incomingDraftId) fail('already-exists', 'RECOMMENDATION_DRAFT_EXISTS', 'A recommendation draft already exists.');
  if (current) {
    assert(current.ownerId === auth.uid && current.draftId === incomingDraftId,
      'permission-denied', 'RECOMMENDATION_DRAFT_FORBIDDEN', 'Recommendation draft is unavailable.');
    assert((current.sourceRecommendationId || '') === (sourceRecommendationId || ''),
      'failed-precondition', 'RECOMMENDATION_DRAFT_SOURCE_MISMATCH', 'Recommendation draft belongs to another recommendation.');
    assert(expectedVersion == null || current.version === expectedVersion,
      'aborted', 'RECOMMENDATION_DRAFT_VERSION_CONFLICT', 'The recommendation draft changed. Reload it and try again.');
    assert(current.state !== 'publishing',
      'failed-precondition', 'RECOMMENDATION_DRAFT_PUBLISHING', 'The recommendation draft is being published.');
  }
  await consumeRateLimitImpl({ admin, uid: auth.uid, action: 'recommendationDraftSave' });
  await renewTokensImpl({
    admin,
    auth,
    providerRateLimitKey,
    resolvedPlaceTokens: [
      draft.selectedPlace?.resolvedPlaceToken,
      draft.generalDestination?.resolvedPlaceToken,
      draft.selectedCity?.resolvedPlaceToken,
    ].filter(Boolean),
  });
  const draftId = current?.draftId || crypto.randomUUID();
  const nextVersion = (current?.version || 0) + 1;
  const versionRef = ownerRef.collection('draftVersions').doc();
  const now = admin.firestore.FieldValue.serverTimestamp();
  await versionRef.create({ ownerId: auth.uid, draftId, draftVersion: nextVersion, state: 'draft', draft, createdAt: now, updatedAt: now, expireAt: null });
  try {
    await db.runTransaction(async (transaction) => {
      const latestSnapshot = await transaction.get(ownerRef);
      const latest = latestSnapshot.exists ? latestSnapshot.data() || {} : null;
      assert((latest?.draftId || '') === (current?.draftId || '') && (latest?.version || 0) === (current?.version || 0),
        'aborted', 'RECOMMENDATION_DRAFT_VERSION_CONFLICT', 'The recommendation draft changed. Reload it and try again.');
      assert(latest?.state !== 'publishing',
        'failed-precondition', 'RECOMMENDATION_DRAFT_PUBLISHING', 'The recommendation draft is being published.');
      transaction.set(ownerRef, {
        ownerId: auth.uid,
        draftId,
        version: nextVersion,
        versionPath: versionRef.path,
        state: 'draft',
        sourceRecommendationId: sourceRecommendationId || null,
        lastSaveRequestId: saveRequestId || null,
        publishRequestId: current?.publishRequestId || crypto.randomUUID(),
        createdAt: current?.createdAt || now,
        updatedAt: now,
      });
      if (current?.versionPath) transaction.update(db.doc(current.versionPath), { expireAt: new Date(Date.now() + DRAFT_VERSION_TTL_MS), supersededAt: now });
    });
  } catch (error) {
    await versionRef.set({ expireAt: new Date(Date.now() + DRAFT_VERSION_TTL_MS) }, { merge: true });
    throw error;
  }
  return { draftId, version: nextVersion, sourceRecommendationId: sourceRecommendationId || null };
}

async function discardRecommendationDraft({ admin, auth, data }) {
  requireDraftAuth(auth);
  const draftId = cleanId(data?.draftId || '', 'draftId', false);
  const db = admin.firestore();
  const ownerRef = pointerRef(db, auth.uid);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ownerRef);
    assert(snapshot.exists, 'not-found', 'RECOMMENDATION_DRAFT_NOT_FOUND', 'Recommendation draft does not exist.');
    const pointer = snapshot.data() || {};
    assert(pointer.ownerId === auth.uid && pointer.draftId === draftId,
      'permission-denied', 'RECOMMENDATION_DRAFT_FORBIDDEN', 'Recommendation draft is unavailable.');
    assert(pointer.state !== 'publishing',
      'failed-precondition', 'RECOMMENDATION_DRAFT_PUBLISHING', 'The recommendation draft is being published.');
    transaction.update(db.doc(pointer.versionPath), { expireAt: new Date(), discardedAt: admin.firestore.FieldValue.serverTimestamp() });
    transaction.delete(ownerRef);
  });
  try {
    await db.recursiveDelete(ownerRef);
  } catch (error) {
    console.error('recommendation_draft_recursive_delete_failed', { uid: auth.uid, ownerPath: ownerRef.path });
  }
  return { discarded: true };
}

function destinationRefForDraft(draft, { includeProvider = false } = {}) {
  const destinationRef = {
    countryId: draft.selectedCountry?.id,
    cityId: draft.selectedCity?.id,
  };
  const providerDestination = draft.locationMode === 'exact'
    ? draft.selectedCity
    : draft.generalDestination;
  if (!includeProvider || !providerDestination?.providerPlaceId) return destinationRef;
  assert(
    (!providerDestination.countryId || providerDestination.countryId === destinationRef.countryId) &&
      (providerDestination.id || providerDestination.cityId) === destinationRef.cityId,
    'invalid-argument',
    'RECOMMENDATION_DRAFT_INVALID',
    'The provider destination does not match the selected destination.'
  );
  return {
    ...destinationRef,
    provider: 'google',
    providerPlaceId: providerDestination.providerPlaceId,
    ...(providerDestination.resolvedPlaceToken
      ? { resolvedPlaceToken: providerDestination.resolvedPlaceToken }
      : {}),
  };
}

function publishData(pointer, draft) {
  const details = { ...draft.details, ...(draft.eventSchedule ? { eventSchedule: draft.eventSchedule } : {}) };
  const data = {
    ...(pointer.sourceRecommendationId
      ? { recommendationId: pointer.sourceRecommendationId }
      : { publishRequestId: normalizePublishRequestId(pointer.publishRequestId) }),
    locationMode: draft.locationMode,
    recommendation: {
      taxonomyVersion: taxonomy.version,
      recommendationCatalogVersion: RECOMMENDATION_CATALOG.schemaVersion,
      title: draft.title,
      description: draft.description,
      budget: draft.budget,
      categoryId: draft.categoryId,
      subcategoryIds: draft.subcategoryIds,
      ...(draft.customSubcategoryLabel ? { customSubcategoryLabel: draft.customSubcategoryLabel } : {}),
      details,
      media: draft.media,
    },
  };
  if (draft.locationMode === 'exact') {
    data.destinationRef = destinationRefForDraft(draft, { includeProvider: true });
    if (draft.selectedPlace?.resolvedPlaceToken) data.resolvedPlaceToken = draft.selectedPlace.resolvedPlaceToken;
    if (draft.selectedPlace?.placeId) data.placeId = draft.selectedPlace.placeId;
  } else {
    data.destinationRef = destinationRefForDraft(draft, { includeProvider: true });
    if (draft.locationMode === 'pin') data.manualLocation = { coordinates: draft.manualCoordinate };
  }
  return data;
}

function assertPublishableRecommendationDraft(draft) {
  assert(Array.isArray(draft?.media) && draft.media.length >= 1,
    'invalid-argument', 'RECOMMENDATION_PHOTO_REQUIRED', 'A recommendation requires at least one image.');
  return draft;
}

async function releaseRecommendationPublishClaim({ db, auth, ownerRef, draftId, expectedVersion }) {
  try {
    await db.runTransaction(async (transaction) => {
      const latestSnapshot = await transaction.get(ownerRef);
      const latest = latestSnapshot.exists ? latestSnapshot.data() || {} : null;
      if (latest?.ownerId === auth.uid && latest?.draftId === draftId &&
          latest?.version === expectedVersion && latest?.state === 'publishing' &&
          latest?.publishingVersion === expectedVersion) {
        transaction.set(ownerRef, {
          state: 'draft',
          publishingVersion: null,
          publishingAt: null,
        }, { merge: true });
      }
    });
  } catch (releaseError) {
    console.error('recommendation_draft_publish_claim_release_failed', {
      uid: auth.uid,
      draftId,
      expectedVersion,
      code: releaseError?.code || 'unknown',
    });
  }
}

async function publishRecommendationDraft(options) {
  const {
    admin,
    auth,
    data,
    saveRecommendationImpl = saveRecommendation,
    ...providerOptions
  } = options;
  requireDraftAuth(auth);
  const draftId = cleanId(data?.draftId || '', 'draftId', false);
  const expectedVersion = Number(data?.expectedVersion);
  assert(Number.isSafeInteger(expectedVersion) && expectedVersion >= 1,
    'invalid-argument', 'RECOMMENDATION_DRAFT_INVALID', 'expectedVersion is invalid.');
  const db = admin.firestore();
  const ownerRef = pointerRef(db, auth.uid);
  const pointerSnapshot = await ownerRef.get();
  if (!pointerSnapshot.exists) {
    const receipt = await receiptRef(db, auth.uid, draftId).get();
    const stored = receipt.exists ? receipt.data() || {} : null;
    assert(stored?.ownerId === auth.uid && stored?.version === expectedVersion,
      'not-found', 'RECOMMENDATION_DRAFT_NOT_FOUND', 'Recommendation draft does not exist.');
    return { ...(stored.result || {}), published: true, idempotentReplay: true };
  }
  const pointer = pointerSnapshot.data() || {};
  assert(pointer.ownerId === auth.uid && pointer.draftId === draftId,
    'permission-denied', 'RECOMMENDATION_DRAFT_FORBIDDEN', 'Recommendation draft is unavailable.');
  assert(pointer.version === expectedVersion,
    'aborted', 'RECOMMENDATION_DRAFT_VERSION_CONFLICT', 'The recommendation draft changed. Reload it and try again.');
  await assertEditableSource({ admin, auth, sourceRecommendationId: pointer.sourceRecommendationId || '' });
  const loaded = await readVersion(db, pointer);
  assertPublishableRecommendationDraft(loaded.version.draft || {});
  const publicationRef = receiptRef(db, auth.uid, draftId);
  const claim = await db.runTransaction(async (transaction) => {
    const [latestSnapshot, receiptSnapshot] = await Promise.all([
      transaction.get(ownerRef),
      transaction.get(publicationRef),
    ]);
    if (receiptSnapshot.exists) {
      const stored = receiptSnapshot.data() || {};
      assert(stored.ownerId === auth.uid && stored.version === expectedVersion,
        'aborted', 'RECOMMENDATION_DRAFT_VERSION_CONFLICT', 'The recommendation draft changed. Reload it and try again.');
      return { replay: stored.result || {} };
    }
    assert(latestSnapshot.exists, 'not-found', 'RECOMMENDATION_DRAFT_NOT_FOUND', 'Recommendation draft does not exist.');
    const latest = latestSnapshot.data() || {};
    assert(latest.ownerId === auth.uid && latest.draftId === draftId,
      'permission-denied', 'RECOMMENDATION_DRAFT_FORBIDDEN', 'Recommendation draft is unavailable.');
    assert(latest.version === expectedVersion && latest.versionPath === pointer.versionPath,
      'aborted', 'RECOMMENDATION_DRAFT_VERSION_CONFLICT', 'The recommendation draft changed. Reload it and try again.');
    assert(latest.state !== 'publishing' || latest.publishingVersion === expectedVersion,
      'failed-precondition', 'RECOMMENDATION_DRAFT_PUBLISHING', 'The recommendation draft is being published.');
    transaction.set(ownerRef, {
      state: 'publishing',
      publishingVersion: expectedVersion,
      publishingAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return { pointer: latest };
  });
  if (claim.replay) return { ...claim.replay, published: true, idempotentReplay: true };

  const claimedPointer = claim.pointer;
  let requestData = publishData(claimedPointer, loaded.version.draft || {});
  let result;
  try {
    try {
      result = await saveRecommendationImpl({ admin, auth, ...providerOptions, data: requestData });
    } catch (error) {
      const expired = requestData.resolvedPlaceToken && requestData.placeId &&
        ['not-found', 'deadline-exceeded'].includes(String(error?.code || '').replace('functions/', '')) &&
        /expired|search again/i.test(String(error?.message || ''));
      if (!expired) throw error;
      const { resolvedPlaceToken, ...fallback } = requestData;
      requestData = fallback;
      result = await saveRecommendationImpl({ admin, auth, ...providerOptions, data: requestData });
    }
  } catch (error) {
    await releaseRecommendationPublishClaim({ db, auth, ownerRef, draftId, expectedVersion });
    throw error;
  }
  let publication;
  try {
    publication = await db.runTransaction(async (transaction) => {
      const [latestSnapshot, receiptSnapshot] = await Promise.all([
        transaction.get(ownerRef),
        transaction.get(publicationRef),
      ]);
      if (receiptSnapshot.exists) {
        const stored = receiptSnapshot.data() || {};
        assert(stored.ownerId === auth.uid && stored.version === expectedVersion,
          'aborted', 'RECOMMENDATION_DRAFT_VERSION_CONFLICT', 'The recommendation draft changed. Reload it and try again.');
        return stored.result || {};
      }
      assert(latestSnapshot.exists, 'not-found', 'RECOMMENDATION_DRAFT_NOT_FOUND', 'Recommendation draft does not exist.');
      const latest = latestSnapshot.data() || {};
      assert(latest.ownerId === auth.uid && latest.draftId === draftId,
        'permission-denied', 'RECOMMENDATION_DRAFT_FORBIDDEN', 'Recommendation draft is unavailable.');
      assert(latest.version === expectedVersion && latest.state === 'publishing' && latest.publishingVersion === expectedVersion,
        'aborted', 'RECOMMENDATION_DRAFT_VERSION_CONFLICT', 'The recommendation draft changed. Reload it and try again.');
      transaction.set(publicationRef, {
        ownerId: auth.uid, draftId, version: expectedVersion, result,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expireAt: new Date(Date.now() + PUBLICATION_RECEIPT_TTL_MS),
      });
      transaction.update(loaded.ref, { expireAt: new Date(), publishedAt: admin.firestore.FieldValue.serverTimestamp() });
      transaction.delete(ownerRef);
      return result;
    });
  } catch (error) {
    await releaseRecommendationPublishClaim({ db, auth, ownerRef, draftId, expectedVersion });
    throw error;
  }
  try {
    await db.recursiveDelete(loaded.ref);
  } catch (error) {
    console.error('recommendation_draft_recursive_delete_failed', {
      uid: auth.uid,
      versionPath: loaded.ref.path,
    });
  }
  return { ...publication, published: true };
}

async function cleanupRecommendationDraftArtifacts({ admin, limit = 100, now = new Date() }) {
  const db = admin.firestore();
  const [versions, receipts] = await Promise.all([
    db.collectionGroup('draftVersions').where('expireAt', '<=', now).limit(limit).get(),
    db.collectionGroup('publicationReceipts').where('expireAt', '<=', now).limit(limit).get(),
  ]);
  let deleted = 0;
  for (const document of [...versions.docs, ...receipts.docs]) {
    const path = document.ref.path;
    if (!path.startsWith('system/recommendationDrafts/owners/')) continue;
    await document.ref.delete();
    deleted += 1;
  }
  return { scanned: versions.size + receipts.size, deleted };
}

module.exports = {
  assertPublishableRecommendationDraft,
  assertEditableSource,
  cleanupRecommendationDraftArtifacts,
  discardRecommendationDraft,
  getCurrentRecommendationDraft,
  pointerRef,
  publishData,
  publishRecommendationDraft,
  sanitizeRecommendationDraft,
  saveRecommendationDraft,
};
