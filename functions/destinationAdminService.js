const crypto = require('crypto');
const { FieldPath } = require('firebase-admin/firestore');
const { HttpsError } = require('firebase-functions/v2/https');

const { audit, prepareAdminAction } = require('./adminService');
const {
  closestScheduledAirport,
  downloadAirports,
  nearestScheduledAirports,
} = require('./airportFacts');
const { catalogId, syncDestinationCatalog } = require('./destinationCatalogService');
const {
  consumeUnsplashBudget,
  destinationImageContext,
  destinationImageWritePatch,
  destinationQuery,
  resolveAndPersistDestinationIdentity,
  resolveAndPersistDestinationImage,
  resolveDestinationImageCandidate,
  trackUnsplashDownload,
} = require('./destinationImageService');
const { resolveWikimediaDestinationImage } = require('./wikimediaDestinationImageService');
const { buildDownloadUrl, getMediaBucket } = require('./mediaProcessor');
const { destinationKey } = require('./discoverySearch');
const {
  destinationAcceptsNewReferences,
  destinationIsPublicAndReferenceable,
} = require('./destinationReferencePolicy');
const { destinationHebrewName, hasHebrewName } = require('./destinationLocalizationService');
const {
  DESTINATION_KINDS,
  GROUPING_POLICIES,
  MATCH_PROFILE_VERSION,
  REGISTRY_PATH,
  REGISTRY_VERSION,
  clearRegistryCache,
  derivedRadiusKm,
  destinationTypeForKind,
  isValidRegistryId,
  legacyRegistryId,
  registryCollectionIssues,
  validateRegistryEntry,
  viewportDiagonalKm,
} = require('./canonicalDestinationRegistry');
const {
  getDestinationRenameJobRef,
  startDestinationRename,
} = require('./destinationRenameService');
const {
  jobRef: destinationReassignmentJobRef,
  previewDestinationReassignment: previewReassignment,
  startDestinationReassignment: queueDestinationReassignment,
} = require('./destinationReassignmentService');
const {
  buildNotificationTarget,
  destinationNotificationId,
  fanoutAdminNotification,
  navigationForTarget,
  notificationRecipientEligible,
  stageNotificationActivity,
  systemNotificationId,
} = require('./notificationService');

const PAGE_SIZE = 30;
const IMAGE_VARIANTS = ['large', 'feed', 'thumb'];
const IMAGE_VALIDATION_VERSION = 1;
const DESTINATION_PUBLICATION_FENCE_RECOVERY_MS = 10 * 60 * 1000;

function fail(code, message, reason) {
  throw new HttpsError(code, message, { reason });
}

function cleanId(value, field) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > 180 || text.includes('/')) fail('invalid-argument', `${field} is invalid.`, 'invalid_input');
  return text;
}

function cleanReason(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length < 3 || text.length > 500) fail('invalid-argument', 'Reason is invalid.', 'invalid_input');
  return text;
}

function serialize(value) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(serialize);
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)]));
  return value;
}

function normalizeAirportCode(value) {
  return String(value || '').trim().toUpperCase();
}

function withAirportCode(airport) {
  return airport && normalizeAirportCode(airport.iataCode);
}

function selectAirportByIataCode(cityCoordinates, airports, rawIataCode, options = {}) {
  const requestedCode = normalizeAirportCode(rawIataCode);
  const maxDistanceKm = Number.isFinite(Number(options.maxDistanceKm))
    ? Number(options.maxDistanceKm)
    : null;
  const enforceMaxDistance = options.enforceMaxDistance !== false;
  if (!requestedCode) return null;
  const directMatch = nearestScheduledAirports(cityCoordinates, airports, options)
    .find((airport) => withAirportCode(airport) === requestedCode);
  if (directMatch) return directMatch;
  const fallbackAirport = airports.find((airport) => withAirportCode(airport) === requestedCode);
  if (!fallbackAirport) return null;
  const withDistance = nearestScheduledAirports(
    cityCoordinates,
    [fallbackAirport],
    { ...options, maxDistanceKm: Number.MAX_SAFE_INTEGER }
  );
  if (!withDistance[0] && maxDistanceKm !== null && enforceMaxDistance) return null;
  return withDistance[0] || null;
}

function timestampMs(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  return Date.parse(value) || 0;
}

function normalizedCoordinates(value) {
  const valueAsArray = Array.isArray(value) ? value : null;
  const valueAsObject = value && typeof value === 'object' ? value : null;
  const lat = Number(
    valueAsObject?.lat ??
    valueAsObject?.latitude ??
    valueAsArray?.[1] ??
    valueAsObject?.point?.lat ??
    valueAsObject?.point?.latitude ??
    valueAsObject?.point?.y ??
    valueAsObject?.geometry?.coordinates?.[1] ??
    valueAsObject?.geometry?.lat ??
    valueAsObject?.geometry?.location?.lat ??
    valueAsObject?.geometry?.location?.latitude ??
    valueAsObject?.location?.lat ??
    valueAsObject?.location?.latitude ??
    valueAsObject?.position?.lat ??
    valueAsObject?.position?.latitude ??
    valueAsObject?.coordinates?.lat ??
    valueAsObject?.coordinates?.latitude ??
    valueAsObject?.geoPoint?.lat ??
    valueAsObject?.googlePlace?.geometry?.location?.lat
  );
  const lng = Number(
    valueAsObject?.lng ??
    valueAsObject?.longitude ??
    valueAsArray?.[0] ??
    valueAsObject?.point?.lng ??
    valueAsObject?.point?.longitude ??
    valueAsObject?.point?.x ??
    valueAsObject?.geometry?.coordinates?.[0] ??
    valueAsObject?.geometry?.lng ??
    valueAsObject?.geometry?.location?.lng ??
    valueAsObject?.geometry?.location?.longitude ??
    valueAsObject?.location?.lng ??
    valueAsObject?.location?.longitude ??
    valueAsObject?.position?.lng ??
    valueAsObject?.position?.longitude ??
    valueAsObject?.coordinates?.lng ??
    valueAsObject?.coordinates?.longitude ??
    valueAsObject?.geoPoint?.lng ??
    valueAsObject?.googlePlace?.geometry?.location?.lng
  );
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function destinationCoordinates(destination) {
  const candidates = [
    destination?.googleCache?.coordinates,
    destination?.googleCache?.geometry?.location,
    destination?.identity?.coordinates,
    destination?.identity?.geometry?.location,
    destination?.mapLocation,
    destination?.mapLocation?.location,
    destination?.geometry,
    destination?.geometry?.location,
    destination?.coordinates,
    destination?.coords,
    destination?.location,
    destination?.location?.location,
    destination?.location?.coordinates,
    destination?.place?.coordinates,
    destination?.place?.geometry?.location,
    destination?.providerRefs?.coords,
    destination?.providerRefs?.geoPoint,
    destination?.providerRefs?.coordinates,
  ];
  for (const candidate of candidates) {
    const normalized = normalizedCoordinates(candidate);
    if (normalized) return normalized;
  }
  return null;
}

function qualityIssues(destination, job = {}, review = {}, now = Date.now()) {
  const issues = [];
  const add = (code, severity, label) => issues.push({ code, severity, label });
  const googleNames = destination?.googleCache?.names || {};
  const identityNames = destination?.identity?.names || {};
  const names = { he: googleNames.he || identityNames.he, en: googleNames.en || identityNames.en };
  const placeId = destination?.providerRefs?.googlePlaceId || destination?.googleCache?.placeId;
  const googleCountry = String(destination?.googleCache?.countryCode || '').toUpperCase();
  const identityCountry = String(destination?.identity?.countryCode || '').toUpperCase();
  const image = destination?.destinationImage;
  const imageType = image?.source?.type;
  const validation = image?.selection?.validation;

  if (!hasHebrewName(names.he)) add('missing_hebrew_name', 'error', 'חסר שם בעברית');
  if (destination?.googleCache?.nameSources?.he === 'transliteration_fallback') {
    add('fallback_hebrew_name', 'warning', 'שם היעד תועתק אוטומטית וממתין לבדיקה');
  }
  if (destination?.canonicalPolicy?.approved !== true) {
    add('unapproved_canonical_destination', 'error', 'היעד אינו מאושר במאגר היעדים הקנוני');
  }
  if (!names.en) add('missing_english_name', 'error', 'חסר שם באנגלית');
  if (!placeId) add('missing_google_place', 'error', 'חסר מזהה מקום מאומת של גוגל');
  if (!googleCountry && !identityCountry) add('missing_country_code', 'error', 'חסר קוד מדינה');
  if (googleCountry && identityCountry && googleCountry !== identityCountry) add('country_conflict', 'error', 'קיימת סתירה בזיהוי המדינה');
  if (!destinationCoordinates(destination)) add('missing_coordinates', 'error', 'חסרות נקודות ציון');
  if (destination?.googleCache && timestampMs(destination.googleCache.expiresAt) <= now) add('stale_google_cache', 'warning', 'נתוני המקום של גוגל אינם מעודכנים');
  if (!image?.urls?.large || !image?.urls?.feed || !image?.urls?.thumb) add('missing_image', 'warning', 'חסרה תמונת יעד מלאה');
  if (['unsplash', 'wikimedia'].includes(imageType) && Number(validation?.version || 0) < IMAGE_VALIDATION_VERSION) add('unvalidated_image', 'warning', 'התמונה טרם אומתה מול היעד');
  if (['unsplash', 'wikimedia'].includes(imageType) && !image?.attribution?.providerName) add('missing_image_attribution', 'warning', 'חסר קרדיט לתמונה');
  if (imageType === 'recommendation') add('weak_image_fallback', 'warning', 'מוצגת תמונת המלצה במקום תמונת יעד');
  if (destinationCoordinates(destination) && !destination?.travelFacts?.closestAirport) add('missing_airport', 'warning', 'לא נמצא שדה תעופה קרוב');
  if (['failed', 'retry'].includes(job?.imageSync?.state)) add('image_job_failed', 'warning', 'בדיקת התמונה נכשלה או ממתינה לניסיון נוסף');
  if (['failed', 'needs_review'].includes(job?.identitySync?.state)) add('identity_job_failed', 'warning', 'זיהוי העיר דורש בדיקה');
  if (!review?.approvedAt) add('new_destination', 'info', 'העיר טרם אושרה ידנית');
  return issues;
}

function reviewId(countryId, cityId) {
  return crypto.createHash('sha256').update(`${countryId}\n${cityId}`).digest('base64url');
}

function reviewRef(db, countryId, cityId) {
  return db.doc(`system/moderation/destinationReviews/${reviewId(countryId, cityId)}`);
}

async function destinationBundle(admin, countryId, cityId) {
  const db = admin.firestore();
  const cityRef = db.doc(`countries/${countryId}/destinations/${cityId}`);
  const [citySnapshot, countrySnapshot, jobSnapshot, reviewSnapshot] = await Promise.all([
    cityRef.get(),
    db.doc(`countries/${countryId}`).get(),
    db.doc(`system/runtime/destinationJobs/${countryId}_${cityId}`).get(),
    reviewRef(db, countryId, cityId).get(),
  ]);
  if (!citySnapshot.exists) fail('not-found', 'Destination was not found.', 'destination_missing');
  return {
    cityRef,
    city: citySnapshot.data() || {},
    country: countrySnapshot.data() || {},
    job: jobSnapshot.data() || {},
    review: reviewSnapshot.data() || {},
  };
}

async function evaluateAndPersistDestination({ admin, countryId, cityId, created = false }) {
  const bundle = await destinationBundle(admin, countryId, cityId);
  const issues = qualityIssues(bundle.city, bundle.job, created ? {} : bundle.review);
  const blocking = issues.filter((issue) => issue.severity === 'error').length;
  const status = bundle.city.status === 'inactive' ? 'inactive' : blocking ? 'blocked' : issues.length ? 'open' : 'ready';
  const storedNames = bundle.city.googleCache?.names || bundle.city.identity?.names || {};
  const payload = {
    countryId,
    cityId,
    names: { ...storedNames, he: destinationHebrewName(bundle.city) || storedNames.he || cityId },
    countryNames: bundle.country.names || { he: bundle.country.name || countryId },
    destinationStatus: bundle.city.status || 'active',
    status,
    issues,
    issueCodes: issues.map((issue) => issue.code),
    image: bundle.city.destinationImage || null,
    closestAirport: bundle.city.travelFacts?.closestAirport || null,
    recommendationCount: Math.max(0, Number(bundle.city.stats?.recommendationCount || 0)),
    job: bundle.job,
    notificationVersion: Math.max(1, Math.trunc(Number(bundle.review.notificationVersion) || 1)),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    ...(created ? { discoveredAt: admin.firestore.FieldValue.serverTimestamp() } : {}),
  };
  await reviewRef(admin.firestore(), countryId, cityId).set(payload, { merge: true });
  return serialize({ id: reviewId(countryId, cityId), ...payload });
}

async function notifyAdminsOfDestination({
  admin,
  countryId,
  cityId,
  destination = null,
  fanout = fanoutAdminNotification,
}) {
  const target = {
    type: 'destination',
    countryId,
    cityId,
    title: destination?.names?.he || destination?.names?.en || '',
    thumbUrls: [
      destination?.image?.urls?.thumb,
      destination?.image?.urls?.feed,
    ].filter(Boolean),
  };
  return fanout({
    admin,
    notificationId: destinationNotificationId(countryId, cityId),
    createOnly: true,
    activityVersion: Math.max(1, Math.trunc(Number(destination?.notificationVersion) || 1)),
    notification: {
      channel: 'admin',
      type: 'moderation',
      subtype: 'destination_review_discovered',
      priority: 'normal',
      count: 1,
      target: buildNotificationTarget({ target, data: destination || {} }),
      navigation: navigationForTarget(target),
    },
  });
}

async function onDestinationCreated({ admin, countryId, cityId }) {
  const initial = await evaluateAndPersistDestination({ admin, countryId, cityId, created: true });
  await notifyAdminsOfDestination({ admin, countryId, cityId, destination: initial });
  await syncDestinationAirport({
    admin,
    countryId,
    cityId,
    applyWhenMissingOnly: true,
  }).catch((error) => {
    console.error('destination_airport_sync_failed', {
      countryId,
      cityId,
      reason: error?.code || error?.message || 'unknown',
    });
  });
  return evaluateAndPersistDestination({ admin, countryId, cityId }).catch(() => initial);
}

async function syncDestinationAirport({
  admin,
  countryId,
  cityId,
  applyWhenMissingOnly = false,
}) {
  const bundle = await destinationBundle(admin, countryId, cityId);
  if (applyWhenMissingOnly) {
    const existing = bundle.city?.travelFacts?.closestAirport || bundle.city?.closestAirport;
    const existingIataCode = String(existing?.iataCode || '').trim().toUpperCase();
    if (/^[A-Z0-9]{3}$/.test(existingIataCode)) return { updated: false, updatedByAdmin: false };
  }
  const coordinates = destinationCoordinates(bundle.city);
  if (!coordinates) return { updated: false, reason: 'missing_coordinates' };
  const downloaded = await downloadAirports({});
  const closest = closestScheduledAirport(coordinates, downloaded.airports);
  if (!closest) return { updated: false, reason: 'missing_airport' };
  await bundle.cityRef.update({
    'travelFacts.closestAirport': {
      name: closest.name,
      iataCode: closest.iataCode,
      distanceKm: Math.round((Number(closest.distanceKm) || 0) * 10) / 10,
      source: 'OurAirports',
      sourceUpdatedAt: downloaded.sourceUpdatedAt,
      selectedByAdmin: false,
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { updated: true, iataCode: closest.iataCode };
}

async function scanDestinationQuality({ admin, limit = 50 }) {
  const db = admin.firestore();
  const expiredCandidates = await db.collectionGroup('imageCandidates')
    .where('expireAt', '<=', new Date())
    .limit(100)
    .get();
  if (!expiredCandidates.empty) {
    const cleanup = db.batch();
    expiredCandidates.docs.forEach((document) => cleanup.delete(document.ref));
    await cleanup.commit();
  }
  const stateRef = db.doc('system/runtime/destinationQualityScan/current');
  const state = (await stateRef.get()).data() || {};
  let query = db.collectionGroup('destinations').orderBy(FieldPath.documentId()).limit(Math.max(1, Math.min(100, limit)));
  if (state.cursorPath) {
    const cursor = await db.doc(state.cursorPath).get();
    if (cursor.exists) query = query.startAfter(cursor);
  }
  const snapshot = await query.get();
  for (const document of snapshot.docs) {
    const segments = document.ref.path.split('/');
    await evaluateAndPersistDestination({ admin, countryId: segments[1], cityId: document.id });
  }
  const complete = snapshot.size < limit;
  await stateRef.set({
    cursorPath: complete ? admin.firestore.FieldValue.delete() : snapshot.docs.at(-1)?.ref.path,
    completedAt: complete ? admin.firestore.FieldValue.serverTimestamp() : admin.firestore.FieldValue.delete(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  return { scanned: snapshot.size, expiredCandidatesRemoved: expiredCandidates.size, complete };
}

async function listDestinationReviews({ admin, auth, data }) {
  await prepareAdminAction(admin, auth, 'listDestinationReviews');
  const requestedStatus = typeof data?.status === 'string' ? data.status : 'all';
  const db = admin.firestore();
  const collection = db.collection('system/moderation/destinationReviews');
  const cursor = data?.cursor
    ? await db.doc(`system/moderation/destinationReviews/${cleanId(data.cursor, 'cursor')}`).get()
    : null;
  let documents = [];
  if (requestedStatus !== 'all') {
    let query = collection.where('status', '==', requestedStatus).orderBy('updatedAt', 'desc').limit(PAGE_SIZE);
    if (cursor?.exists) query = query.startAfter(cursor);
    documents = (await query.get()).docs;
  } else {
    const pendingStatuses = ['blocked', 'open', 'ready'];
    const reviewedStatuses = ['approved', 'approved_with_warnings', 'inactive'];
    const cursorIsPending = cursor?.exists && pendingStatuses.includes(cursor.data()?.status);
    if (!cursor?.exists || cursorIsPending) {
      let pendingQuery = collection.where('status', 'in', pendingStatuses).orderBy('updatedAt', 'desc').limit(PAGE_SIZE);
      if (cursorIsPending) pendingQuery = pendingQuery.startAfter(cursor);
      documents = (await pendingQuery.get()).docs;
    }
    if (documents.length < PAGE_SIZE) {
      let reviewedQuery = collection.where('status', 'in', reviewedStatuses)
        .orderBy('updatedAt', 'desc')
        .limit(PAGE_SIZE - documents.length);
      if (cursor?.exists && !cursorIsPending) reviewedQuery = reviewedQuery.startAfter(cursor);
      documents.push(...(await reviewedQuery.get()).docs);
    }
  }
  return {
    items: documents.map((entry) => serialize({ id: entry.id, ...entry.data() })),
    nextCursor: documents.length === PAGE_SIZE ? documents.at(-1).id : null,
  };
}

async function getDestinationReview({ admin, auth, data }) {
  await prepareAdminAction(admin, auth, 'getDestinationReview');
  const countryId = cleanId(data?.countryId, 'countryId');
  const cityId = cleanId(data?.cityId, 'cityId');
  const bundle = await destinationBundle(admin, countryId, cityId);
  return serialize({
    countryId,
    cityId,
    city: bundle.city,
    country: bundle.country,
    job: bundle.job,
    review: bundle.review,
    issues: qualityIssues(bundle.city, bundle.job, bundle.review),
  });
}

async function setDestinationHebrewName({ admin, auth, data }) {
  await prepareAdminAction(admin, auth, 'setDestinationHebrewName');
  const countryId = cleanId(data?.countryId, 'countryId');
  const cityId = cleanId(data?.cityId, 'cityId');
  const reason = cleanReason(data?.reason);
  const result = await startDestinationRename({
    admin,
    countryId,
    cityId,
    nameHe: data?.nameHe,
    reason,
    requestedBy: auth.uid,
  });
  await audit({
    admin,
    auth,
    action: 'destination_hebrew_name_set',
    target: { countryId, cityId },
    reason,
    metadata: { jobId: result.jobId },
  });
  return result;
}

async function getDestinationRenameJob({ admin, auth, data }) {
  await prepareAdminAction(admin, auth, 'getDestinationRenameJob');
  const jobId = cleanId(data?.jobId, 'jobId');
  const snapshot = await getDestinationRenameJobRef(admin.firestore(), jobId).get();
  if (!snapshot.exists) fail('not-found', 'Destination rename job was not found.', 'rename_job_missing');
  return serialize({ jobId: snapshot.id, ...snapshot.data() });
}

function cleanPolicyAliases(value) {
  if (!Array.isArray(value) || value.length > 30) fail('invalid-argument', 'Aliases are invalid.', 'invalid_aliases');
  const aliases = Array.from(new Set(value.map((item) => String(item || '').normalize('NFC').trim().replace(/\s+/g, ' '))
    .filter(Boolean)));
  if (aliases.some((alias) => alias.length < 2 || alias.length > 80)) fail('invalid-argument', 'Aliases are invalid.', 'invalid_aliases');
  return aliases;
}

function destinationProviderPlaceId(destination) {
  return String(
    destination?.providerRefs?.googlePlaceId || destination?.googleCache?.placeId || ''
  ).trim();
}

function registryProviderPlaceIds(entry) {
  return Array.from(new Set([
    entry?.providerRefs?.googlePlaceId,
    ...(Array.isArray(entry?.providerRefs?.googlePlaceIds)
      ? entry.providerRefs.googlePlaceIds
      : []),
  ].map((value) => String(value || '').trim()).filter(Boolean)));
}

function selectDestinationPolicyRegistryBinding({
  currentCity,
  countryCode,
  destinationPath,
  fallbackRegistryId,
  registryEntries,
}) {
  const providerPlaceId = destinationProviderPlaceId(currentCity);
  const previousRegistryId = String(currentCity?.canonicalPolicy?.registryId || '').trim();
  const preferredRegistryId = isValidRegistryId(previousRegistryId)
    ? previousRegistryId
    : String(fallbackRegistryId || '').trim();
  const normalizedCountryCode = String(countryCode || '').trim().toUpperCase();
  const entries = Array.isArray(registryEntries) ? registryEntries : [];
  const byId = new Map(entries.map((entry) => [String(entry?.id || '').trim(), entry]));
  const providerOwners = providerPlaceId
    ? entries.filter((entry) => registryProviderPlaceIds(entry).includes(providerPlaceId))
    : [];
  if (providerOwners.length > 1) {
    return { issue: 'duplicate_google_place_id' };
  }

  const primaryOwner = providerOwners.find((entry) =>
    String(entry?.providerRefs?.googlePlaceId || '').trim() === providerPlaceId
  );
  if (providerOwners.length === 1 && !primaryOwner) {
    return { issue: 'destination_registry_provider_mismatch' };
  }

  const selectedEntry = primaryOwner || byId.get(preferredRegistryId) || null;
  if (selectedEntry) {
    if (String(selectedEntry.countryCode || '').trim().toUpperCase() !== normalizedCountryCode) {
      return { issue: 'destination_country_mismatch' };
    }
    const boundPath = String(selectedEntry.destinationPath || '').trim();
    if (boundPath && boundPath !== destinationPath) {
      return { issue: 'destination_registry_path_mismatch' };
    }
    const selectedPrimaryProvider = String(selectedEntry?.providerRefs?.googlePlaceId || '').trim();
    if (!providerPlaceId || selectedPrimaryProvider !== providerPlaceId) {
      return { issue: 'destination_registry_provider_mismatch' };
    }
  }

  if (primaryOwner && preferredRegistryId && byId.has(preferredRegistryId) &&
      primaryOwner.id !== preferredRegistryId) {
    return { issue: 'destination_registry_provider_mismatch' };
  }

  const registryId = String(primaryOwner?.id || preferredRegistryId).trim();
  if (!registryId) return { issue: 'destination_registry_provider_mismatch' };
  return {
    registryId,
    existingEntry: selectedEntry,
    adoptedExistingProvider: Boolean(primaryOwner && primaryOwner.id !== preferredRegistryId),
    previousRegistryId: previousRegistryId || null,
    fingerprint: JSON.stringify({
      registryId,
      providerPlaceId,
      countryCode: normalizedCountryCode,
      destinationPath,
      ownerProviderPlaceId: selectedEntry
        ? String(selectedEntry?.providerRefs?.googlePlaceId || '').trim()
        : null,
      ownerCountryCode: selectedEntry
        ? String(selectedEntry.countryCode || '').trim().toUpperCase()
        : null,
      ownerDestinationPath: selectedEntry
        ? String(selectedEntry.destinationPath || '').trim()
        : null,
    }),
  };
}

function buildDestinationPolicyRegistryPlan({
  binding,
  currentCity,
  countryCode,
  cityId,
  aliases,
  kind,
  parentId,
  groupingPolicy,
  reason,
  actorUid,
}) {
  const policyPatch = {
    aliases,
    kind,
    parentId,
    groupingPolicy,
    approval: { approvedByAdmin: false, reason, policyValidatedBy: actorUid },
    status: 'pending_review',
    registryVersion: REGISTRY_VERSION,
  };
  if (binding.existingEntry) {
    return {
      validationEntry: {
        ...binding.existingEntry,
        id: binding.registryId,
        ...policyPatch,
      },
      writeData: policyPatch,
    };
  }

  const center = destinationCoordinates(currentCity);
  const viewport = currentCity.googleCache?.viewport || currentCity.identity?.viewport || null;
  const googleTypes = currentCity.googleCache?.types || currentCity.identity?.types || [];
  const registryEntry = {
    id: binding.registryId,
    countryCode: String(countryCode || '').toUpperCase(),
    names: {
      he: destinationHebrewName(currentCity) || cityId,
      en: currentCity.googleCache?.names?.en || currentCity.identity?.names?.en || cityId,
    },
    ...policyPatch,
    providerRefs: currentCity.providerRefs || {},
    center,
    viewport,
    googleTypes,
    ...(center && viewportDiagonalKm(viewport) === null
      ? { radiusKm: derivedRadiusKm({ kind, googleTypes }) }
      : {}),
    geometryPolicy: {
      autoMatchEligible: false,
      aliasAutoMatchEligible: true,
      source: 'admin_approved_aliases',
      version: MATCH_PROFILE_VERSION,
    },
  };
  const writeData = { ...registryEntry };
  delete writeData.id;
  return { validationEntry: registryEntry, writeData };
}

function destinationPolicyRegistryBindingIssue(expectedBinding, currentBinding) {
  if (currentBinding?.issue) return currentBinding.issue;
  if (!expectedBinding || currentBinding?.registryId !== expectedBinding.registryId) {
    return 'destination_registry_changed';
  }
  if (!expectedBinding.fingerprint || currentBinding?.fingerprint !== expectedBinding.fingerprint) {
    return 'destination_registry_changed';
  }
  if (expectedBinding.expectedExistingOwner && !currentBinding?.existingEntry) {
    return 'destination_registry_changed';
  }
  return null;
}

async function updateDestinationPolicy({ admin, auth, data }) {
  await prepareAdminAction(admin, auth, 'updateDestinationPolicy');
  const countryId = cleanId(data?.countryId, 'countryId');
  const cityId = cleanId(data?.cityId, 'cityId');
  const reason = cleanReason(data?.reason);
  const kind = String(data?.kind || '').trim();
  const groupingPolicy = String(data?.groupingPolicy || '').trim();
  if (!DESTINATION_KINDS.includes(kind)) fail('invalid-argument', 'Destination kind is invalid.', 'invalid_kind');
  if (!GROUPING_POLICIES.includes(groupingPolicy)) fail('invalid-argument', 'Grouping policy is invalid.', 'invalid_grouping_policy');
  const parentId = data?.parentId ? cleanId(data.parentId, 'parentId') : null;
  const aliases = cleanPolicyAliases(data?.aliases || []);
  const bundle = await destinationBundle(admin, countryId, cityId);
  const db = admin.firestore();
  const countryRef = db.doc(`countries/${countryId}`);
  const timestamp = admin.firestore.FieldValue.serverTimestamp();
  const drainOperationId = crypto.randomUUID();
  let registryId = '';
  let registryRef = null;
  let registryBinding = null;
  let policy = null;
  let syncedCity = null;
  let destinationType = '';
  await db.runTransaction(async (transaction) => {
    const [citySnapshot, countrySnapshot, registrySnapshot] = await Promise.all([
      transaction.get(bundle.cityRef),
      transaction.get(countryRef),
      transaction.get(db.collection(REGISTRY_PATH)),
    ]);
    if (!citySnapshot.exists || !countrySnapshot.exists || countrySnapshot.data()?.status !== 'active') {
      fail('failed-precondition', 'Destination identity changed before policy update.', 'destination_changed');
    }
    const currentCity = citySnapshot.data() || {};
    const currentCountry = countrySnapshot.data() || {};
    const countryCode = String(currentCountry.code || countryId).toUpperCase();
    const fallbackRegistryId = legacyRegistryId(countryCode, countryId, cityId);
    const registryEntries = registrySnapshot.docs
      .map((document) => ({ id: document.id, ...document.data() }));
    const binding = selectDestinationPolicyRegistryBinding({
      currentCity,
      countryCode,
      destinationPath: bundle.cityRef.path,
      fallbackRegistryId,
      registryEntries,
    });
    if (binding.issue) {
      fail('failed-precondition', 'Destination policy conflicts with the canonical registry.', binding.issue);
    }
    registryId = binding.registryId;
    registryBinding = {
      registryId,
      previousRegistryId: binding.previousRegistryId,
      adoptedExistingProvider: binding.adoptedExistingProvider,
      expectedExistingOwner: Boolean(binding.existingEntry),
      fingerprint: binding.fingerprint,
    };
    policy = {
      approved: false,
      registryId,
      kind,
      parentId,
      groupingPolicy,
      aliases,
      registryVersion: REGISTRY_VERSION,
      provisional: true,
      reviewState: 'policy_validated',
      policyValidatedBy: auth.uid,
      approvalRevision: Math.max(0, Number(currentCity.canonicalPolicy?.approvalRevision || 0)) + 1,
    };
    const registryPlan = buildDestinationPolicyRegistryPlan({
      binding,
      currentCity,
      countryCode,
      cityId,
      aliases,
      kind,
      parentId,
      groupingPolicy,
      reason,
      actorUid: auth.uid,
    });
    const entryValidation = validateRegistryEntry(registryPlan.validationEntry, { requireResearchSources: false });
    if (!entryValidation.valid) {
      fail('failed-precondition', 'Destination policy does not satisfy registry requirements.', entryValidation.errors[0]);
    }
    const entries = registrySnapshot.docs
      .filter((document) => document.id !== registryId)
      .map((document) => ({ id: document.id, ...document.data() }));
    const collectionIssues = registryCollectionIssues([...entries, registryPlan.validationEntry]);
    if (collectionIssues.length) {
      fail('failed-precondition', 'Destination policy conflicts with the canonical registry.', collectionIssues[0].code);
    }
    destinationType = destinationTypeForKind(kind);
    transaction.update(bundle.cityRef, {
      publicationFence: {
        state: 'draining',
        reason: 'destination_policy_review',
        operationId: drainOperationId,
        actorUid: auth.uid,
        approvalRevision: policy.approvalRevision,
        fencedAt: timestamp,
      },
      updatedAt: timestamp,
    });
  });
  registryRef = db.doc(`${REGISTRY_PATH}/${registryId}`);
  const held = await holdLinkedDestinationContent({
    admin,
    countryId,
    cityId,
    reason,
    actorUid: auth.uid,
    holdReason: 'destination_policy_review',
  });
  await db.runTransaction(async (transaction) => {
    const [citySnapshot, countrySnapshot, registrySnapshot, activeLinkedContent] = await Promise.all([
      transaction.get(bundle.cityRef),
      transaction.get(countryRef),
      transaction.get(db.collection(REGISTRY_PATH)),
      activeLinkedDestinationContentInTransaction({ transaction, db, countryId, cityId }),
    ]);
    const currentCity = citySnapshot.data() || {};
    const currentFence = currentCity.publicationFence || {};
    if (!citySnapshot.exists || !countrySnapshot.exists || countrySnapshot.data()?.status !== 'active' ||
        currentFence.state !== 'draining' || currentFence.reason !== 'destination_policy_review' ||
        currentFence.operationId !== drainOperationId ||
        Number(currentFence.approvalRevision || 0) !== Number(policy.approvalRevision || 0) ||
        Number(currentCity.canonicalPolicy?.approvalRevision || 0) !== Number(policy.approvalRevision || 0) - 1) {
      fail('aborted', 'Destination changed while linked content was being held.', 'destination_fence_changed');
    }
    if (activeLinkedContent.length) {
      fail('aborted', 'Linked public content changed while the destination was being held.', 'destination_drain_incomplete');
    }
    const currentCountry = countrySnapshot.data() || {};
    const countryCode = String(currentCountry.code || countryId).toUpperCase();
    const registryEntries = registrySnapshot.docs
      .map((document) => ({ id: document.id, ...document.data() }));
    const binding = selectDestinationPolicyRegistryBinding({
      currentCity,
      countryCode,
      destinationPath: bundle.cityRef.path,
      fallbackRegistryId: registryId,
      registryEntries,
    });
    const bindingIssue = destinationPolicyRegistryBindingIssue(registryBinding, binding);
    if (bindingIssue) {
      fail('aborted', 'Destination registry identity changed while policy was being updated.',
        bindingIssue);
    }
    const registryPlan = buildDestinationPolicyRegistryPlan({
      binding,
      currentCity,
      countryCode,
      cityId,
      aliases,
      kind,
      parentId,
      groupingPolicy,
      reason,
      actorUid: auth.uid,
    });
    const entryValidation = validateRegistryEntry(registryPlan.validationEntry, { requireResearchSources: false });
    if (!entryValidation.valid) {
      fail('failed-precondition', 'Destination policy does not satisfy registry requirements.', entryValidation.errors[0]);
    }
    const entries = registryEntries
      .filter((document) => document.id !== registryId);
    const collectionIssues = registryCollectionIssues([...entries, registryPlan.validationEntry]);
    if (collectionIssues.length) {
      fail('failed-precondition', 'Destination policy conflicts with the canonical registry.', collectionIssues[0].code);
    }
    syncedCity = { ...currentCity, canonicalPolicy: policy, destinationType };
    transaction.update(bundle.cityRef, {
      canonicalPolicy: policy,
      destinationType,
      publicationFence: {
        ...currentFence,
        state: 'complete',
        completedAt: timestamp,
        held: held.counts,
      },
      updatedAt: timestamp,
    });
    transaction.set(registryRef, { ...registryPlan.writeData, updatedAt: timestamp }, { merge: true });
    transaction.set(reviewRef(db, countryId, cityId), {
      status: 'ready',
      approvedAt: admin.firestore.FieldValue.delete(),
      approvedBy: admin.firestore.FieldValue.delete(),
      policyValidatedAt: timestamp,
      policyValidatedBy: auth.uid,
      updatedAt: timestamp,
    }, { merge: true });
  });
  clearRegistryCache();
  await syncDestinationCatalog({ admin, countryId, cityId, city: syncedCity });
  await audit({
    admin,
    auth,
    action: 'destination_policy_updated',
    target: { countryId, cityId },
    reason,
    metadata: {
      policy,
      held: held.counts,
      registryBinding: {
        registryId,
        previousRegistryId: registryBinding.previousRegistryId,
        adoptedExistingProvider: registryBinding.adoptedExistingProvider,
      },
    },
  });
  return { success: true, policy, held: held.counts };
}

function destinationCanEnterAdminApproval(destination) {
  const policy = destination?.canonicalPolicy || {};
  const reviewState = String(policy.reviewState || '').trim();
  const policyReady = reviewState === 'policy_validated';
  const alreadyApproved = policy.approved === true && reviewState === 'approved';
  const legacyNeedsAttestation = policy.approved === true && !reviewState &&
    !policy.registryAttestation && !policy.approvalRevision;
  return policyReady || alreadyApproved || legacyNeedsAttestation;
}

function destinationApprovalHasConflictingFence(destination) {
  const state = String(destination?.publicationFence?.state || '').trim();
  return ['draining', 'awaiting_admin_finalize', 'manual_review_required'].includes(state);
}

function publicationFenceReadyForRecovery(fence, nowMs = Date.now()) {
  const value = fence?.fencedAt;
  const fencedAtMs = typeof value?.toMillis === 'function'
    ? value.toMillis()
    : value instanceof Date
      ? value.getTime()
      : Date.parse(value || '') || 0;
  return !fencedAtMs || nowMs - fencedAtMs >= DESTINATION_PUBLICATION_FENCE_RECOVERY_MS;
}

function canonicalApprovalBindingIssues(destination, registryEntry) {
  const policy = destination?.canonicalPolicy || {};
  const destinationPlaceId = String(
    destination?.providerRefs?.googlePlaceId || destination?.googleCache?.placeId || ''
  ).trim();
  const registryPlaceId = String(registryEntry?.providerRefs?.googlePlaceId || '').trim();
  const normalizeParentId = (value) => String(value || '').trim();
  const issues = [];
  if (policy.registryId !== registryEntry?.id) issues.push('destination_registry_id_mismatch');
  if (policy.kind !== registryEntry?.kind) issues.push('destination_registry_kind_mismatch');
  if (policy.groupingPolicy !== registryEntry?.groupingPolicy) {
    issues.push('destination_registry_grouping_mismatch');
  }
  if (normalizeParentId(policy.parentId) !== normalizeParentId(registryEntry?.parentId)) {
    issues.push('destination_registry_parent_mismatch');
  }
  if (!destinationPlaceId || destinationPlaceId !== registryPlaceId) {
    issues.push('destination_registry_provider_mismatch');
  }
  return issues;
}

function buildApprovedCanonicalPolicy({
  currentPolicy,
  registryEntry,
  approvalRevision,
  countryId,
  actorUid,
  timestamp,
}) {
  const registryVersion = Number(registryEntry.registryVersion || REGISTRY_VERSION);
  return {
    ...currentPolicy,
    approved: true,
    registryId: registryEntry.id,
    kind: registryEntry.kind,
    parentId: registryEntry.parentId || null,
    groupingPolicy: registryEntry.groupingPolicy,
    aliases: Array.isArray(registryEntry.aliases) ? registryEntry.aliases : [],
    provisional: false,
    reviewState: 'approved',
    registryVersion,
    approvalRevision,
    registryAttestation: {
      approved: true,
      registryId: registryEntry.id,
      registryVersion,
      approvalRevision,
      countryId,
      countryCode: registryEntry.countryCode,
      issuedBy: actorUid,
      issuedAt: timestamp,
    },
    approvedBy: actorUid,
    approvedAt: timestamp,
  };
}

async function previewDestinationReassignment({ admin, auth, data }) {
  await prepareAdminAction(admin, auth, 'previewDestinationReassignment');
  return previewReassignment({
    db: admin.firestore(),
    source: { countryId: cleanId(data?.source?.countryId, 'source.countryId'), cityId: cleanId(data?.source?.cityId, 'source.cityId') },
    target: { countryId: cleanId(data?.target?.countryId, 'target.countryId'), cityId: cleanId(data?.target?.cityId, 'target.cityId') },
  });
}

async function startDestinationReassignment({ admin, auth, data }) {
  await prepareAdminAction(admin, auth, 'startDestinationReassignment');
  const reason = cleanReason(data?.reason);
  const result = await queueDestinationReassignment({
    admin,
    source: data?.source,
    target: data?.target,
    expectedImpactHash: String(data?.expectedImpactHash || ''),
    reason,
    requestedBy: auth.uid,
  });
  await audit({
    admin, auth, action: 'destination_reassignment_started', target: { source: data?.source, target: data?.target }, reason,
    metadata: { jobId: result.jobId, counts: result.preview.counts },
  });
  return result;
}

async function getDestinationReassignmentJob({ admin, auth, data }) {
  await prepareAdminAction(admin, auth, 'getDestinationReassignmentJob');
  const id = cleanId(data?.jobId, 'jobId');
  const snapshot = await destinationReassignmentJobRef(admin.firestore(), id).get();
  if (!snapshot.exists) fail('not-found', 'Destination reassignment job was not found.', 'reassignment_job_missing');
  return serialize({ jobId: snapshot.id, ...snapshot.data() });
}

async function recheckDestination({ admin, auth, data, unsplashKey, mediaBucket }) {
  await prepareAdminAction(admin, auth, 'recheckDestination');
  const countryId = cleanId(data?.countryId, 'countryId');
  const cityId = cleanId(data?.cityId, 'cityId');
  const before = await destinationBundle(admin, countryId, cityId);
  await resolveAndPersistDestinationIdentity({ admin, countryId, cityId });
  await resolveAndPersistDestinationImage({ admin, countryId, cityId, unsplashKey, force: true });
  const after = await admin.firestore().doc(`countries/${countryId}/destinations/${cityId}`).get();
  if (before.city.destinationImage?.source?.type === 'admin_upload' &&
      after.data()?.destinationImage?.source?.assetId !== before.city.destinationImage.source.assetId) {
    await getMediaBucket(admin, mediaBucket).deleteFiles({
      prefix: `destinations/${countryId}/${cityId}/${before.city.destinationImage.source.assetId}/`, force: true,
    });
  }
  const result = await evaluateAndPersistDestination({ admin, countryId, cityId });
  await audit({ admin, auth, action: 'destination_rechecked', target: { countryId, cityId }, reason: 'בדיקת איכות ידנית' });
  return result;
}

function approvalReleaseOperationId(countryId, cityId, registryId, registryVersion, approvalRevision) {
  return crypto.createHash('sha256')
    .update(`destination-approval\n${countryId}\n${cityId}\n${registryId}\n${registryVersion}\n${approvalRevision}`)
    .digest('base64url');
}

function storedDestinationReference(countryId, cityId) {
  const country = typeof countryId === 'string' ? countryId.trim() : '';
  const city = typeof cityId === 'string' ? cityId.trim() : '';
  const invalid = (value) => !value || value.length > 180 || value.includes('/') ||
    value === '.' || value === '..' || /[\u0000-\u001f\u007f-\u009f]/u.test(value);
  return invalid(country) || invalid(city) ? null : { countryId: country, cityId: city };
}

function contentDestinationReferences(content, type) {
  if (type === 'route') {
    if (!Array.isArray(content?.destinations)) return [];
    return content.destinations
      .map((destination) => storedDestinationReference(destination?.countryId, destination?.cityId))
      .filter(Boolean);
  }
  const reference = storedDestinationReference(content?.destination?.countryId, content?.destination?.cityId);
  return reference ? [reference] : [];
}

function heldForPendingDestination(content, countryId, cityId) {
  if (content?.status !== 'moderation_hold' ||
      content?.moderation?.systemGate !== 'destination_pending_approval' ||
      content?.moderation?.holdReason !== 'destination_pending_approval') return false;
  const heldDestination = content.moderation.destination;
  if (heldDestination?.countryId === countryId && heldDestination?.cityId === cityId) return true;
  return Array.isArray(content.moderation.pendingDestinationKeys) &&
    content.moderation.pendingDestinationKeys.includes(destinationKey(countryId, cityId));
}

async function releaseDestinationPendingContent({ admin, countryId, cityId }) {
  const db = admin.firestore();
  const [countrySnapshot, destinationSnapshot] = await Promise.all([
    db.doc(`countries/${countryId}`).get(),
    db.doc(`countries/${countryId}/destinations/${cityId}`).get(),
  ]);
  const destination = destinationSnapshot.data() || {};
  if (!destinationSnapshot.exists || !countrySnapshot.exists ||
      countrySnapshot.data()?.status !== 'active' ||
      !destinationAcceptsNewReferences(destination, countryId)) {
    fail('failed-precondition', 'Destination is not approved for public references.', 'destination_not_public');
  }
  const policy = destination.canonicalPolicy;
  const operationId = approvalReleaseOperationId(
    countryId,
    cityId,
    policy.registryId,
    policy.registryVersion,
    policy.approvalRevision
  );
  const operationRef = db.doc(`system/moderation/operations/${operationId}`);
  const existingOperation = await operationRef.get();
  if (existingOperation.exists && existingOperation.data()?.step === 'case_finalized') {
    return { operationId, released: existingOperation.data()?.released || {}, replay: true };
  }
  const timestamp = admin.firestore.FieldValue.serverTimestamp();
  if (existingOperation.exists && existingOperation.data()?.step === 'effects_applied') {
    const released = existingOperation.data()?.released || {};
    await operationRef.set({ step: 'case_finalized', finalizedAt: timestamp, updatedAt: timestamp }, { merge: true });
    return { operationId, released, replay: true };
  }
  await operationRef.set(existingOperation.exists ? {
    retryCount: admin.firestore.FieldValue.increment(1),
    lastAttemptAt: timestamp,
    updatedAt: timestamp,
  } : {
    type: 'destination_approval_release',
    step: 'started',
    destination: { countryId, cityId },
    registryId: policy.registryId,
    registryVersion: policy.registryVersion,
    approvalRevision: policy.approvalRevision,
    retryCount: 0,
    startedAt: timestamp,
    updatedAt: timestamp,
  }, { merge: true });

  const [recommendations, trips, routes] = await Promise.all([
    db.collection('recommendations').where('destination.cityId', '==', cityId).get(),
    db.collection('trips').where('destination.cityId', '==', cityId).get(),
    db.collection('routes').where('destinationKeys', 'array-contains', destinationKey(countryId, cityId)).get(),
  ]);
  const candidates = [
    ...recommendations.docs.map((entry) => ({ type: 'recommendation', entry })),
    ...trips.docs.map((entry) => ({ type: 'trip', entry })),
    ...routes.docs.map((entry) => ({ type: 'route', entry })),
  ].filter(({ entry }) => heldForPendingDestination(entry.data() || {}, countryId, cityId));
  const released = { recommendations: 0, trips: 0, routes: 0 };

  for (let offset = 0; offset < candidates.length; offset += 10) {
    await Promise.all(candidates.slice(offset, offset + 10).map(async ({ type, entry }) => {
      const didRelease = await db.runTransaction(async (transaction) => {
        const currentSnapshot = await transaction.get(entry.ref);
        const current = currentSnapshot.data() || {};
        if (!currentSnapshot.exists || !heldForPendingDestination(current, countryId, cityId)) return false;
        const references = contentDestinationReferences(current, type);
        if (!references.length) return false;
        const countryIds = [...new Set(references.map((reference) => reference.countryId))];
        const [countrySnapshots, referenceSnapshots] = await Promise.all([
          Promise.all(countryIds.map((referenceCountryId) => (
            transaction.get(db.doc(`countries/${referenceCountryId}`))
          ))),
          Promise.all(references.map((reference) => (
            transaction.get(db.doc(`countries/${reference.countryId}/destinations/${reference.cityId}`))
          ))),
        ]);
        const countriesById = new Map(countrySnapshots.map((snapshot, index) => (
          [countryIds[index], snapshot.exists ? snapshot.data() || {} : null]
        )));
        if (referenceSnapshots.some((snapshot, index) => {
          const reference = references[index];
          return !snapshot.exists || countriesById.get(reference.countryId)?.status !== 'active' ||
            !destinationAcceptsNewReferences(snapshot.data() || {}, reference.countryId);
        })) return false;
        transaction.update(entry.ref, {
          status: 'active',
          publicationGate: { destinationApprovalVerified: true },
          moderation: admin.firestore.FieldValue.delete(),
          updatedAt: timestamp,
        });
        if (type === 'recommendation') {
          transaction.update(db.doc(`countries/${countryId}/destinations/${cityId}`), {
            'stats.recommendationCount': admin.firestore.FieldValue.increment(1),
            updatedAt: timestamp,
          });
        }
        return true;
      });
      if (didRelease) released[`${type}s`] += 1;
    }));
  }

  await operationRef.set({ step: 'effects_applied', released, effectsAppliedAt: timestamp, updatedAt: timestamp }, { merge: true });
  await operationRef.set({ step: 'case_finalized', released, finalizedAt: timestamp, updatedAt: timestamp }, { merge: true });
  return { operationId, released, replay: false };
}

async function reconcileDestinationApprovalReleases({ admin, limit = 50 }) {
  const boundedLimit = Math.max(1, Math.min(100, Number(limit) || 50));
  const db = admin.firestore();
  const snapshot = await db.collection('system/moderation/operations')
    .where('type', '==', 'destination_approval_release')
    .where('step', 'in', ['started', 'effects_applied'])
    .limit(boundedLimit)
    .get();
  const pending = snapshot.docs;
  const result = { scanned: snapshot.size, pending: pending.length, completed: 0, failed: 0 };
  for (const entry of pending) {
    const destination = entry.data()?.destination || {};
    try {
      const countryId = cleanId(destination.countryId, 'destination.countryId');
      const cityId = cleanId(destination.cityId, 'destination.cityId');
      await releaseDestinationPendingContent({ admin, countryId, cityId });
      result.completed += 1;
    } catch (error) {
      result.failed += 1;
      await entry.ref.set({
        lastError: String(error?.details?.reason || error?.code || 'release_failed').slice(0, 120),
        lastFailedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  }
  return result;
}

async function reconcileDestinationPublicationFences({ admin, limit = 50 }) {
  const boundedLimit = Math.max(1, Math.min(100, Number(limit) || 50));
  const db = admin.firestore();
  const snapshot = await db.collectionGroup('destinations')
    .where('publicationFence.state', '==', 'draining')
    .limit(boundedLimit)
    .get();
  const result = { scanned: snapshot.size, quarantined: 0, deferred: 0, superseded: 0, failed: 0 };
  for (const entry of snapshot.docs) {
    const countryId = entry.ref.parent.parent?.id || '';
    const cityId = entry.id;
    const fence = entry.data()?.publicationFence || {};
    if (!publicationFenceReadyForRecovery(fence)) {
      result.deferred += 1;
      continue;
    }
    try {
      const held = await holdLinkedDestinationContent({
        admin,
        countryId: cleanId(countryId, 'countryId'),
        cityId: cleanId(cityId, 'cityId'),
        reason: String(fence.reason || 'destination_publication_fence').slice(0, 240),
        actorUid: String(fence.actorUid || 'system').slice(0, 180),
        holdReason: fence.reason === 'destination_inactive'
          ? 'destination_inactive'
          : 'destination_policy_review',
      });
      const quarantined = await quarantineDestinationPublicationFenceForManualRecovery({
        admin,
        countryId,
        cityId,
        destinationRef: entry.ref,
        expectedFence: fence,
        held: held.counts,
      });
      if (quarantined) result.quarantined += 1;
      else result.superseded += 1;
    } catch (error) {
      result.failed += 1;
      await entry.ref.update({
        'publicationFence.lastError': String(error?.details?.reason || error?.code || 'fence_failed').slice(0, 120),
        'publicationFence.lastFailedAt': admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }).catch(() => {});
    }
  }
  return result;
}

async function approveDestination({ admin, auth, data }) {
  await prepareAdminAction(admin, auth, 'approveDestination');
  const countryId = cleanId(data?.countryId, 'countryId');
  const cityId = cleanId(data?.cityId, 'cityId');
  const reason = cleanReason(data?.reason);
  const bundle = await destinationBundle(admin, countryId, cityId);
  const policyReady = bundle.city?.canonicalPolicy?.reviewState === 'policy_validated';
  const issues = qualityIssues(bundle.city, bundle.job, bundle.review).filter((issue) => (
    issue.code !== 'new_destination' &&
    !(policyReady && issue.code === 'unapproved_canonical_destination')
  ));
  if (issues.some((issue) => issue.severity === 'error')) fail('failed-precondition', 'Destination has blocking quality issues.', 'destination_blocked');
  if (!destinationCanEnterAdminApproval(bundle.city)) {
    fail('failed-precondition', 'Destination policy must be validated before approval.', 'destination_policy_not_ready');
  }
  if (destinationApprovalHasConflictingFence(bundle.city)) {
    fail('aborted', 'Destination publication changes are still in progress.', 'destination_fence_changed');
  }

  const db = admin.firestore();
  const destinationReviewRef = reviewRef(db, countryId, cityId);
  const registryId = bundle.city.canonicalPolicy.registryId;
  const registryRef = db.doc(`${REGISTRY_PATH}/${registryId}`);
  const countryRef = db.doc(`countries/${countryId}`);
  const timestamp = admin.firestore.FieldValue.serverTimestamp();
  let approvedCity = null;
  await db.runTransaction(async (transaction) => {
    const [citySnapshot, countrySnapshot, registrySnapshot] = await Promise.all([
      transaction.get(bundle.cityRef),
      transaction.get(countryRef),
      transaction.get(registryRef),
    ]);
    const currentCity = citySnapshot.data() || {};
    const currentPolicy = currentCity.canonicalPolicy || {};
    if (!citySnapshot.exists || countrySnapshot.data()?.status !== 'active' ||
        currentCity.status !== 'active' || currentPolicy.registryId !== registryId ||
        !destinationCanEnterAdminApproval(currentCity) ||
        destinationApprovalHasConflictingFence(currentCity) || !registrySnapshot.exists) {
      fail('failed-precondition', 'Destination identity changed before approval.', 'destination_changed');
    }
    const currentCountry = countrySnapshot.data() || {};
    const prospectiveRegistry = {
      id: registrySnapshot.id,
      ...registrySnapshot.data(),
      status: 'active',
      approval: { approvedByAdmin: true, reason, approvedBy: auth.uid },
    };
    const registryValidation = validateRegistryEntry(prospectiveRegistry);
    if (!registryValidation.valid) {
      fail('failed-precondition', 'Destination policy does not satisfy registry requirements.', registryValidation.errors[0]);
    }
    if (registryValidation.entry.countryCode !== String(currentCountry.code || countryId).toUpperCase()) {
      fail('failed-precondition', 'Destination registry country does not match.', 'destination_country_mismatch');
    }
    if (registrySnapshot.data()?.destinationPath && registrySnapshot.data().destinationPath !== bundle.cityRef.path) {
      fail('failed-precondition', 'Destination registry is bound to another destination.', 'destination_registry_path_mismatch');
    }
    const bindingIssues = canonicalApprovalBindingIssues(currentCity, registryValidation.entry);
    if (bindingIssues.length) {
      fail('failed-precondition', 'Destination identity does not match the canonical registry.', bindingIssues[0]);
    }
    const approvalRevision = Math.max(1, Number(currentPolicy.approvalRevision || 1));
    const approvedPolicy = buildApprovedCanonicalPolicy({
      currentPolicy,
      registryEntry: registryValidation.entry,
      approvalRevision,
      countryId,
      actorUid: auth.uid,
      timestamp,
    });
    approvedCity = { ...currentCity, canonicalPolicy: approvedPolicy };
    transaction.update(bundle.cityRef, {
      canonicalPolicy: approvedPolicy,
      publicationFence: {
        state: 'approved',
        approvalRevision,
        approvedAt: timestamp,
        actorUid: auth.uid,
      },
      updatedAt: timestamp,
    });
    transaction.set(registryRef, {
      status: 'active',
      approval: { approvedByAdmin: true, reason, approvedBy: auth.uid },
      approvalRevision,
      destinationPath: bundle.cityRef.path,
      updatedAt: timestamp,
    }, { merge: true });
    transaction.set(destinationReviewRef, {
      status: issues.length ? 'approved_with_warnings' : 'approved',
      issues,
      issueCodes: issues.map((issue) => issue.code),
      approvedAt: timestamp,
      approvedBy: auth.uid,
      approvalReason: reason,
      updatedAt: timestamp,
    }, { merge: true });
  });
  clearRegistryCache();
  if (!destinationIsPublicAndReferenceable(approvedCity, countryId)) {
    fail('failed-precondition', 'Approved destination did not satisfy the public reference policy.', 'destination_policy_invalid');
  }
  await syncDestinationCatalog({ admin, countryId, cityId, city: approvedCity });
  const release = await releaseDestinationPendingContent({ admin, countryId, cityId });
  await audit({
    admin,
    auth,
    action: 'destination_approved',
    target: { countryId, cityId },
    reason,
    metadata: { warningCount: issues.length, releaseOperationId: release.operationId, released: release.released },
  });
  return { success: true, release };
}

async function getDestinationImageCandidates({ admin, auth, data, unsplashKey }) {
  await prepareAdminAction(admin, auth, 'getDestinationImageCandidates');
  const countryId = cleanId(data?.countryId, 'countryId');
  const cityId = cleanId(data?.cityId, 'cityId');
  const bundle = await destinationBundle(admin, countryId, cityId);
  const query = destinationQuery(bundle.city, bundle.country);
  const candidateResult = await resolveDestinationImageCandidate({
    db: admin.firestore(), city: bundle.city, country: bundle.country, countryId, cityId,
    unsplashKey, query, onRequest: () => consumeUnsplashBudget(admin.firestore()),
    excludedPhotoIds: bundle.city.destinationImage?.source?.providerPhotoId
      ? [bundle.city.destinationImage.source.providerPhotoId]
      : [],
  });
  const wikimedia = await resolveWikimediaDestinationImage({ city: bundle.city, country: bundle.country }).catch(() => null);
  const candidates = [candidateResult.image, wikimedia].filter(Boolean);
  const unique = [...new Map(candidates.map((image) => [JSON.stringify(image.source), image])).values()];
  const candidateRef = reviewRef(admin.firestore(), countryId, cityId).collection('imageCandidates');
  const batch = admin.firestore().batch();
  const items = unique.map((image) => {
    const id = crypto.randomBytes(12).toString('hex');
    batch.set(candidateRef.doc(id), {
      image,
      downloadLocation: image.source?.type === 'unsplash' ? candidateResult.downloadLocation || null : null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expireAt: admin.firestore.Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
    });
    return { id, image };
  });
  if (items.length) await batch.commit();
  return serialize({ items });
}

async function selectDestinationImageCandidate({ admin, auth, data, unsplashKey, mediaBucket }) {
  await prepareAdminAction(admin, auth, 'selectDestinationImageCandidate');
  const countryId = cleanId(data?.countryId, 'countryId');
  const cityId = cleanId(data?.cityId, 'cityId');
  const candidateId = cleanId(data?.candidateId, 'candidateId');
  const reason = cleanReason(data?.reason);
  const candidateRef = reviewRef(admin.firestore(), countryId, cityId).collection('imageCandidates').doc(candidateId);
  const snapshot = await candidateRef.get();
  const candidate = snapshot.data();
  if (!snapshot.exists || timestampMs(candidate.expireAt) <= Date.now()) fail('failed-precondition', 'Image candidate expired.', 'candidate_expired');
  if (candidate.image?.source?.type === 'unsplash') {
    await trackUnsplashDownload({
      downloadLocation: candidate.downloadLocation,
      accessKey: unsplashKey,
      onRequest: () => consumeUnsplashBudget(admin.firestore()),
    });
  }
  const cityRef = admin.firestore().doc(`countries/${countryId}/destinations/${cityId}`);
  const previous = await cityRef.get();
  await cityRef.update(destinationImageWritePatch(admin, candidate.image));
  const previousImage = previous.data()?.destinationImage;
  if (previousImage?.source?.type === 'admin_upload' && previousImage.source.assetId) {
    await getMediaBucket(admin, mediaBucket).deleteFiles({
      prefix: `destinations/${countryId}/${cityId}/${previousImage.source.assetId}/`, force: true,
    });
  }
  const allCandidates = await candidateRef.parent.get();
  if (!allCandidates.empty) {
    const cleanup = admin.firestore().batch();
    allCandidates.docs.forEach((document) => cleanup.delete(document.ref));
    await cleanup.commit();
  }
  await evaluateAndPersistDestination({ admin, countryId, cityId });
  await audit({ admin, auth, action: 'destination_image_selected', target: { countryId, cityId, source: candidate.image?.source?.type }, reason });
  return { success: true };
}

async function setDestinationUploadedImage({ admin, auth, data, mediaBucket }) {
  await prepareAdminAction(admin, auth, 'setDestinationUploadedImage');
  const countryId = cleanId(data?.countryId, 'countryId');
  const cityId = cleanId(data?.cityId, 'cityId');
  const reason = cleanReason(data?.reason);
  const asset = data?.asset || {};
  const assetId = cleanId(asset.assetId, 'assetId');
  const bundle = await destinationBundle(admin, countryId, cityId);
  const bucket = getMediaBucket(admin, mediaBucket);
  const destinationAssetId = crypto.randomUUID();
  const descriptors = {};
  const written = [];
  try {
    for (const variant of IMAGE_VARIANTS) {
      const sourcePath = String(asset?.[variant]?.path || '');
      if (sourcePath !== `media/${auth.uid}/${assetId}/${variant}.webp`) fail('permission-denied', 'Prepared image is invalid.', 'invalid_media');
      const source = bucket.file(sourcePath);
      const [metadata] = await source.getMetadata();
      if (metadata.metadata?.ownerUid !== auth.uid || metadata.metadata?.state !== 'prepared') fail('permission-denied', 'Prepared image is invalid.', 'invalid_media');
      const targetPath = `destinations/${countryId}/${cityId}/${destinationAssetId}/${variant}.webp`;
      const target = bucket.file(targetPath);
      const token = crypto.randomUUID();
      await source.copy(target);
      await target.setMetadata({
        cacheControl: 'public,max-age=31536000,immutable',
        metadata: { firebaseStorageDownloadTokens: token, kind: 'destination', countryId, cityId, assetId: destinationAssetId, variant, state: 'claimed' },
      });
      written.push(target);
      descriptors[variant] = {
        path: targetPath,
        url: buildDownloadUrl(bucket.name, targetPath, token),
        width: Number(asset?.[variant]?.width || metadata.metadata?.width || 0),
        height: Number(asset?.[variant]?.height || metadata.metadata?.height || 0),
      };
    }
    const image = {
      source: { type: 'admin_upload', assetId: destinationAssetId },
      urls: Object.fromEntries(IMAGE_VARIANTS.map((variant) => [variant, descriptors[variant].url])),
      width: descriptors.large.width,
      height: descriptors.large.height,
      color: asset.placeholder?.color || null,
      alt: String(data?.alt || destinationHebrewName(bundle.city) || '').trim().slice(0, 180) || null,
      selection: { strategy: 'admin_upload', validation: { version: IMAGE_VALIDATION_VERSION, status: 'admin_verified', method: 'manual_review' } },
      storage: descriptors,
    };
    await bundle.cityRef.update(destinationImageWritePatch(admin, image));
    await Promise.all(IMAGE_VARIANTS.map((variant) => bucket.file(`media/${auth.uid}/${assetId}/${variant}.webp`).delete({ ignoreNotFound: true })));
    if (bundle.city.destinationImage?.source?.type === 'admin_upload' && bundle.city.destinationImage?.source?.assetId) {
      await bucket.deleteFiles({ prefix: `destinations/${countryId}/${cityId}/${bundle.city.destinationImage.source.assetId}/`, force: true });
    }
    await evaluateAndPersistDestination({ admin, countryId, cityId });
    await audit({ admin, auth, action: 'destination_image_uploaded', target: { countryId, cityId }, reason });
    return { success: true, image: serialize(image) };
  } catch (error) {
    await Promise.allSettled(written.map((file) => file.delete({ ignoreNotFound: true })));
    throw error;
  }
}

async function getAirportCandidates({ admin, auth, data }) {
  await prepareAdminAction(admin, auth, 'getAirportCandidates');
  const countryId = cleanId(data?.countryId, 'countryId');
  const cityId = cleanId(data?.cityId, 'cityId');
  const bundle = await destinationBundle(admin, countryId, cityId);
  const coordinates = destinationCoordinates(bundle.city);
  if (!coordinates) fail('failed-precondition', 'Destination has no coordinates.', 'missing_coordinates');
  const downloaded = await downloadAirports({});
  return {
    sourceUpdatedAt: downloaded.sourceUpdatedAt,
    items: nearestScheduledAirports(coordinates, downloaded.airports, { limit: 10 }),
  };
}

async function setDestinationAirport({ admin, auth, data }) {
  await prepareAdminAction(admin, auth, 'setDestinationAirport');
  const countryId = cleanId(data?.countryId, 'countryId');
  const cityId = cleanId(data?.cityId, 'cityId');
  const iataCode = cleanId(data?.iataCode, 'iataCode').toUpperCase();
  const reason = cleanReason(data?.reason);
  const bundle = await destinationBundle(admin, countryId, cityId);
  const coordinates = destinationCoordinates(bundle.city);
  if (!coordinates) fail('failed-precondition', 'Destination has no coordinates.', 'missing_coordinates');
  const downloaded = await downloadAirports({});
  const candidate = selectAirportByIataCode(coordinates, downloaded.airports, iataCode, { limit: 20, enforceMaxDistance: false });
  if (!candidate) fail('invalid-argument', 'Airport is not an eligible nearby candidate.', 'invalid_airport');
  await bundle.cityRef.update({
    'travelFacts.closestAirport': {
      name: candidate.name,
      iataCode: candidate.iataCode,
      distanceKm: candidate.distanceKm,
      source: 'OurAirports',
      sourceUpdatedAt: downloaded.sourceUpdatedAt,
      selectedByAdmin: true,
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await evaluateAndPersistDestination({ admin, countryId, cityId });
  await audit({ admin, auth, action: 'destination_airport_selected', target: { countryId, cityId, iataCode }, reason });
  return { success: true };
}

function destinationContentType(document) {
  const collection = document?.ref?.parent?.id;
  if (collection === 'recommendations') return 'recommendation';
  if (collection === 'routes') return 'route';
  if (collection === 'trips') return 'trip';
  return null;
}

async function holdDestinationContentDocuments({
  admin,
  documents,
  patch,
  fenceRef = null,
  expectedFence = null,
}) {
  const db = admin.firestore();
  let changed = 0;
  for (let offset = 0; offset < documents.length; offset += 10) {
    const results = await Promise.all(documents.slice(offset, offset + 10).map(async (entry) => {
      return db.runTransaction(async (transaction) => {
        const [currentSnapshot, fenceSnapshot] = await Promise.all([
          transaction.get(entry.ref),
          fenceRef ? transaction.get(fenceRef) : Promise.resolve(null),
        ]);
        if (!currentSnapshot.exists || currentSnapshot.data()?.status !== 'active') return false;
        if (fenceRef) {
          const fence = fenceSnapshot?.data?.()?.publicationFence || {};
          if (!fenceSnapshot?.exists || fence.state !== 'draining' ||
              fence.reason !== expectedFence?.reason ||
              fence.operationId !== expectedFence?.operationId ||
              Number(fence.approvalRevision || 0) !== Number(expectedFence?.approvalRevision || 0)) {
            return false;
          }
        }

        const content = currentSnapshot.data() || {};
        const type = destinationContentType(entry);
        const ownerId = typeof content.ownerId === 'string' ? content.ownerId.trim() : '';
        const target = type ? { type, id: entry.id } : null;
        const notificationRef = ownerId && target
          ? db.doc(`users/${ownerId}/notifications/${systemNotificationId('content_held', entry.ref.path)}`)
          : null;
        const [existingNotification, ownerSnapshot] = notificationRef
          ? await Promise.all([
            transaction.get(notificationRef),
            transaction.get(db.doc(`users/${ownerId}`)),
          ])
          : [null, null];

        transaction.update(entry.ref, patch);
        if (notificationRef && notificationRecipientEligible(ownerSnapshot)) {
          stageNotificationActivity({
            transaction,
            admin,
            db,
            uid: ownerId,
            notificationRef,
            existingSnapshot: existingNotification,
            notification: {
              channel: 'personal',
              type: 'system',
              subtype: 'content_held',
              priority: 'normal',
              count: 1,
              target: buildNotificationTarget({ target, data: content }),
              navigation: navigationForTarget(target),
            },
          });
        }
        return true;
      });
    }));
    changed += results.filter(Boolean).length;
  }
  return changed;
}

async function activeLinkedDestinationContentInTransaction({
  transaction,
  db,
  countryId,
  cityId,
}) {
  const [recommendations, trips, routes] = await Promise.all([
    transaction.get(db.collection('recommendations').where('destination.cityId', '==', cityId)),
    transaction.get(db.collection('trips').where('destination.cityId', '==', cityId)),
    transaction.get(db.collection('routes').where(
      'destinationKeys', 'array-contains', destinationKey(countryId, cityId)
    )),
  ]);
  return [
    ...recommendations.docs.filter((entry) => (
      entry.data()?.destination?.countryId === countryId && entry.data()?.status === 'active'
    )),
    ...trips.docs.filter((entry) => (
      entry.data()?.destination?.countryId === countryId && entry.data()?.status === 'active'
    )),
    ...routes.docs.filter((entry) => entry.data()?.status === 'active'),
  ];
}

async function holdLinkedDestinationContent({
  admin,
  countryId,
  cityId,
  reason,
  actorUid,
  holdReason,
}) {
  const db = admin.firestore();
  const fenceRef = db.doc(`countries/${countryId}/destinations/${cityId}`);
  const fenceSnapshot = await fenceRef.get();
  const expectedFence = fenceSnapshot.data()?.publicationFence || {};
  if (!fenceSnapshot.exists || expectedFence.state !== 'draining' ||
      expectedFence.reason !== holdReason) {
    fail('aborted', 'Destination publication fence changed.', 'destination_fence_changed');
  }
  const [recommendations, trips, routes] = await Promise.all([
    db.collection('recommendations').where('destination.cityId', '==', cityId).get(),
    db.collection('trips').where('destination.cityId', '==', cityId).get(),
    db.collection('routes').where('destinationKeys', 'array-contains', destinationKey(countryId, cityId)).get(),
  ]);
  const matchingRecommendations = recommendations.docs.filter((entry) => (
    entry.data()?.destination?.countryId === countryId && entry.data()?.status === 'active'
  ));
  const matchingTrips = trips.docs.filter((entry) => (
    entry.data()?.destination?.countryId === countryId && entry.data()?.status === 'active'
  ));
  const activeRoutes = routes.docs.filter((entry) => entry.data()?.status === 'active');
  const patch = {
    status: 'moderation_hold',
    publicationGate: { destinationApprovalVerified: false },
    moderation: {
      holdReason,
      systemGate: 'destination_pending_approval',
      destination: { countryId, cityId },
      pendingDestinationKeys: [destinationKey(countryId, cityId)],
      reason,
      actorUid,
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  const changed = await holdDestinationContentDocuments({
    admin,
    documents: [...matchingRecommendations, ...matchingTrips, ...activeRoutes],
    patch,
    fenceRef,
    expectedFence,
  });
  const counts = {
    recommendations: matchingRecommendations.length,
    trips: matchingTrips.length,
    routes: activeRoutes.length,
  };
  return { counts, activeRoutes, changed };
}

async function quarantineDestinationPublicationFenceForManualRecovery({
  admin,
  countryId,
  cityId,
  destinationRef,
  expectedFence,
  held,
}) {
  const segments = String(destinationRef?.path || '').split('/');
  const referenceMatches = segments.length === 4 && segments[0] === 'countries' &&
    segments[2] === 'destinations' && segments[1] === countryId && segments[3] === cityId;
  if (!referenceMatches) {
    fail('failed-precondition', 'Destination recovery target does not match.', 'destination_reference_mismatch');
  }
  const db = admin.firestore();
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(destinationRef);
    const destination = snapshot.data() || {};
    const currentFence = snapshot.data()?.publicationFence || {};
    if (!snapshot.exists || currentFence.state !== 'draining' ||
        currentFence.reason !== expectedFence.reason ||
        currentFence.operationId !== expectedFence.operationId ||
        Number(currentFence.approvalRevision || 0) !== Number(expectedFence.approvalRevision || 0)) {
      return false;
    }
    transaction.update(destinationRef, {
      canonicalPolicy: {
        ...(destination.canonicalPolicy || {}),
        approved: false,
        provisional: true,
        reviewState: 'publication_recovery_required',
      },
      publicationFence: {
        ...currentFence,
        state: 'manual_review_required',
        drainCompletedAt: admin.firestore.FieldValue.serverTimestamp(),
        held,
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    transaction.delete(db.doc(`destinationCatalog/${catalogId(countryId, cityId)}`));
    return true;
  });
}

async function deactivateDestination({ admin, auth, data }) {
  await prepareAdminAction(admin, auth, 'deactivateDestination');
  const countryId = cleanId(data?.countryId, 'countryId');
  const cityId = cleanId(data?.cityId, 'cityId');
  const reason = cleanReason(data?.reason);
  const db = admin.firestore();
  const bundle = await destinationBundle(admin, countryId, cityId);
  const registryId = bundle.city?.canonicalPolicy?.registryId;
  const registryRef = registryId ? db.doc(`${REGISTRY_PATH}/${registryId}`) : null;
  const timestamp = admin.firestore.FieldValue.serverTimestamp();
  const drainOperationId = crypto.randomUUID();
  let inactiveCity = null;
  await db.runTransaction(async (transaction) => {
    const citySnapshot = await transaction.get(bundle.cityRef);
    if (!citySnapshot.exists) fail('not-found', 'Destination was not found.', 'destination_missing');
    const currentCity = citySnapshot.data() || {};
    if (currentCity.status !== 'active') {
      fail('failed-precondition', 'Destination is no longer active.', 'destination_changed');
    }
    transaction.update(bundle.cityRef, {
      publicationFence: {
        state: 'draining',
        reason: 'destination_inactive',
        operationId: drainOperationId,
        detail: reason,
        actorUid: auth.uid,
        fencedAt: timestamp,
      },
      updatedAt: timestamp,
    });
  });
  const held = await holdLinkedDestinationContent({
    admin,
    countryId,
    cityId,
    reason,
    actorUid: auth.uid,
    holdReason: 'destination_inactive',
  });
  await db.runTransaction(async (transaction) => {
    const [citySnapshot, registrySnapshot, activeLinkedContent] = await Promise.all([
      transaction.get(bundle.cityRef),
      registryRef ? transaction.get(registryRef) : Promise.resolve(null),
      activeLinkedDestinationContentInTransaction({ transaction, db, countryId, cityId }),
    ]);
    if (!citySnapshot.exists) fail('not-found', 'Destination was not found.', 'destination_missing');
    const currentCity = citySnapshot.data() || {};
    const currentFence = currentCity.publicationFence || {};
    if (currentCity.status !== 'active' || currentFence.state !== 'draining' ||
        currentFence.reason !== 'destination_inactive' ||
        currentFence.operationId !== drainOperationId) {
      fail('aborted', 'Destination changed while linked content was being held.', 'destination_fence_changed');
    }
    if (activeLinkedContent.length) {
      fail('aborted', 'Linked public content changed while the destination was being held.', 'destination_drain_incomplete');
    }
    inactiveCity = {
      ...currentCity,
      status: 'inactive',
      canonicalPolicy: {
        ...(currentCity.canonicalPolicy || {}),
        approved: false,
        provisional: true,
        reviewState: 'inactive',
      },
    };
    transaction.update(bundle.cityRef, {
      status: 'inactive',
      canonicalPolicy: inactiveCity.canonicalPolicy,
      publicationFence: {
        ...currentFence,
        state: 'complete',
        completedAt: timestamp,
        held: held.counts,
      },
      updatedAt: timestamp,
    });
    if (registrySnapshot?.exists) {
      transaction.set(registryRef, {
        status: 'inactive',
        approval: { approvedByAdmin: false, reason, deactivatedBy: auth.uid },
        updatedAt: timestamp,
      }, { merge: true });
    }
    transaction.set(reviewRef(db, countryId, cityId), {
      status: 'inactive',
      deactivatedAt: timestamp,
      deactivatedBy: auth.uid,
      updatedAt: timestamp,
    }, { merge: true });
  });
  clearRegistryCache();
  const activeRoutes = held.activeRoutes;
  for (let offset = 0; offset < activeRoutes.length; offset += 400) {
    const batch = db.batch();
    activeRoutes.slice(offset, offset + 400).forEach((route) => {
      const routeReviewId = crypto.createHash('sha256').update(`${route.id}\n${countryId}\n${cityId}`).digest('base64url');
      batch.set(db.doc(`system/moderation/destinationRouteReviews/${routeReviewId}`), {
      routeId: route.id, countryId, cityId, status: 'open', reason, createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    });
    await batch.commit();
  }
  await syncDestinationCatalog({ admin, countryId, cityId, city: inactiveCity });
  await audit({
    admin,
    auth,
    action: 'destination_deactivated',
    target: { countryId, cityId },
    reason,
    metadata: held.counts,
  });
  return { success: true, held: held.counts };
}

module.exports = {
  approvalReleaseOperationId,
  approveDestination,
  buildApprovedCanonicalPolicy,
  buildDestinationPolicyRegistryPlan,
  canonicalApprovalBindingIssues,
  deactivateDestination,
  destinationCoordinates,
  destinationPolicyRegistryBindingIssue,
  destinationApprovalHasConflictingFence,
  destinationCanEnterAdminApproval,
  evaluateAndPersistDestination,
  selectAirportByIataCode,
  selectDestinationPolicyRegistryBinding,
  getAirportCandidates,
  getDestinationImageCandidates,
  getDestinationRenameJob,
  getDestinationReassignmentJob,
  getDestinationReview,
  holdDestinationContentDocuments,
  listDestinationReviews,
  notifyAdminsOfDestination,
  onDestinationCreated,
  publicationFenceReadyForRecovery,
  qualityIssues,
  quarantineDestinationPublicationFenceForManualRecovery,
  reconcileDestinationApprovalReleases,
  reconcileDestinationPublicationFences,
  releaseDestinationPendingContent,
  recheckDestination,
  scanDestinationQuality,
  selectDestinationImageCandidate,
  syncDestinationAirport,
  setDestinationAirport,
  setDestinationHebrewName,
  startDestinationReassignment,
  previewDestinationReassignment,
  updateDestinationPolicy,
  setDestinationUploadedImage,
};
