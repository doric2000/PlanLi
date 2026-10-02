const crypto = require('node:crypto');

const { audit, cleanId, prepareAdminAction } = require('./adminService');
const { distanceKm } = require('./destinationIdentityService');
const { destinationHebrewName } = require('./destinationLocalizationService');
const { normalizeMapCoordinates } = require('./mapLocation');
const { prepareStagedMedia } = require('./mediaProcessor');
const { publicationOutcome } = require('./contentPublication');
const {
  resolveExactPlaceWithDestination,
  sanitizeRecommendationCatalogContent,
  sanitizeRecommendationDetails,
  saveRecommendation,
} = require('./recommendationService');
const { POST_BUDGET_IDS, NEED_IDS, PRACTICAL_FACT_IDS } = require('./travelTaxonomy');
const apifyProvider = require('./apifyFacebookGroupsProvider');
const { downloadSourceImage } = require('./ingestionImageDownloader');
const {
  EXTRACTION_MODEL,
  extractRecommendationCandidates,
  extractionCacheKey,
  validateExtraction,
} = require('./recommendationExtractionService');
const {
  DEFAULT_COLLECTION_CAP_POSTS,
  DEFAULT_COLLECTION_CAP_USD,
  DEFAULT_VIEW_OPTION,
  DESCRIPTION_MAX,
  FRESHNESS_DAYS,
  INGESTION_ROOT,
  LOCKED_REVIEW_STATES,
  MAX_CANDIDATE_PHOTOS,
  MAX_POST_IMAGES,
  NEXT_STAGE,
  RESOLVED_LOCATION_STATES,
  REVIEW_STATES,
  STAGE_CHECKLIST,
  TERMINAL_REVIEW_STATES,
  TITLE_MAX,
  VIEW_OPTIONS,
  assert,
  buildPublishData,
  catalogCategory,
  collectionBudgetCheck,
  computeReadiness,
  deterministicPublishRequestId,
  evaluateSource,
  fail,
  groupKeyFor,
  normalizeApifyItem,
  normalizeName,
  parseFacebookGroupUrl,
  reviewStateFor,
  shortHash,
  spanIsInSource,
  stageConfig,
} = require('./recommendationIngestionPolicy');

const PAGE_SIZE = 20;
const MAX_BULK_CANDIDATES = 25;
const LEASE_MS = 9 * 60 * 1000;
const MAX_PROCESSING_ATTEMPTS = 3;
const PUBLISH_CLAIM_MS = 10 * 60 * 1000;
const PLACE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PLACE_MATCH_RADIUS_KM = 60;
// Dedicated ingestion quotas, independent of every user's personal quota.
const DAILY_PLACES_UNITS = 600;
const DAILY_MEDIA_IMAGES = 300;
const DAILY_MEDIA_BYTES = 1500 * 1024 * 1024;
const PUBLIC_RECOMMENDATION_URL = 'https://planli.cc/recommendation/';

const paths = Object.freeze({
  config: `${INGESTION_ROOT}/config/main`,
  ledger: `${INGESTION_ROOT}/state/collectionBudget`,
  placesBudget: `${INGESTION_ROOT}/state/placesBudget`,
  mediaBudget: `${INGESTION_ROOT}/state/mediaBudget`,
  groups: `${INGESTION_ROOT}/groups`,
  runs: `${INGESTION_ROOT}/runs`,
  sources: `${INGESTION_ROOT}/sources`,
  candidates: `${INGESTION_ROOT}/candidates`,
  tasks: `${INGESTION_ROOT}/tasks`,
  placeCache: `${INGESTION_ROOT}/placeCache`,
  metrics: `${INGESTION_ROOT}/metrics`,
});

function fieldValue(admin) {
  return admin.firestore.FieldValue;
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function toMillis(value) {
  return toDate(value)?.getTime() || null;
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function dayKey(now) {
  return now.toISOString().slice(0, 10);
}

function cleanText(value, field, { max, min = 0 } = {}) {
  if (value == null) value = '';
  assert(typeof value === 'string', 'invalid-argument', 'ingestion_input_invalid', `${field} is invalid.`);
  const result = value.trim();
  assert(result.length >= min && result.length <= max, 'invalid-argument', 'ingestion_input_invalid', `${field} is invalid.`);
  return result;
}

function cleanDocumentId(value, field) {
  const result = cleanId(value, field, 120);
  assert(/^[A-Za-z0-9_-]+$/.test(result), 'invalid-argument', 'ingestion_input_invalid', `${field} is invalid.`);
  return result;
}

function cleanRevision(value) {
  const revision = Number(value);
  assert(Number.isSafeInteger(revision) && revision >= 1, 'invalid-argument', 'ingestion_input_invalid',
    'expectedRevision is invalid.');
  return revision;
}

async function readConfig(db) {
  const snapshot = await db.doc(paths.config).get();
  const data = snapshot.exists ? snapshot.data() || {} : {};
  const stage = ['trial', 'pilot', 'scale'].includes(data.rolloutStage) ? data.rolloutStage : 'trial';
  return {
    enabled: data.enabled === true,
    publisherUid: typeof data.publisherUid === 'string' ? data.publisherUid : '',
    rolloutStage: stage,
    perRunChargeCapUsd: Math.max(0.05, Math.min(5, Number(data.perRunChargeCapUsd) || 0.25)),
    capUsd: Number(data.capUsd) > 0 ? Number(data.capUsd) : DEFAULT_COLLECTION_CAP_USD,
    capPosts: Number(data.capPosts) > 0 ? Math.floor(Number(data.capPosts)) : DEFAULT_COLLECTION_CAP_POSTS,
    maxImagesPerPost: Math.max(1, Math.min(MAX_POST_IMAGES, Number(data.maxImagesPerPost) || MAX_POST_IMAGES)),
    extractionModel: typeof data.extractionModel === 'string' && data.extractionModel ? data.extractionModel : EXTRACTION_MODEL,
    viewOption: VIEW_OPTIONS.includes(data.viewOption) ? data.viewOption : DEFAULT_VIEW_OPTION,
    stageVerifications: data.stageVerifications && typeof data.stageVerifications === 'object' ? data.stageVerifications : {},
  };
}

function requirePublisher(config) {
  assert(config.enabled, 'failed-precondition', 'ingestion_disabled', 'System recommendation ingestion is disabled.');
  assert(config.publisherUid, 'failed-precondition', 'ingestion_publisher_missing',
    'The system publisher account is not configured.');
}

async function incrementMetrics(admin, now, values) {
  const increments = Object.fromEntries(Object.entries(values)
    .filter(([, value]) => Number.isFinite(value) && value !== 0)
    .map(([key, value]) => [key, fieldValue(admin).increment(value)]));
  if (!Object.keys(increments).length) return;
  await admin.firestore().doc(`${paths.metrics}/${dayKey(now)}`).set({
    ...increments,
    updatedAt: fieldValue(admin).serverTimestamp(),
  }, { merge: true });
}

// Daily windowed quota shared by all ingestion work of one kind.
async function consumeDailyQuota(admin, ref, { units = 1, bytes = 0, maxUnits, maxBytes = Infinity, now, reason }) {
  const db = admin.firestore();
  const day = dayKey(now);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(db.doc(ref));
    const previous = snapshot.exists && snapshot.data()?.day === day ? snapshot.data() : {};
    const usedUnits = Number(previous.units || 0) + units;
    const usedBytes = Number(previous.bytes || 0) + bytes;
    assert(usedUnits <= maxUnits && usedBytes <= maxBytes, 'resource-exhausted', reason,
      'The daily ingestion quota was reached.');
    transaction.set(db.doc(ref), {
      day, units: usedUnits, bytes: usedBytes, updatedAt: fieldValue(admin).serverTimestamp(),
    });
  });
}

function consumePlacesUnits(admin, units, now) {
  return consumeDailyQuota(admin, paths.placesBudget, {
    units, maxUnits: DAILY_PLACES_UNITS, now, reason: 'ingestion_places_quota',
  });
}

async function loadDestination(db, destinationRef) {
  const countryId = String(destinationRef?.countryId || '');
  const cityId = String(destinationRef?.cityId || '');
  if (!countryId || !cityId || countryId.includes('/') || cityId.includes('/')) return null;
  const [country, city] = await Promise.all([
    db.doc(`countries/${countryId}`).get(),
    db.doc(`countries/${countryId}/destinations/${cityId}`).get(),
  ]);
  if (!country.exists || !city.exists) return null;
  const cityData = city.data() || {};
  const countryData = country.data() || {};
  const names = [cityData.name, cityData.names?.he, cityData.names?.en, cityData.identity?.names?.he,
    cityData.identity?.names?.en, cityData.googleCache?.names?.he, cityData.googleCache?.names?.en,
    countryData.name, countryData.names?.he, countryData.names?.en,
    ...(Array.isArray(cityData.aliases) ? cityData.aliases : [])]
    .filter((name) => typeof name === 'string' && name.trim());
  return {
    countryId,
    cityId,
    countryCode: String(countryData.code || countryId).toUpperCase(),
    countryName: countryData.names?.he || countryData.name || countryId,
    cityName: destinationHebrewName(cityData) || cityData.identity?.names?.en || cityId,
    names,
    coordinates: normalizeMapCoordinates(cityData.googleCache?.coordinates || cityData.identity?.coordinates ||
      cityData.coordinates),
    active: cityData.status === 'active' && countryData.status === 'active',
  };
}

function placeNamesMatch(candidate, query) {
  const left = normalizeName(candidate);
  const right = normalizeName(query);
  if (!left || !right) return false;
  if (left === right) return true;
  const shorter = left.length <= right.length ? left : right;
  const longer = shorter === left ? right : left;
  return shorter.length >= 4 && longer.includes(shorter);
}

function placeSnapshot(bilingual) {
  const he = bilingual?.he || {};
  const en = bilingual?.en || {};
  return {
    placeId: he.placeId || en.placeId,
    name: he.displayName || en.displayName || '',
    nameEn: en.displayName || '',
    address: he.address || en.address || '',
    coordinates: he.coordinates || en.coordinates || null,
    types: Array.from(new Set([...(he.types || []), ...(en.types || [])])).slice(0, 12),
    countryCode: he.countryCode || en.countryCode || '',
  };
}

function placeMatchesDestination(place, destination) {
  if (!place?.placeId || !place.coordinates) return false;
  if (place.countryCode && destination.countryCode && place.countryCode !== destination.countryCode) return false;
  return !destination.coordinates || distanceKm(destination.coordinates, place.coordinates) <= PLACE_MATCH_RADIUS_KM;
}

// A business-name match is accepted only when it is the single matching branch
// near the destination. Every other outcome needs a reviewer decision.
async function resolveCandidatePlace({ admin, deps, query, destination, groupKey, now }) {
  const db = admin.firestore();
  const cacheRef = db.doc(`${paths.placeCache}/${shortHash(`${groupKey}:${normalizeName(query)}`)}`);
  const cached = await cacheRef.get();
  if (cached.exists && now.getTime() - (toMillis(cached.data()?.resolvedAt) || 0) < PLACE_CACHE_TTL_MS) {
    return cached.data().location;
  }
  if (!query) return { status: 'not_found', query, choices: [] };
  await consumePlacesUnits(admin, 1, now);
  const predictions = (await deps.autocomplete({ query, coordinates: destination.coordinates }) || []).slice(0, 5);
  const choices = predictions.map((prediction) => ({
    placeId: prediction.placeId,
    name: String(prediction.text || '').slice(0, 200),
    secondaryText: String(prediction.secondaryText || '').slice(0, 200),
  }));
  const matching = predictions.filter((prediction) => placeNamesMatch(prediction.text, query));
  let location;
  if (matching.length === 1) {
    await consumePlacesUnits(admin, 2, now);
    const place = placeSnapshot(await deps.fetchPlace(matching[0].placeId));
    location = placeMatchesDestination(place, destination)
      ? { status: 'resolved', query, placeId: place.placeId, place, choices, resolvedBy: 'auto' }
      : { status: 'ambiguous', query, choices, reason: 'outside_destination' };
  } else {
    location = { status: predictions.length ? 'ambiguous' : 'not_found', query, choices };
  }
  await cacheRef.set({ location, resolvedAt: fieldValue(admin).serverTimestamp() });
  await incrementMetrics(admin, now, { placesUnits: matching.length === 1 ? 3 : 1 });
  return location;
}

function photoItemRef(db, sourceId, index) {
  return db.doc(`${paths.sources}/${sourceId}/items/photo_${index}`);
}

async function loadPhotoPool(db, sourceId) {
  const snapshot = await db.collection(`${paths.sources}/${sourceId}/items`).get();
  return snapshot.docs.map((doc) => doc.data()).filter((item) => Number.isInteger(item?.index))
    .sort((left, right) => left.index - right.index);
}

// Downloads and prepares each source image once. Prepared assets are owned by the
// system publisher, protected from orphan cleanup by mediaCleanupKeys, and reused.
async function preparePhotoPool({ admin, deps, source, config, now }) {
  const db = admin.firestore();
  const pool = [];
  for (const image of (source.images || []).slice(0, config.maxImagesPerPost)) {
    const ref = photoItemRef(db, source.sourceId, image.index);
    // eslint-disable-next-line no-await-in-loop
    const existing = await ref.get();
    const imageKey = shortHash(image.providerMediaId || image.url, 24);
    if (existing.exists && existing.data()?.state === 'prepared' && existing.data()?.imageKey === imageKey) {
      pool.push(existing.data());
      continue;
    }
    let item;
    try {
      // eslint-disable-next-line no-await-in-loop
      const downloaded = await deps.downloadImage(image.url);
      // eslint-disable-next-line no-await-in-loop
      await consumeDailyQuota(admin, paths.mediaBudget, {
        units: 1, bytes: downloaded.buffer.length, maxUnits: DAILY_MEDIA_IMAGES,
        maxBytes: DAILY_MEDIA_BYTES, now, reason: 'ingestion_media_quota',
      });
      const stagingPath = `media-staging/${config.publisherUid}/${crypto.randomUUID()}.jpg`;
      // eslint-disable-next-line no-await-in-loop
      await deps.writeStaging(stagingPath, downloaded.buffer, config.publisherUid);
      // eslint-disable-next-line no-await-in-loop
      const asset = await deps.prepareMedia({
        ownerUid: config.publisherUid,
        data: { kind: 'recommendation', stagingPath },
        commitPreparedAsset: (prepared) => ref.set({
          index: image.index,
          imageKey,
          state: 'prepared',
          asset: prepared,
          mediaCleanupKeys: [`${config.publisherUid}/${prepared.assetId}`],
          ocrText: image.ocrText || '',
          preparedAt: fieldValue(admin).serverTimestamp(),
        }),
      });
      item = {
        index: image.index, imageKey, state: 'prepared', asset,
        mediaCleanupKeys: [`${config.publisherUid}/${asset.assetId}`], ocrText: image.ocrText || '',
      };
      // eslint-disable-next-line no-await-in-loop
      await incrementMetrics(admin, now, { imagesPrepared: 1, imageBytes: downloaded.buffer.length });
    } catch (error) {
      const reason = error?.reason || error?.details?.reason || 'image_preparation_failed';
      if (reason === 'ingestion_media_quota') throw error;
      item = { index: image.index, imageKey, state: 'failed', reason, ocrText: image.ocrText || '' };
      // eslint-disable-next-line no-await-in-loop
      await ref.set({ ...item, failedAt: fieldValue(admin).serverTimestamp() });
      // eslint-disable-next-line no-await-in-loop
      await incrementMetrics(admin, now, { imagesFailed: 1 });
    }
    pool.push(item);
  }
  return pool;
}

function sourceSummary(source) {
  return {
    url: source.url || '',
    postedAt: toDate(source.postedAt),
    actualLikes: source.actualLikes,
  };
}

function candidateIdFor(sourceId, placeQuery) {
  return `cand_${shortHash(`${sourceId}:${normalizeName(placeQuery)}`)}`;
}

// ---------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------

async function startRecommendationIngestionCollection({ admin, auth, data, apifyToken, deps = {} }) {
  await prepareAdminAction(admin, auth, 'startRecommendationIngestionCollection');
  const apify = deps.apify || apifyProvider;
  const now = deps.now ? deps.now() : new Date();
  const db = admin.firestore();
  const groupKey = cleanDocumentId(data?.groupKey, 'groupKey');
  const config = await readConfig(db);
  requirePublisher(config);
  assert(apifyToken, 'failed-precondition', 'apify_not_configured', 'The collection provider is not configured.');
  const stage = stageConfig(config.rolloutStage);
  const runId = crypto.randomUUID();
  const runRef = db.doc(`${paths.runs}/${runId}`);
  const onlyPostsNewerThan = new Date(now.getTime() - FRESHNESS_DAYS * 86_400_000).toISOString().slice(0, 10);
  const run = await db.runTransaction(async (transaction) => {
    const [groupSnapshot, ledgerSnapshot, enabledGroups, activeRuns] = await Promise.all([
      transaction.get(db.doc(`${paths.groups}/${groupKey}`)),
      transaction.get(db.doc(paths.ledger)),
      transaction.get(db.collection(paths.groups).where('enabled', '==', true)),
      transaction.get(db.collection(paths.runs).where('status', 'in', ['starting', 'running', 'start_uncertain'])),
    ]);
    assert(groupSnapshot.exists, 'not-found', 'ingestion_group_missing', 'The group does not exist.');
    const group = groupSnapshot.data() || {};
    assert(group.enabled === true && group.verifiedAt, 'failed-precondition', 'ingestion_group_not_ready',
      'Enable and verify the group before collecting.');
    assert(enabledGroups.size <= stage.maxEnabledGroups, 'failed-precondition', 'ingestion_stage_limit',
      'Too many groups are enabled for the current rollout stage.');
    assert(activeRuns.size < stage.maxActiveRuns &&
      !activeRuns.docs.some((doc) => doc.data()?.groupKey === groupKey),
    'failed-precondition', 'ingestion_run_active', 'A collection run is already active.');
    const resultsLimit = Math.max(1, Math.min(Number(group.resultsLimit) || stage.maxResultsLimit, stage.maxResultsLimit));
    const reservedUsd = round2(Math.min(config.perRunChargeCapUsd, stage.maxRunChargeUsd));
    const ledger = ledgerSnapshot.exists ? ledgerSnapshot.data() || {} : {};
    const check = collectionBudgetCheck(ledger, {
      reserveUsd: reservedUsd, reservePosts: resultsLimit, capUsd: config.capUsd, capPosts: config.capPosts,
    });
    assert(check.allowed, 'resource-exhausted', 'ingestion_budget_exhausted', 'The collection budget is exhausted.');
    transaction.set(db.doc(paths.ledger), {
      reservedUsd: round2(Number(ledger.reservedUsd || 0) + reservedUsd),
      reservedPosts: Number(ledger.reservedPosts || 0) + resultsLimit,
      spentUsd: round2(ledger.spentUsd || 0),
      collectedPosts: Number(ledger.collectedPosts || 0),
      runCount: Number(ledger.runCount || 0) + 1,
      updatedAt: fieldValue(admin).serverTimestamp(),
    });
    const created = {
      runId, groupKey, groupUrl: group.url, status: 'starting', stage: config.rolloutStage, viewOption: config.viewOption,
      reservedUsd, resultsLimit, onlyPostsNewerThan, requestedBy: auth.uid, ledgerSettled: false,
      createdAt: fieldValue(admin).serverTimestamp(), updatedAt: fieldValue(admin).serverTimestamp(),
    };
    transaction.create(runRef, created);
    return created;
  });

  let summary;
  try {
    summary = await apify.startGroupRun({
      token: apifyToken,
      fetchImpl: deps.fetchImpl,
      groupUrl: run.groupUrl,
      resultsLimit: run.resultsLimit,
      onlyPostsNewerThan,
      maxTotalChargeUsd: run.reservedUsd,
      viewOption: run.viewOption,
    });
  } catch (error) {
    if (error?.details?.uncertain === true) {
      // A lost response may still have started a billable run; keep the reservation.
      await runRef.set({ status: 'start_uncertain', error: error.details.reason || 'unknown',
        updatedAt: fieldValue(admin).serverTimestamp() }, { merge: true });
    } else {
      await settleRun(admin, runRef, { status: 'failed', spentUsd: 0, collectedPosts: 0,
        error: error?.details?.reason || 'start_failed' });
    }
    throw error;
  }
  await runRef.set({
    status: 'running', providerRunId: summary.providerRunId, datasetId: summary.datasetId,
    startedAt: fieldValue(admin).serverTimestamp(), updatedAt: fieldValue(admin).serverTimestamp(),
  }, { merge: true });
  await audit({ admin, auth, action: 'startRecommendationIngestionCollection',
    target: { type: 'recommendationIngestionRun', id: runId },
    reason: 'collection', metadata: { groupKey, resultsLimit: run.resultsLimit, reservedUsd: run.reservedUsd } });
  return { runId, status: 'running', resultsLimit: run.resultsLimit, reservedUsd: run.reservedUsd };
}

// Moves a run's reservation into spent/collected exactly once.
async function settleRun(admin, runRef, { status, spentUsd, collectedPosts, error = null, counts = null }) {
  const db = admin.firestore();
  await db.runTransaction(async (transaction) => {
    const [runSnapshot, ledgerSnapshot] = await Promise.all([
      transaction.get(runRef), transaction.get(db.doc(paths.ledger)),
    ]);
    const run = runSnapshot.data() || {};
    if (run.ledgerSettled === true) return;
    const ledger = ledgerSnapshot.data() || {};
    transaction.set(db.doc(paths.ledger), {
      reservedUsd: round2(Math.max(0, Number(ledger.reservedUsd || 0) - Number(run.reservedUsd || 0))),
      reservedPosts: Math.max(0, Number(ledger.reservedPosts || 0) - Number(run.resultsLimit || 0)),
      spentUsd: round2(Number(ledger.spentUsd || 0) + Number(spentUsd || 0)),
      collectedPosts: Number(ledger.collectedPosts || 0) + Number(collectedPosts || 0),
      updatedAt: fieldValue(admin).serverTimestamp(),
    }, { merge: true });
    transaction.set(runRef, {
      status, ledgerSettled: true, spentUsd: round2(spentUsd), collectedPosts,
      ...(error ? { error } : {}), ...(counts ? { counts } : {}),
      finishedAt: fieldValue(admin).serverTimestamp(), updatedAt: fieldValue(admin).serverTimestamp(),
    }, { merge: true });
  });
}

function taskIdFor(sourceId, contentHash, attempt = 0) {
  return `${sourceId}_${String(contentHash).slice(0, 12)}_${attempt}`;
}

async function enqueueSource(admin, sourceId, contentHash, attempt = 0) {
  try {
    await admin.firestore().doc(`${paths.tasks}/${taskIdFor(sourceId, contentHash, attempt)}`).create({
      sourceId, createdAt: fieldValue(admin).serverTimestamp(),
    });
  } catch (error) {
    if (!['already-exists', 6, '6'].includes(error?.code) && !/already exists/i.test(String(error?.message))) throw error;
  }
}

// Stores normalized private source records and queues only eligible posts.
async function ingestProviderItems({ admin, run, items, now }) {
  const db = admin.firestore();
  const counts = { invalid: 0 };
  for (const item of items.slice(0, run.resultsLimit)) {
    const source = normalizeApifyItem(item, { groupKey: run.groupKey });
    if (!source) {
      counts.invalid += 1;
      continue;
    }
    let filter = evaluateSource(source, { now });
    if (filter.status === 'eligible') {
      // eslint-disable-next-line no-await-in-loop
      const duplicates = await db.collection(paths.sources).where('contentHash', '==', source.contentHash).limit(2).get();
      if (duplicates.docs.some((doc) => doc.id !== source.sourceId)) filter = { status: 'duplicate', reason: 'same_content' };
    }
    counts[filter.status] = (counts[filter.status] || 0) + 1;
    const ref = db.doc(`${paths.sources}/${source.sourceId}`);
    // eslint-disable-next-line no-await-in-loop
    const enqueue = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const existing = snapshot.exists ? snapshot.data() || {} : null;
      const base = {
        actualLikes: source.actualLikes,
        totalReactions: source.totalReactions,
        lastSeenRunId: run.runId,
        lastCollectedAt: fieldValue(admin).serverTimestamp(),
        updatedAt: fieldValue(admin).serverTimestamp(),
      };
      if (!existing) {
        transaction.create(ref, {
          ...source,
          ...base,
          filter: { ...filter, evaluatedAt: now },
          processing: { state: filter.status === 'eligible' ? 'pending' : 'skipped', attempts: 0 },
          reviewLocked: false,
          firstSeenRunId: run.runId,
          createdAt: fieldValue(admin).serverTimestamp(),
        });
        return filter.status === 'eligible';
      }
      const contentChanged = existing.contentHash !== source.contentHash;
      if (existing.reviewLocked === true) {
        // Approved or published candidates never change silently.
        transaction.set(ref, { ...base, ...(contentChanged ? { changedAfterReview: true } : {}) }, { merge: true });
        return false;
      }
      const becameEligible = filter.status === 'eligible' && existing.filter?.status !== 'eligible';
      const reprocess = filter.status === 'eligible' && (becameEligible || contentChanged);
      transaction.set(ref, {
        ...base,
        ...(contentChanged ? { text: source.text, images: source.images, contentHash: source.contentHash } : {}),
        filter: { ...filter, evaluatedAt: now },
        ...(reprocess ? { processing: { state: 'pending', attempts: 0 } } : {}),
      }, { merge: true });
      return reprocess;
    });
    // eslint-disable-next-line no-await-in-loop
    if (enqueue) await enqueueSource(admin, source.sourceId, source.contentHash);
  }
  return counts;
}

async function pollRecommendationIngestionRuns({ admin, apifyToken, deps = {}, limit = 5 }) {
  const apify = deps.apify || apifyProvider;
  const now = deps.now ? deps.now() : new Date();
  const db = admin.firestore();
  const result = { polled: 0, finished: 0, requeued: 0 };
  if (apifyToken) {
    const runs = await db.collection(paths.runs).where('status', '==', 'running').limit(limit).get();
    for (const doc of runs.docs) {
      const run = doc.data() || {};
      result.polled += 1;
      let summary;
      try {
        // eslint-disable-next-line no-await-in-loop
        summary = await apify.getRun({ token: apifyToken, fetchImpl: deps.fetchImpl, providerRunId: run.providerRunId });
      } catch (error) {
        console.warn('ingestion_run_poll_failed', { runId: doc.id, reason: error?.details?.reason || 'unknown' });
        continue;
      }
      if (!summary.terminal) {
        // eslint-disable-next-line no-await-in-loop
        await doc.ref.set({ providerStatus: summary.status, lastPolledAt: fieldValue(admin).serverTimestamp() },
          { merge: true });
        continue;
      }
      try {
        let items = [];
        if (summary.datasetId) {
          // eslint-disable-next-line no-await-in-loop
          items = await apify.listDatasetItems({
            token: apifyToken, fetchImpl: deps.fetchImpl, datasetId: summary.datasetId, limit: run.resultsLimit,
          });
        }
        // Ingestion is idempotent per source, so a failed attempt is safely retried next tick.
        // eslint-disable-next-line no-await-in-loop
        const counts = await ingestProviderItems({ admin, run: { ...run, runId: doc.id }, items, now });
        // Unknown provider cost keeps the full reservation charged.
        const spentUsd = summary.usageTotalUsd == null ? run.reservedUsd : summary.usageTotalUsd;
        // eslint-disable-next-line no-await-in-loop
        await settleRun(admin, doc.ref, {
          status: summary.status === 'SUCCEEDED' ? 'completed' : 'failed',
          spentUsd,
          collectedPosts: Math.min(items.length, run.resultsLimit),
          error: summary.status === 'SUCCEEDED' ? null : `provider_${summary.status.toLowerCase()}`,
          counts,
        });
        // eslint-disable-next-line no-await-in-loop
        await incrementMetrics(admin, now, { postsCollected: items.length, collectionUsd: spentUsd });
        result.finished += 1;
      } catch (error) {
        console.warn('ingestion_run_finalize_failed', { runId: doc.id, reason: error?.details?.reason || 'unknown' });
      }
    }
  }
  // Resume work whose lease expired or that failed with a retryable error.
  const stale = await db.collection(paths.sources)
    .where('processing.state', 'in', ['processing', 'failed'])
    .where('processing.retryAt', '<=', now)
    .limit(limit)
    .get();
  for (const doc of stale.docs) {
    const source = doc.data() || {};
    if (Number(source.processing?.attempts || 0) >= MAX_PROCESSING_ATTEMPTS) {
      // Surface exhausted work instead of leaving it in processing/failed forever.
      // eslint-disable-next-line no-await-in-loop
      await doc.ref.set({ processing: { state: 'blocked', reason: 'max_attempts', leaseId: null, retryAt: null } },
        { merge: true });
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    await enqueueSource(admin, doc.id, source.contentHash, Number(source.processing?.attempts || 0));
    result.requeued += 1;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Processing
// ---------------------------------------------------------------------------

async function claimSource(admin, sourceRef, now) {
  const db = admin.firestore();
  const leaseId = crypto.randomUUID();
  const claimed = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(sourceRef);
    if (!snapshot.exists) return null;
    const source = snapshot.data() || {};
    const processing = source.processing || {};
    const attempts = Number(processing.attempts || 0);
    const leaseExpired = processing.state === 'processing' && (toMillis(processing.leaseUntil) || 0) <= now.getTime();
    const claimable = processing.state === 'pending' || leaseExpired ||
      (processing.state === 'failed' && attempts < MAX_PROCESSING_ATTEMPTS);
    if (!claimable || source.filter?.status !== 'eligible' || source.reviewLocked === true) return null;
    transaction.set(sourceRef, {
      processing: {
        state: 'processing', leaseId, attempts: attempts + 1,
        leaseUntil: new Date(now.getTime() + LEASE_MS), retryAt: new Date(now.getTime() + LEASE_MS),
      },
    }, { merge: true });
    return { ...source, sourceId: snapshot.id };
  });
  return claimed ? { source: claimed, leaseId } : null;
}

function plannedPhotoIds(draft, pool, drafts, claimed) {
  const prepared = pool.filter((item) => item.state === 'prepared').map((item) => item.index);
  if (drafts.length === 1) return { photoIds: prepared.slice(0, MAX_CANDIDATE_PHOTOS), mode: 'single_recommendation' };
  const mapped = draft.evidence.photoIndexes.filter((index) => prepared.includes(index) && !claimed.has(index));
  mapped.forEach((index) => claimed.add(index));
  return mapped.length
    ? { photoIds: mapped.slice(0, MAX_CANDIDATE_PHOTOS), mode: 'model_evidence' }
    : { photoIds: [], mode: 'manual_required' };
}

async function processIngestionSource({ admin, sourceId, deps }) {
  const now = deps.now ? deps.now() : new Date();
  const db = admin.firestore();
  const sourceRef = db.doc(`${paths.sources}/${sourceId}`);
  const claim = await claimSource(admin, sourceRef, now);
  if (!claim) return { skipped: true };
  const { source, leaseId } = claim;
  const assertLease = async () => {
    const current = (await sourceRef.get()).data();
    assert(current?.processing?.leaseId === leaseId, 'aborted', 'ingestion_lease_lost', 'The processing lease was lost.');
  };
  try {
    const config = await readConfig(db);
    requirePublisher(config);
    const group = (await db.doc(`${paths.groups}/${source.groupKey}`).get()).data() || {};
    const destination = await loadDestination(db, { countryId: group.countryId, cityId: group.cityId });
    assert(destination?.active, 'failed-precondition', 'ingestion_destination_missing',
      'The group destination is not an active PlanLi destination.');

    const cacheKey = extractionCacheKey(source, config.extractionModel);
    let rawCandidates = source.extraction?.cacheKey === cacheKey ? source.extraction.candidates : null;
    if (!rawCandidates) {
      const extraction = await deps.extract({ source, model: config.extractionModel });
      rawCandidates = extraction.candidates;
      await sourceRef.set({ extraction: {
        cacheKey, model: extraction.model, candidates: rawCandidates, usage: extraction.usage, at: now,
      } }, { merge: true });
      await incrementMetrics(admin, now, {
        extractionCalls: 1,
        extractionInputTokens: extraction.usage?.inputTokens || 0,
        extractionOutputTokens: extraction.usage?.outputTokens || 0,
      });
    }
    const drafts = validateExtraction(rawCandidates, source, { destinationNames: destination.names });
    if (!drafts.length) {
      await sourceRef.set({ processing: { state: 'done', outcome: 'no_candidates', leaseId: null,
        retryAt: null, completedAt: now }, candidateIds: [] }, { merge: true });
      return { candidates: 0 };
    }

    await assertLease();
    const pool = await preparePhotoPool({ admin, deps, source, config, now });
    const claimedPhotos = new Set();
    const candidateIds = [];
    for (const draft of drafts) {
      const candidateId = candidateIdFor(sourceId, draft.placeQuery);
      candidateIds.push(candidateId);
      const ref = db.doc(`${paths.candidates}/${candidateId}`);
      // eslint-disable-next-line no-await-in-loop
      const existing = (await ref.get()).data();
      if (existing && (LOCKED_REVIEW_STATES.has(existing.reviewState) || existing.reviewedBy)) {
        (existing.photoIds || []).forEach((index) => claimedPhotos.add(index));
        continue;
      }
      let location;
      try {
        // eslint-disable-next-line no-await-in-loop
        location = await resolveCandidatePlace({
          admin, deps, query: draft.placeQuery, destination, groupKey: source.groupKey, now,
        });
      } catch (error) {
        if (error?.details?.reason === 'ingestion_places_quota') throw error;
        location = { status: 'failed', query: draft.placeQuery, choices: [], reason: 'place_resolution_failed' };
      }
      const photos = plannedPhotoIds(draft, pool, drafts, claimedPhotos);
      const issues = [...draft.issues];
      if (photos.mode === 'manual_required') issues.push({ code: 'photo_mapping_required', severity: 'warning', field: 'photos' });
      if (pool.some((item) => item.state === 'failed')) issues.push({ code: 'some_photos_failed', severity: 'warning', field: 'photos' });
      if (location.status === 'ambiguous') issues.push({ code: 'location_ambiguous', severity: 'warning', field: 'location' });
      if (location.status === 'not_found' || location.status === 'failed') {
        issues.push({ code: 'location_not_found', severity: 'warning', field: 'location' });
      }
      const candidate = {
        candidateId,
        sourceId,
        groupKey: source.groupKey,
        destinationRef: { countryId: destination.countryId, cityId: destination.cityId },
        destinationNames: { countryName: destination.countryName, cityName: destination.cityName },
        content: draft.content,
        evidence: draft.evidence,
        fidelity: draft.fidelity,
        location,
        photoIds: photos.photoIds,
        photoMapping: { mode: photos.mode, evidence: draft.evidence.photoEvidence },
        issues,
        source: sourceSummary(source),
        publishRequestId: deterministicPublishRequestId(candidateId),
        revision: Number(existing?.revision || 0) + 1,
      };
      const readiness = computeReadiness(candidate, { photoPool: pool, source, destinationNames: destination.names });
      // eslint-disable-next-line no-await-in-loop
      await ref.set({
        ...candidate,
        readiness,
        reviewState: reviewStateFor(candidate, readiness),
        createdAt: existing?.createdAt || fieldValue(admin).serverTimestamp(),
        updatedAt: fieldValue(admin).serverTimestamp(),
      });
    }
    await assertLease();
    await sourceRef.set({
      candidateIds,
      processing: { state: 'done', outcome: 'candidates', leaseId: null, retryAt: null, completedAt: now },
    }, { merge: true });
    await incrementMetrics(admin, now, { candidatesCreated: drafts.length, sourcesProcessed: 1 });
    return { candidates: drafts.length };
  } catch (error) {
    const reason = error?.details?.reason || 'processing_failed';
    if (reason === 'ingestion_lease_lost') return { failed: reason };
    const retryable = error?.code !== 'failed-precondition';
    // Record the failure only while this worker still owns the lease.
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(sourceRef);
      if (snapshot.data()?.processing?.leaseId !== leaseId) return;
      transaction.set(sourceRef, { processing: {
        state: retryable ? 'failed' : 'blocked', reason, leaseId: null,
        retryAt: retryable ? new Date(now.getTime() + 15 * 60 * 1000) : null,
      } }, { merge: true });
    }).catch(() => {});
    console.error('ingestion_source_failed', { sourceId, reason });
    if (retryable) throw error;
    return { failed: reason };
  }
}

// ---------------------------------------------------------------------------
// Review API
// ---------------------------------------------------------------------------

function candidateSummary(id, candidate, pool = []) {
  const firstPhoto = pool.find((item) => item.index === candidate.photoIds?.[0])?.asset;
  return {
    candidateId: id,
    title: candidate.content?.title || candidate.evidence?.placeName || '',
    cityName: candidate.destinationNames?.cityName || '',
    reviewState: candidate.reviewState,
    readiness: candidate.readiness || { ready: false, missing: [] },
    revision: candidate.revision,
    actualLikes: candidate.source?.actualLikes ?? null,
    postedAtMs: toMillis(candidate.source?.postedAt),
    thumbUrl: firstPhoto?.thumb?.url || '',
    publishedRecommendationId: candidate.published?.recommendationId || '',
    updatedAtMs: toMillis(candidate.updatedAt),
  };
}

async function listSystemRecommendationCandidates({ admin, auth, data }) {
  await prepareAdminAction(admin, auth, 'listSystemRecommendationCandidates');
  const db = admin.firestore();
  const reviewState = String(data?.reviewState || 'ready');
  assert(REVIEW_STATES.includes(reviewState), 'invalid-argument', 'ingestion_input_invalid', 'reviewState is invalid.');
  let query = db.collection(paths.candidates).where('reviewState', '==', reviewState)
    .orderBy('updatedAt', 'desc').limit(PAGE_SIZE);
  if (data?.cursor) {
    const cursor = await db.doc(`${paths.candidates}/${cleanDocumentId(data.cursor, 'cursor')}`).get();
    if (cursor.exists) query = query.startAfter(cursor);
  }
  const snapshot = await query.get();
  const items = await Promise.all(snapshot.docs.map(async (doc) => {
    const candidate = doc.data() || {};
    const pool = candidate.photoIds?.length ? await loadPhotoPool(db, candidate.sourceId) : [];
    return candidateSummary(doc.id, candidate, pool);
  }));
  return {
    items,
    nextCursor: snapshot.size === PAGE_SIZE ? snapshot.docs[snapshot.docs.length - 1].id : null,
  };
}

// Builds the public preview from the exact publish request, using the same
// canonical sanitizers saveRecommendation applies before persisting.
function buildPreview({ candidate, pool, publisherUid }) {
  const request = buildPublishData(candidate, pool);
  const rec = request.recommendation;
  let content = null;
  let details = {};
  try {
    content = sanitizeRecommendationCatalogContent({ ...rec, budget: rec.budget || POST_BUDGET_IDS[0] });
    details = sanitizeRecommendationDetails(rec.details, content);
  } catch {
    content = null;
  }
  return {
    id: `preview_${candidate.candidateId}`,
    ownerId: publisherUid,
    status: 'active',
    title: content?.title || rec.title,
    description: content?.description || rec.description,
    category: content?.category || catalogCategory(rec.categoryId)?.label || '',
    categoryId: rec.categoryId,
    subcategoryIds: content?.subcategoryIds || rec.subcategoryIds,
    customSubcategoryLabel: content?.customSubcategoryLabel || '',
    recommendationCatalogVersion: rec.recommendationCatalogVersion,
    tags: content?.tags || [],
    budget: rec.budget || '',
    details,
    facets: { needs: rec.facets.needs, practicalFacts: rec.facets.practicalFacts, budgetLevel: rec.budget || '' },
    media: rec.media,
    destination: {
      countryId: candidate.destinationRef?.countryId,
      cityId: candidate.destinationRef?.cityId,
      countryName: candidate.destinationNames?.countryName || '',
      cityName: candidate.destinationNames?.cityName || '',
    },
    locationMode: 'exact',
    place: candidate.location?.place ? {
      placeId: candidate.location.place.placeId,
      name: candidate.location.place.name,
      address: candidate.location.place.address,
      coordinates: candidate.location.place.coordinates,
    } : null,
  };
}

async function readCandidateBundle(db, candidateId) {
  const snapshot = await db.doc(`${paths.candidates}/${candidateId}`).get();
  assert(snapshot.exists, 'not-found', 'candidate_not_found', 'The candidate does not exist.');
  const candidate = snapshot.data() || {};
  const [sourceSnapshot, pool] = await Promise.all([
    db.doc(`${paths.sources}/${candidate.sourceId}`).get(),
    loadPhotoPool(db, candidate.sourceId),
  ]);
  return { ref: snapshot.ref, candidate, source: sourceSnapshot.data() || {}, pool };
}

async function getSystemRecommendationCandidate({ admin, auth, data }) {
  await prepareAdminAction(admin, auth, 'getSystemRecommendationCandidate');
  const db = admin.firestore();
  const candidateId = cleanDocumentId(data?.candidateId, 'candidateId');
  const { candidate, source, pool } = await readCandidateBundle(db, candidateId);
  const config = await readConfig(db);
  const publisher = config.publisherUid
    ? (await db.doc(`publicProfiles/${config.publisherUid}`).get()).data() || null
    : null;
  return {
    candidate: {
      candidateId,
      revision: candidate.revision,
      reviewState: candidate.reviewState,
      readiness: candidate.readiness,
      content: candidate.content,
      location: candidate.location,
      photoIds: candidate.photoIds || [],
      photoMapping: candidate.photoMapping,
      issues: candidate.issues || [],
      evidence: candidate.evidence,
      fidelity: candidate.fidelity,
      published: candidate.published ? {
        recommendationId: candidate.published.recommendationId,
        url: `${PUBLIC_RECOMMENDATION_URL}${candidate.published.recommendationId}`,
        publicationStatus: candidate.published.publicationStatus || 'active',
      } : null,
      rejection: candidate.rejection ? { reason: candidate.rejection.reason } : null,
    },
    preview: buildPreview({ candidate: { ...candidate, candidateId }, pool, publisherUid: config.publisherUid }),
    publisher: publisher ? { uid: config.publisherUid, displayName: publisher.displayName, photoURL: publisher.photoURL || null } : null,
    source: {
      url: source.url || '',
      postedAtMs: toMillis(source.postedAt),
      actualLikes: source.actualLikes ?? null,
      totalReactions: source.totalReactions ?? null,
      text: source.text || '',
      changedAfterReview: source.changedAfterReview === true,
      filter: source.filter?.status || '',
    },
    photoPool: pool.map((item) => ({
      index: item.index,
      state: item.state,
      reason: item.reason || '',
      thumbUrl: item.asset?.thumb?.url || '',
      feedUrl: item.asset?.feed?.url || '',
      ocrText: item.ocrText || '',
    })),
  };
}

function cleanSelection(values, allowed, field, maximum) {
  assert(Array.isArray(values) && values.length <= maximum, 'invalid-argument', 'ingestion_input_invalid', `${field} is invalid.`);
  const result = Array.from(new Set(values));
  assert(result.every((value) => typeof value === 'string' && allowed.includes(value)),
    'invalid-argument', 'ingestion_input_invalid', `${field} is invalid.`);
  return result;
}

function cleanContentPatch(patch, current) {
  const next = { ...current, details: { ...(current.details || {}) } };
  const changed = new Set();
  if (patch.title !== undefined) { next.title = cleanText(patch.title, 'title', { max: TITLE_MAX }); changed.add('title'); }
  if (patch.description !== undefined) {
    next.description = cleanText(patch.description, 'description', { max: DESCRIPTION_MAX });
    changed.add('description');
  }
  if (patch.categoryId !== undefined) {
    assert(catalogCategory(patch.categoryId), 'invalid-argument', 'ingestion_input_invalid', 'categoryId is invalid.');
    next.categoryId = patch.categoryId;
  }
  if (patch.subcategoryIds !== undefined) {
    assert(Array.isArray(patch.subcategoryIds) && patch.subcategoryIds.length <= 3 &&
      patch.subcategoryIds.every((id) => typeof id === 'string' && id.length <= 80),
    'invalid-argument', 'ingestion_input_invalid', 'subcategoryIds is invalid.');
    next.subcategoryIds = Array.from(new Set(patch.subcategoryIds));
  }
  if (patch.customSubcategoryLabel !== undefined) {
    next.customSubcategoryLabel = cleanText(patch.customSubcategoryLabel, 'customSubcategoryLabel', { max: 40 });
  }
  if (patch.budget !== undefined) {
    assert(patch.budget === '' || POST_BUDGET_IDS.includes(patch.budget), 'invalid-argument',
      'ingestion_input_invalid', 'budget is invalid.');
    next.budget = patch.budget;
  }
  if (patch.details !== undefined) {
    assert(patch.details && typeof patch.details === 'object' && !Array.isArray(patch.details),
      'invalid-argument', 'ingestion_input_invalid', 'details are invalid.');
    const limits = { contactName: 80, phone: 40, externalUrl: 500, priceNote: 120, accessibilityNote: 500, eventSchedule: 160 };
    assert(Object.keys(patch.details).every((key) => Object.hasOwn(limits, key)), 'invalid-argument',
      'ingestion_input_invalid', 'details contain unsupported fields.');
    for (const [key, maximum] of Object.entries(limits)) {
      if (patch.details[key] !== undefined) next.details[key] = cleanText(patch.details[key], key, { max: maximum });
    }
  }
  if (patch.needs !== undefined) next.needs = cleanSelection(patch.needs, NEED_IDS, 'needs', NEED_IDS.length);
  if (patch.practicalFacts !== undefined) {
    next.practicalFacts = cleanSelection(patch.practicalFacts, PRACTICAL_FACT_IDS, 'practicalFacts', 12);
  }
  return { content: next, changed };
}

async function updateSystemRecommendationCandidate({ admin, auth, data, deps = {} }) {
  await prepareAdminAction(admin, auth, 'updateSystemRecommendationCandidate');
  const now = deps.now ? deps.now() : new Date();
  const db = admin.firestore();
  const candidateId = cleanDocumentId(data?.candidateId, 'candidateId');
  const expectedRevision = cleanRevision(data?.expectedRevision);
  const patch = data?.patch && typeof data.patch === 'object' && !Array.isArray(data.patch) ? data.patch : {};
  const allowed = ['title', 'description', 'categoryId', 'subcategoryIds', 'customSubcategoryLabel', 'budget',
    'details', 'needs', 'practicalFacts', 'photoIds', 'placeId'];
  assert(Object.keys(patch).length && Object.keys(patch).every((key) => allowed.includes(key)),
    'invalid-argument', 'ingestion_input_invalid', 'The candidate update is invalid.');
  const bundle = await readCandidateBundle(db, candidateId);
  const destination = await loadDestination(db, bundle.candidate.destinationRef);
  assert(destination, 'failed-precondition', 'ingestion_destination_missing', 'The destination is unavailable.');

  // Provider work happens before the revision-checked write and is re-validated at publish.
  let location = null;
  if (patch.placeId !== undefined) {
    const placeId = cleanText(patch.placeId, 'placeId', { min: 3, max: 300 });
    await consumePlacesUnits(admin, 2, now);
    const place = placeSnapshot(await deps.fetchPlace(placeId));
    assert(placeMatchesDestination(place, destination), 'failed-precondition', 'candidate_place_outside_destination',
      'The selected place is not in the candidate destination.');
    location = { ...(bundle.candidate.location || {}), status: 'confirmed', placeId: place.placeId, place,
      resolvedBy: 'reviewer' };
  }

  const result = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(bundle.ref);
    const candidate = snapshot.data() || {};
    assert(!LOCKED_REVIEW_STATES.has(candidate.reviewState), 'failed-precondition', 'candidate_locked',
      'This candidate can no longer be edited.');
    assert(candidate.revision === expectedRevision, 'aborted', 'candidate_revision_conflict',
      'The candidate changed. Reload it and try again.');
    const { content, changed } = cleanContentPatch(patch, candidate.content || {});
    let photoIds = candidate.photoIds || [];
    if (patch.photoIds !== undefined) {
      assert(Array.isArray(patch.photoIds) && patch.photoIds.length <= MAX_CANDIDATE_PHOTOS &&
        new Set(patch.photoIds).size === patch.photoIds.length, 'invalid-argument', 'ingestion_input_invalid',
      'photoIds is invalid.');
      const prepared = new Set(bundle.pool.filter((item) => item.state === 'prepared').map((item) => item.index));
      assert(patch.photoIds.every((index) => prepared.has(index)), 'invalid-argument', 'candidate_photo_invalid',
        'Only prepared source photos can be selected.');
      photoIds = patch.photoIds;
    }
    const sourceText = bundle.source.text || '';
    const fidelity = {
      ...(candidate.fidelity || {}),
      ...(changed.size ? { editedByReviewer: true } : {}),
      descriptionVerified: spanIsInSource(content.description, sourceText) ||
        (candidate.evidence?.descriptionSpans || []).join('\n\n') === content.description,
    };
    const next = {
      ...candidate,
      content,
      photoIds,
      fidelity,
      location: location || candidate.location,
      issues: (candidate.issues || []).filter((issue) => !(location && issue.field === 'location')),
    };
    const readiness = computeReadiness(next, { photoPool: bundle.pool, source: bundle.source, destinationNames: destination.names });
    const revision = candidate.revision + 1;
    transaction.set(bundle.ref, {
      content, photoIds, fidelity, location: next.location, issues: next.issues, readiness,
      reviewState: reviewStateFor(next, readiness), revision, reviewedBy: auth.uid,
      updatedAt: fieldValue(admin).serverTimestamp(),
    }, { merge: true });
    return { revision, readiness, reviewState: reviewStateFor(next, readiness) };
  });
  return { candidateId, ...result };
}

async function searchSystemRecommendationPlaces({ admin, auth, data, deps = {} }) {
  await prepareAdminAction(admin, auth, 'searchSystemRecommendationPlaces');
  const now = deps.now ? deps.now() : new Date();
  const db = admin.firestore();
  const candidateId = cleanDocumentId(data?.candidateId, 'candidateId');
  const query = cleanText(data?.query, 'query', { min: 2, max: 120 });
  const { candidate } = await readCandidateBundle(db, candidateId);
  const destination = await loadDestination(db, candidate.destinationRef);
  assert(destination, 'failed-precondition', 'ingestion_destination_missing', 'The destination is unavailable.');
  await consumePlacesUnits(admin, 1, now);
  const predictions = await deps.autocomplete({ query, coordinates: destination.coordinates });
  return {
    choices: (predictions || []).slice(0, 5).map((prediction) => ({
      placeId: prediction.placeId,
      name: String(prediction.text || '').slice(0, 200),
      secondaryText: String(prediction.secondaryText || '').slice(0, 200),
    })),
  };
}

async function releaseSourcePhotosIfDone(admin, sourceId) {
  const db = admin.firestore();
  const source = (await db.doc(`${paths.sources}/${sourceId}`).get()).data() || {};
  const ids = source.candidateIds || [];
  const candidates = await Promise.all(ids.map((id) => db.doc(`${paths.candidates}/${id}`).get()));
  if (!candidates.every((snapshot) => !snapshot.exists || TERMINAL_REVIEW_STATES.has(snapshot.data()?.reviewState))) return;
  // Published media is claimed by the recommendation; the remaining prepared
  // assets lose their cleanup protection and expire through the normal job.
  const items = await db.collection(`${paths.sources}/${sourceId}/items`).get();
  await Promise.all(items.docs.map((doc) => doc.ref.delete()));
}

async function rejectSystemRecommendationCandidate({ admin, auth, data }) {
  await prepareAdminAction(admin, auth, 'rejectSystemRecommendationCandidate');
  const db = admin.firestore();
  const candidateId = cleanDocumentId(data?.candidateId, 'candidateId');
  const expectedRevision = cleanRevision(data?.expectedRevision);
  const reason = cleanText(data?.reason, 'reason', { min: 3, max: 300 });
  const ref = db.doc(`${paths.candidates}/${candidateId}`);
  const sourceId = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    assert(snapshot.exists, 'not-found', 'candidate_not_found', 'The candidate does not exist.');
    const candidate = snapshot.data() || {};
    if (candidate.reviewState === 'rejected') return null;
    assert(!LOCKED_REVIEW_STATES.has(candidate.reviewState), 'failed-precondition', 'candidate_locked',
      'This candidate can no longer be rejected.');
    assert(candidate.revision === expectedRevision, 'aborted', 'candidate_revision_conflict',
      'The candidate changed. Reload it and try again.');
    transaction.set(ref, {
      reviewState: 'rejected', revision: candidate.revision + 1, reviewedBy: auth.uid,
      rejection: { reason, byUid: auth.uid, at: fieldValue(admin).serverTimestamp() },
      updatedAt: fieldValue(admin).serverTimestamp(),
    }, { merge: true });
    return candidate.sourceId;
  });
  if (sourceId) {
    await audit({ admin, auth, action: 'rejectSystemRecommendationCandidate',
      target: { type: 'systemRecommendationCandidate', id: candidateId }, reason, metadata: { expectedRevision } });
    await releaseSourcePhotosIfDone(admin, sourceId);
  }
  return { candidateId, reviewState: 'rejected' };
}

function publishedResponse(candidateId, published, replay = false) {
  return {
    candidateId,
    recommendationId: published.recommendationId,
    url: `${PUBLIC_RECOMMENDATION_URL}${published.recommendationId}`,
    publicationStatus: published.publicationStatus || 'active',
    ...(replay ? { idempotentReplay: true } : {}),
  };
}

// Approves exactly the revision the reviewer saw and publishes it under the
// configured system publisher through the canonical saveRecommendation path.
async function approveCandidate({ admin, auth, candidateId, expectedRevision, providerOptions, deps, now }) {
  const db = admin.firestore();
  const config = await readConfig(db);
  requirePublisher(config);
  const bundle = await readCandidateBundle(db, candidateId);
  const destination = await loadDestination(db, bundle.candidate.destinationRef);
  const claim = await db.runTransaction(async (transaction) => {
    const [snapshot, sourceSnapshot] = await Promise.all([
      transaction.get(bundle.ref), transaction.get(db.doc(`${paths.sources}/${bundle.candidate.sourceId}`)),
    ]);
    const candidate = snapshot.data() || {};
    if (candidate.reviewState === 'published') {
      assert(candidate.published?.revision === expectedRevision, 'aborted', 'candidate_revision_conflict',
        'The candidate changed. Reload it and try again.');
      return { replay: candidate.published };
    }
    assert(candidate.reviewState !== 'rejected', 'failed-precondition', 'candidate_locked', 'This candidate was rejected.');
    if (candidate.reviewState === 'publishing') {
      assert(candidate.publishing?.revision === expectedRevision, 'aborted', 'candidate_revision_conflict',
        'The candidate changed. Reload it and try again.');
      assert(now.getTime() - (toMillis(candidate.publishing?.startedAt) || 0) > PUBLISH_CLAIM_MS,
        'failed-precondition', 'candidate_publishing', 'This candidate is already being published.');
    } else {
      assert(candidate.revision === expectedRevision, 'aborted', 'candidate_revision_conflict',
        'The candidate changed. Reload it and try again.');
    }
    const readiness = computeReadiness(candidate, {
      photoPool: bundle.pool, source: sourceSnapshot.data() || {}, destinationNames: destination?.names || [],
    });
    assert(readiness.ready, 'failed-precondition', 'candidate_not_ready', 'The candidate is not ready to publish.');
    transaction.set(bundle.ref, {
      reviewState: 'publishing',
      publishing: { revision: expectedRevision, byUid: auth.uid, startedAt: now },
      updatedAt: fieldValue(admin).serverTimestamp(),
    }, { merge: true });
    transaction.set(sourceSnapshot.ref, { reviewLocked: true }, { merge: true });
    return { candidate };
  });
  if (claim.replay) return publishedResponse(candidateId, claim.replay, true);

  let result;
  try {
    result = await deps.saveRecommendation({
      admin,
      auth,
      ...providerOptions,
      trustedOwnerUid: config.publisherUid,
      data: buildPublishData({ ...claim.candidate, candidateId }, bundle.pool),
      resolveExactPlace: async (options) => {
        await consumePlacesUnits(admin, 5, now);
        return resolveExactPlaceWithDestination({ ...options, providerBudgetConsumed: true });
      },
    });
  } catch (error) {
    await db.runTransaction(async (transaction) => {
      const sourceRef = db.doc(`${paths.sources}/${bundle.candidate.sourceId}`);
      const [snapshot, sourceSnapshot] = await Promise.all([transaction.get(bundle.ref), transaction.get(sourceRef)]);
      const siblingIds = (sourceSnapshot.data()?.candidateIds || []).filter((id) => id !== candidateId);
      const siblings = await Promise.all(siblingIds.map((id) => transaction.get(db.doc(`${paths.candidates}/${id}`))));
      const candidate = snapshot.data() || {};
      if (!siblings.some((sibling) => ['publishing', 'published'].includes(sibling.data()?.reviewState))) {
        transaction.set(sourceRef, { reviewLocked: false }, { merge: true });
      }
      if (candidate.reviewState === 'publishing' && candidate.publishing?.revision === expectedRevision) {
        transaction.set(bundle.ref, {
          reviewState: 'ready', publishing: null,
          lastPublishError: error?.details?.reason || String(error?.code || 'publish_failed'),
          updatedAt: fieldValue(admin).serverTimestamp(),
        }, { merge: true });
      }
    }).catch(() => {});
    throw error;
  }
  const published = {
    recommendationId: result.recommendationId,
    revision: expectedRevision,
    byUid: auth.uid,
    at: now,
    publicationStatus: result.publicationStatus || publicationOutcome(result.status).publicationStatus,
  };
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(bundle.ref);
    const candidate = snapshot.data() || {};
    if (candidate.reviewState === 'published') return;
    transaction.set(bundle.ref, {
      reviewState: 'published', publishing: null, published, revision: expectedRevision,
      updatedAt: fieldValue(admin).serverTimestamp(),
    }, { merge: true });
  });
  await audit({ admin, auth, action: 'approveSystemRecommendationCandidate',
    target: { type: 'systemRecommendationCandidate', id: candidateId }, reason: 'approve_and_publish',
    metadata: { expectedRevision, recommendationId: result.recommendationId } });
  await incrementMetrics(admin, now, { published: 1 });
  await releaseSourcePhotosIfDone(admin, bundle.candidate.sourceId).catch(() => {});
  return publishedResponse(candidateId, published, result.idempotentReplay === true);
}

async function approveSystemRecommendationCandidate({ admin, auth, data, deps = {}, ...providerOptions }) {
  await prepareAdminAction(admin, auth, 'approveSystemRecommendationCandidate');
  return approveCandidate({
    admin,
    auth,
    candidateId: cleanDocumentId(data?.candidateId, 'candidateId'),
    expectedRevision: cleanRevision(data?.expectedRevision),
    providerOptions,
    deps: { saveRecommendation, ...deps },
    now: deps.now ? deps.now() : new Date(),
  });
}

async function bulkApproveSystemRecommendationCandidates({ admin, auth, data, deps = {}, ...providerOptions }) {
  await prepareAdminAction(admin, auth, 'bulkApproveSystemRecommendationCandidates');
  const config = await readConfig(admin.firestore());
  assert(stageConfig(config.rolloutStage).bulk, 'failed-precondition', 'ingestion_stage_limit',
    'Bulk publication is unavailable during the trial stage.');
  const items = Array.isArray(data?.items) ? data.items : [];
  assert(items.length >= 1 && items.length <= MAX_BULK_CANDIDATES, 'invalid-argument', 'ingestion_input_invalid',
    'Select between 1 and 25 candidates.');
  const cleaned = items.map((item) => ({
    candidateId: cleanDocumentId(item?.candidateId, 'candidateId'),
    expectedRevision: cleanRevision(item?.expectedRevision),
  }));
  assert(new Set(cleaned.map((item) => item.candidateId)).size === cleaned.length, 'invalid-argument',
    'ingestion_input_invalid', 'Candidates must be unique.');
  const results = [];
  for (const item of cleaned) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const published = await approveCandidate({
        admin, auth, ...item, providerOptions, deps: { saveRecommendation, ...deps },
        now: deps.now ? deps.now() : new Date(),
      });
      results.push({ ...published, success: true });
    } catch (error) {
      results.push({
        candidateId: item.candidateId,
        success: false,
        reason: error?.details?.reason || String(error?.code || 'publish_failed'),
      });
    }
  }
  return {
    results,
    succeeded: results.filter((item) => item.success).length,
    failed: results.filter((item) => !item.success).length,
  };
}

// ---------------------------------------------------------------------------
// Configuration, rollout stage, and status
// ---------------------------------------------------------------------------

async function updateRecommendationIngestionGroup({ admin, auth, data }) {
  await prepareAdminAction(admin, auth, 'updateRecommendationIngestionGroup');
  const db = admin.firestore();
  const config = await readConfig(db);
  const stage = stageConfig(config.rolloutStage);
  const groupKey = data?.groupKey ? cleanDocumentId(data.groupKey, 'groupKey') : groupKeyFor(data?.url);
  const ref = db.doc(`${paths.groups}/${groupKey}`);
  const patch = {};
  if (data?.url !== undefined) Object.assign(patch, { url: parseFacebookGroupUrl(data.url).url });
  if (data?.label !== undefined) patch.label = cleanText(data.label, 'label', { min: 2, max: 80 });
  if (data?.resultsLimit !== undefined) {
    const limit = Number(data.resultsLimit);
    assert(Number.isSafeInteger(limit) && limit >= 1 && limit <= stage.maxResultsLimit, 'invalid-argument',
      'ingestion_stage_limit', 'resultsLimit exceeds the current rollout stage.');
    patch.resultsLimit = limit;
  }
  if (data?.countryId !== undefined || data?.cityId !== undefined) {
    const destination = await loadDestination(db, { countryId: data.countryId, cityId: data.cityId });
    assert(destination?.active, 'failed-precondition', 'ingestion_destination_missing',
      'Choose an active PlanLi destination.');
    Object.assign(patch, { countryId: destination.countryId, cityId: destination.cityId });
  }
  if (data?.verified === true) patch.verifiedAt = new Date();
  if (data?.verified === false) patch.verifiedAt = null;
  if (data?.enabled !== undefined) {
    assert(typeof data.enabled === 'boolean', 'invalid-argument', 'ingestion_input_invalid', 'enabled is invalid.');
    patch.enabled = data.enabled;
  }
  assert(Object.keys(patch).length, 'invalid-argument', 'ingestion_input_invalid', 'Nothing to update.');
  await db.runTransaction(async (transaction) => {
    const [snapshot, enabled] = await Promise.all([
      transaction.get(ref),
      transaction.get(db.collection(paths.groups).where('enabled', '==', true)),
    ]);
    const current = snapshot.exists ? snapshot.data() || {} : null;
    assert(current || patch.url, 'not-found', 'ingestion_group_missing', 'The group does not exist.');
    const next = { ...(current || { enabled: false, resultsLimit: stage.maxResultsLimit }), ...patch };
    if (next.enabled) {
      assert(next.countryId && next.cityId && next.verifiedAt, 'failed-precondition', 'ingestion_group_not_ready',
        'Verify the group and its destination before enabling it.');
      const otherEnabled = enabled.docs.filter((doc) => doc.id !== groupKey).length;
      assert(otherEnabled + 1 <= stage.maxEnabledGroups, 'failed-precondition', 'ingestion_stage_limit',
        'Too many groups are enabled for the current rollout stage.');
    }
    transaction.set(ref, { ...next, groupKey, updatedAt: fieldValue(admin).serverTimestamp() });
  });
  await audit({ admin, auth, action: 'updateRecommendationIngestionGroup',
    target: { type: 'recommendationIngestionGroup', id: groupKey }, reason: 'group_update',
    metadata: Object.fromEntries(Object.entries(patch).map(([key, value]) => [key, value instanceof Date ? 'set' : value])) });
  return { groupKey };
}

async function advanceRecommendationIngestionStage({ admin, auth, data }) {
  await prepareAdminAction(admin, auth, 'advanceRecommendationIngestionStage');
  const db = admin.firestore();
  const recommendationId = cleanDocumentId(data?.recommendationId, 'recommendationId');
  const checklist = data?.checklist && typeof data.checklist === 'object' ? data.checklist : {};
  assert(STAGE_CHECKLIST.every((key) => checklist[key] === true), 'failed-precondition',
    'ingestion_stage_checklist_incomplete', 'Confirm every verification item first.');
  const result = await db.runTransaction(async (transaction) => {
    const configSnapshot = await transaction.get(db.doc(paths.config));
    const config = configSnapshot.data() || {};
    const current = ['trial', 'pilot', 'scale'].includes(config.rolloutStage) ? config.rolloutStage : 'trial';
    const target = NEXT_STAGE[current];
    assert(target && data?.targetStage === target, 'failed-precondition', 'ingestion_stage_invalid',
      'The requested rollout stage is invalid.');
    const [published, recommendation] = await Promise.all([
      transaction.get(db.collection(paths.candidates)
        .where('published.recommendationId', '==', recommendationId).limit(1)),
      transaction.get(db.doc(`recommendations/${recommendationId}`)),
    ]);
    assert(!published.empty && recommendation.exists && recommendation.data()?.status === 'active' &&
      recommendation.data()?.ownerId === config.publisherUid, 'failed-precondition', 'ingestion_stage_unverified',
    'Publish and verify a system recommendation in the app before expanding.');
    transaction.set(db.doc(paths.config), {
      rolloutStage: target,
      stageVerifications: {
        ...(config.stageVerifications || {}),
        [current]: { recommendationId, checklist, verifiedBy: auth.uid, verifiedAt: new Date() },
      },
      updatedAt: fieldValue(admin).serverTimestamp(),
    }, { merge: true });
    return { from: current, to: target };
  });
  await audit({ admin, auth, action: 'advanceRecommendationIngestionStage',
    target: { type: 'recommendationIngestion', id: 'rollout' }, reason: `${result.from}_to_${result.to}`,
    metadata: { recommendationId } });
  return { rolloutStage: result.to };
}

async function getRecommendationIngestionStatus({ admin, auth, deps = {} }) {
  await prepareAdminAction(admin, auth, 'getRecommendationIngestionStatus');
  const now = deps.now ? deps.now() : new Date();
  const db = admin.firestore();
  const config = await readConfig(db);
  const [ledger, groups, runs, metrics, ...counts] = await Promise.all([
    db.doc(paths.ledger).get(),
    db.collection(paths.groups).limit(50).get(),
    db.collection(paths.runs).orderBy('createdAt', 'desc').limit(10).get(),
    db.doc(`${paths.metrics}/${dayKey(now)}`).get(),
    ...REVIEW_STATES.map((state) => db.collection(paths.candidates).where('reviewState', '==', state).count().get()),
  ]);
  const ledgerData = ledger.data() || {};
  const stage = stageConfig(config.rolloutStage);
  return {
    enabled: config.enabled,
    publisherConfigured: Boolean(config.publisherUid),
    rolloutStage: config.rolloutStage,
    stageLimits: stage,
    nextStage: NEXT_STAGE[config.rolloutStage] || null,
    stageChecklist: STAGE_CHECKLIST,
    budget: {
      capUsd: config.capUsd,
      capPosts: config.capPosts,
      spentUsd: round2(ledgerData.spentUsd),
      reservedUsd: round2(ledgerData.reservedUsd),
      collectedPosts: Number(ledgerData.collectedPosts || 0),
      reservedPosts: Number(ledgerData.reservedPosts || 0),
    },
    groups: groups.docs.map((doc) => {
      const group = doc.data() || {};
      return {
        groupKey: doc.id, label: group.label || '', url: group.url || '', enabled: group.enabled === true,
        verified: Boolean(group.verifiedAt), resultsLimit: group.resultsLimit || stage.maxResultsLimit,
        countryId: group.countryId || '', cityId: group.cityId || '',
      };
    }),
    runs: runs.docs.map((doc) => {
      const run = doc.data() || {};
      return {
        runId: doc.id, groupKey: run.groupKey, status: run.status, resultsLimit: run.resultsLimit,
        reservedUsd: run.reservedUsd, spentUsd: run.spentUsd ?? null, collectedPosts: run.collectedPosts ?? null,
        counts: run.counts || null, createdAtMs: toMillis(run.createdAt),
      };
    }),
    metrics: metrics.exists ? Object.fromEntries(Object.entries(metrics.data())
      .filter(([, value]) => typeof value === 'number')) : {},
    counts: Object.fromEntries(REVIEW_STATES.map((state, index) => [state, counts[index].data().count])),
  };
}

module.exports = {
  DAILY_PLACES_UNITS,
  INGESTION_PATHS: paths,
  MAX_BULK_CANDIDATES,
  PUBLIC_RECOMMENDATION_URL,
  advanceRecommendationIngestionStage,
  approveSystemRecommendationCandidate,
  buildPreview,
  bulkApproveSystemRecommendationCandidates,
  getRecommendationIngestionStatus,
  getSystemRecommendationCandidate,
  ingestProviderItems,
  listSystemRecommendationCandidates,
  placeNamesMatch,
  pollRecommendationIngestionRuns,
  processIngestionSource,
  readConfig,
  rejectSystemRecommendationCandidate,
  resolveCandidatePlace,
  searchSystemRecommendationPlaces,
  settleRun,
  startRecommendationIngestionCollection,
  updateRecommendationIngestionGroup,
  updateSystemRecommendationCandidate,
  // Production dependency factory used by index.js.
  productionDeps: ({ admin, mediaBucket, openaiApiKey, placesProvider = 'new' }) => {
    const { autocompletePlaces, fetchBilingualPlace } = require('./placesProviderAdapter');
    const { createOpenAIClient } = require('./recommendationExtractionService');
    let client = null;
    return {
      extract: ({ source, model }) => {
        if (!client && openaiApiKey) client = createOpenAIClient(openaiApiKey);
        return extractRecommendationCandidates({ source, client, model });
      },
      downloadImage: (url) => downloadSourceImage(url),
      writeStaging: (path, buffer, ownerUid) => admin.storage().bucket(mediaBucket).file(path).save(buffer, {
        resumable: false,
        validation: 'crc32c',
        preconditionOpts: { ifGenerationMatch: 0 },
        metadata: { contentType: 'image/jpeg', metadata: { ownerUid, variant: 'staging', origin: 'system_ingestion' } },
      }),
      prepareMedia: ({ ownerUid, data, commitPreparedAsset }) => prepareStagedMedia({
        // The dedicated ingestion media quota was consumed before staging the download.
        admin, ownerUid, data, mediaBucket, commitPreparedAsset, consumeBudget: async () => {},
      }),
      autocomplete: ({ query, coordinates }) => autocompletePlaces({
        provider: placesProvider, query, language: 'he', mode: 'places', coordinates,
        randomSelectionId: () => crypto.randomUUID(),
      }),
      fetchPlace: (placeId) => fetchBilingualPlace({ provider: placesProvider, placeId }),
    };
  },
};
