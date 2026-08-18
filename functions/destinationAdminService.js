const crypto = require('crypto');
const { FieldPath } = require('firebase-admin/firestore');
const { HttpsError } = require('firebase-functions/v2/https');

const { audit, prepareAdminAction } = require('./adminService');
const {
  closestScheduledAirport,
  downloadAirports,
  nearestScheduledAirports,
} = require('./airportFacts');
const { syncDestinationCatalog } = require('./destinationCatalogService');
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

const PAGE_SIZE = 30;
const IMAGE_VARIANTS = ['large', 'feed', 'thumb'];
const IMAGE_VALIDATION_VERSION = 1;

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

  if (!names.he) add('missing_hebrew_name', 'error', 'חסר שם בעברית');
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
  const payload = {
    countryId,
    cityId,
    names: bundle.city.googleCache?.names || bundle.city.identity?.names || { he: bundle.city.name || cityId },
    countryNames: bundle.country.names || { he: bundle.country.name || countryId },
    destinationStatus: bundle.city.status || 'active',
    status,
    issues,
    issueCodes: issues.map((issue) => issue.code),
    image: bundle.city.destinationImage || null,
    closestAirport: bundle.city.travelFacts?.closestAirport || null,
    recommendationCount: Math.max(0, Number(bundle.city.stats?.recommendationCount || 0)),
    job: bundle.job,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    ...(created ? { discoveredAt: admin.firestore.FieldValue.serverTimestamp() } : {}),
  };
  await reviewRef(admin.firestore(), countryId, cityId).set(payload, { merge: true });
  return serialize({ id: reviewId(countryId, cityId), ...payload });
}

async function notifyAdminsOfDestination({ admin, countryId, cityId }) {
  const admins = await admin.firestore().collection('system/moderation/admins').where('active', '==', true).limit(50).get();
  if (admins.empty) return;
  const batch = admin.firestore().batch();
  admins.docs.forEach((entry) => {
    const ref = admin.firestore().doc(`users/${entry.id}/notifications/destination_${reviewId(countryId, cityId)}`);
    batch.set(ref, {
      type: 'moderation',
      priority: 'normal',
      target: { type: 'destination', countryId, cityId },
      message: 'נוספה עיר חדשה שממתינה לבקרת איכות.',
      isRead: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  await batch.commit();
}

async function onDestinationCreated({ admin, countryId, cityId }) {
  await syncDestinationAirport({
    admin,
    countryId,
    cityId,
    applyWhenMissingOnly: true,
  });
  const result = await evaluateAndPersistDestination({ admin, countryId, cityId, created: true });
  await notifyAdminsOfDestination({ admin, countryId, cityId });
  return result;
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

async function approveDestination({ admin, auth, data }) {
  await prepareAdminAction(admin, auth, 'approveDestination');
  const countryId = cleanId(data?.countryId, 'countryId');
  const cityId = cleanId(data?.cityId, 'cityId');
  const reason = cleanReason(data?.reason);
  const bundle = await destinationBundle(admin, countryId, cityId);
  const issues = qualityIssues(bundle.city, bundle.job, bundle.review).filter((issue) => issue.code !== 'new_destination');
  if (issues.some((issue) => issue.severity === 'error')) fail('failed-precondition', 'Destination has blocking quality issues.', 'destination_blocked');
  await reviewRef(admin.firestore(), countryId, cityId).set({
    status: issues.length ? 'approved_with_warnings' : 'approved',
    issues,
    issueCodes: issues.map((issue) => issue.code),
    approvedAt: admin.firestore.FieldValue.serverTimestamp(),
    approvedBy: auth.uid,
    approvalReason: reason,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  await audit({ admin, auth, action: 'destination_approved', target: { countryId, cityId }, reason, metadata: { warningCount: issues.length } });
  return { success: true };
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
      alt: String(data?.alt || bundle.city.googleCache?.names?.he || bundle.city.name || '').trim().slice(0, 180) || null,
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

async function updateDocumentsInBatches(admin, documents, patch) {
  for (let offset = 0; offset < documents.length; offset += 400) {
    const batch = admin.firestore().batch();
    documents.slice(offset, offset + 400).forEach((document) => batch.update(document.ref, patch));
    await batch.commit();
  }
}

async function deactivateDestination({ admin, auth, data }) {
  await prepareAdminAction(admin, auth, 'deactivateDestination');
  const countryId = cleanId(data?.countryId, 'countryId');
  const cityId = cleanId(data?.cityId, 'cityId');
  const reason = cleanReason(data?.reason);
  const db = admin.firestore();
  const bundle = await destinationBundle(admin, countryId, cityId);
  const [recommendations, trips, routes] = await Promise.all([
    db.collection('recommendations').where('destination.cityId', '==', cityId).get(),
    db.collection('trips').where('destination.cityId', '==', cityId).get(),
    db.collection('routes').where('destinationKeys', 'array-contains', destinationKey(countryId, cityId)).get(),
  ]);
  const matchingRecommendations = recommendations.docs.filter((entry) => entry.data()?.destination?.countryId === countryId && entry.data()?.status === 'active');
  const matchingTrips = trips.docs.filter((entry) => entry.data()?.destination?.countryId === countryId && entry.data()?.status === 'active');
  const activeRoutes = routes.docs.filter((entry) => entry.data()?.status === 'active');
  const patch = {
    status: 'moderation_hold',
    moderation: { holdReason: 'destination_inactive', destination: { countryId, cityId }, reason, actorUid: auth.uid },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await updateDocumentsInBatches(admin, [...matchingRecommendations, ...matchingTrips, ...activeRoutes], patch);
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
  await bundle.cityRef.update({ status: 'inactive', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  await syncDestinationCatalog({ admin, countryId, cityId, city: { ...bundle.city, status: 'inactive' } });
  await reviewRef(db, countryId, cityId).set({ status: 'inactive', deactivatedAt: admin.firestore.FieldValue.serverTimestamp(), deactivatedBy: auth.uid, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  await audit({ admin, auth, action: 'destination_deactivated', target: { countryId, cityId }, reason, metadata: { recommendations: matchingRecommendations.length, trips: matchingTrips.length, routes: activeRoutes.length } });
  return { success: true, held: { recommendations: matchingRecommendations.length, trips: matchingTrips.length, routes: activeRoutes.length } };
}

module.exports = {
  approveDestination,
  deactivateDestination,
  destinationCoordinates,
  evaluateAndPersistDestination,
  selectAirportByIataCode,
  getAirportCandidates,
  getDestinationImageCandidates,
  getDestinationReview,
  listDestinationReviews,
  notifyAdminsOfDestination,
  onDestinationCreated,
  qualityIssues,
  recheckDestination,
  scanDestinationQuality,
  selectDestinationImageCandidate,
  syncDestinationAirport,
  setDestinationAirport,
  setDestinationUploadedImage,
};
