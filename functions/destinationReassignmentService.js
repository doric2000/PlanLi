const crypto = require('crypto');
const { FieldPath } = require('firebase-admin/firestore');
const { HttpsError } = require('firebase-functions/v2/https');

const { buildSearchIndex, destinationKey } = require('./discoverySearch');
const { destinationHebrewName } = require('./destinationLocalizationService');
const { destinationAcceptsNewReferences } = require('./destinationReferencePolicy');
const { buildFavoritePreview, favoriteKeyForPath } = require('./socialService');

const PAGE_SIZE = 25;
const STAGES = Object.freeze(['recommendations', 'routes', 'trips', 'favorites', 'finalize', 'complete']);

function fail(code, message, reason = 'invalid_input') {
  throw new HttpsError(code, message, { reason });
}

function cleanId(value, field) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > 180 || text.includes('/')) fail('invalid-argument', `${field} is invalid.`);
  return text;
}

function refIds(value, prefix) {
  return {
    countryId: cleanId(value?.countryId, `${prefix}.countryId`),
    cityId: cleanId(value?.cityId, `${prefix}.cityId`),
  };
}

function reassignmentJobId(source, target) {
  const digest = crypto.createHash('sha256')
    .update(`${source.countryId}:${source.cityId}\n${target.countryId}:${target.cityId}`)
    .digest('base64url').slice(0, 28);
  return `dra_${digest}`;
}

function jobRef(db, jobId) {
  return db.doc(`system/runtime/destinationReassignmentJobs/${jobId}`);
}

function destinationRef(db, value) {
  return db.doc(`countries/${value.countryId}/destinations/${value.cityId}`);
}

function destinationPath(value) {
  return `countries/${value.countryId}/destinations/${value.cityId}`;
}

function targetSummary(target, country, city) {
  return {
    countryId: target.countryId,
    cityId: target.cityId,
    countryName: country?.names?.he || country?.name || target.countryId,
    cityName: destinationHebrewName(city) || target.cityId,
  };
}

function impactHash(source, target, counts) {
  return crypto.createHash('sha256')
    .update(JSON.stringify({ source, target, counts }))
    .digest('base64url').slice(0, 32);
}

function migratedRecommendationCount(job) {
  const frozenCount = Number(job?.preview?.counts?.recommendations);
  if (Number.isFinite(frozenCount) && frozenCount >= 0) return frozenCount;
  return Math.max(0, Number(job?.updatedCounts?.recommendations || 0));
}

async function loadDestinationPair(db, source, target) {
  const [sourceCountry, sourceCity, targetCountry, targetCity] = await Promise.all([
    db.doc(`countries/${source.countryId}`).get(),
    db.doc(`countries/${source.countryId}/destinations/${source.cityId}`).get(),
    db.doc(`countries/${target.countryId}`).get(),
    db.doc(`countries/${target.countryId}/destinations/${target.cityId}`).get(),
  ]);
  if (!sourceCountry.exists || !sourceCity.exists) fail('not-found', 'Source destination was not found.', 'source_missing');
  if (sourceCity.data()?.status !== 'active') fail('failed-precondition', 'Source destination is not active.', 'source_inactive');
  if (!targetCountry.exists || !targetCity.exists) fail('not-found', 'Target destination was not found.', 'target_missing');
  if (targetCountry.data()?.status !== 'active' || !destinationAcceptsNewReferences(targetCity.data())) {
    fail('failed-precondition', 'Target destination is not active.', 'target_inactive');
  }
  return {
    sourceCountry: sourceCountry.data() || {}, sourceCity: sourceCity.data() || {},
    targetCountry: targetCountry.data() || {}, targetCity: targetCity.data() || {},
  };
}

async function previewDestinationReassignment({ db, source, target }) {
  if (source.countryId === target.countryId && source.cityId === target.cityId) {
    fail('invalid-argument', 'Source and target destinations are identical.', 'same_destination');
  }
  const pair = await loadDestinationPair(db, source, target);
  const [recommendations, routes, trips, favorites] = await Promise.all([
    db.collection('recommendations')
      .where('destination.countryId', '==', source.countryId)
      .where('destination.cityId', '==', source.cityId).get(),
    db.collection('routes')
      .where('destinationKeys', 'array-contains', destinationKey(source.countryId, source.cityId)).get(),
    db.collection('trips')
      .where('destination.countryId', '==', source.countryId)
      .where('destination.cityId', '==', source.cityId).get(),
    db.collectionGroup('favorites')
      .where('target.path', '==', destinationPath(source)).get(),
  ]);
  const counts = {
    recommendations: recommendations.docs.filter((document) => document.data()?.status !== 'deleting').length,
    routes: routes.docs.filter((document) => document.data()?.status !== 'deleting').length,
    trips: trips.docs.filter((document) => document.data()?.status !== 'deleting').length,
    favorites: favorites.size,
  };
  return {
    source,
    target: targetSummary(target, pair.targetCountry, pair.targetCity),
    counts,
    totalTopLevelDocuments: counts.recommendations + counts.routes + counts.trips + counts.favorites,
    impactHash: impactHash(source, target, counts),
  };
}

function recommendationPatch(data, target) {
  const destination = { ...(data.destination || {}), ...target };
  return {
    destination,
    search: buildSearchIndex({
      title: data.title, description: data.description, destination, place: data.place,
      categoryIds: [data.categoryId].filter(Boolean), subcategoryIds: data.tags,
      interestIds: data.facets?.interests,
    }),
  };
}

function routePatch(data, source, target) {
  const oldKey = destinationKey(source.countryId, source.cityId);
  const newKey = destinationKey(target.countryId, target.cityId);
  const destinations = [];
  const seen = new Set();
  (data.destinations || []).forEach((entry) => {
    const next = entry?.countryId === source.countryId && entry?.cityId === source.cityId
      ? { ...entry, ...target }
      : entry;
    const key = destinationKey(next?.countryId, next?.cityId);
    if (!seen.has(key)) { seen.add(key); destinations.push(next); }
  });
  const destinationKeys = Array.from(new Set((data.destinationKeys || [])
    .map((key) => key === oldKey ? newKey : key)));
  return {
    destinations,
    destinationKeys,
    search: buildSearchIndex({
      title: data.title,
      description: `${data.description || ''} ${(data.summaryPlaces || []).join(' ')}`,
      destinations,
      categoryIds: data.categoryIds,
      subcategoryIds: data.subcategoryIds,
      interestIds: data.facets?.interests,
    }),
  };
}

async function pagedQuery(query, cursor, pageSize) {
  let page = query.orderBy(FieldPath.documentId()).limit(pageSize);
  if (cursor) page = page.startAfter(cursor);
  const snapshot = await page.get();
  return { documents: snapshot.docs, cursor: snapshot.docs.at(-1)?.id || null, complete: snapshot.size < pageSize };
}

async function commitUpdates(db, updates) {
  for (let offset = 0; offset < updates.length; offset += 400) {
    const batch = db.batch();
    updates.slice(offset, offset + 400).forEach(({ ref, patch }) => batch.update(ref, patch));
    await batch.commit();
  }
}

async function routeStopUpdates(routeDocument, source, target) {
  const updates = [];
  const revisions = await routeDocument.ref.collection('revisions').where('state', 'in', ['active', 'prepared']).get();
  for (const revision of revisions.docs) {
    const days = await revision.ref.collection('days').get();
    for (const day of days.docs) {
      const stops = await day.ref.collection('stops').get();
      stops.docs.forEach((stop) => {
        const data = stop.data() || {};
        if (data.destination?.countryId === source.countryId && data.destination?.cityId === source.cityId) {
          updates.push({
            ref: stop.ref,
            patch: {
              destination: { ...data.destination, ...target },
              ...(target.countryName ? { country: target.countryName } : {}),
            },
          });
        }
      });
    }
  }
  return updates;
}

function favoriteTarget(target) {
  return {
    type: 'city',
    id: target.cityId,
    countryId: target.countryId,
    path: destinationPath(target),
  };
}

async function migrateFavoritePage({ db, job, pageSize }) {
  const sourcePath = destinationPath(job.source);
  const target = favoriteTarget(job.target);
  const snapshot = await db.collectionGroup('favorites')
    .where('target.path', '==', sourcePath)
    .limit(pageSize)
    .get();
  if (snapshot.empty) return { documents: [], cursor: null, complete: true, updated: 0 };
  const targetCityRef = destinationRef(db, job.target);
  let updated = 0;
  await db.runTransaction(async (transaction) => {
    let migrated = 0;
    const targetCitySnapshot = await transaction.get(targetCityRef);
    if (!targetCitySnapshot.exists || !destinationAcceptsNewReferences(targetCitySnapshot.data())) {
      fail('failed-precondition', 'Target destination changed during reassignment.', 'target_inactive');
    }
    const pairs = snapshot.docs.map((document) => {
      const userId = document.ref.path.split('/')[1];
      const nextRef = db.doc(`users/${userId}/favorites/${favoriteKeyForPath(target.path)}`);
      return { sourceRef: document.ref, targetRef: nextRef };
    });
    const currentSnapshots = await Promise.all(pairs.flatMap(({ sourceRef, targetRef }) => [
      transaction.get(sourceRef),
      transaction.get(targetRef),
    ]));
    pairs.forEach(({ sourceRef, targetRef }, index) => {
      const currentSource = currentSnapshots[index * 2];
      const currentTarget = currentSnapshots[index * 2 + 1];
      if (!currentSource.exists) return;
      const sourceData = currentSource.data() || {};
      transaction.set(targetRef, {
        ownerId: sourceData.ownerId || sourceRef.path.split('/')[1],
        type: 'city',
        target,
        preview: buildFavoritePreview({ target, data: targetCitySnapshot.data(), publicProfile: null }),
        createdAt: (currentTarget.exists ? currentTarget.data()?.createdAt : sourceData.createdAt) ||
          targetCitySnapshot.data()?.createdAt || null,
        sourceUpdatedAt: targetCitySnapshot.data()?.updatedAt || targetCitySnapshot.data()?.createdAt || null,
      });
      transaction.delete(sourceRef);
      migrated += 1;
    });
    updated = migrated;
  });
  return {
    documents: snapshot.docs,
    cursor: null,
    complete: snapshot.size < pageSize,
    updated,
  };
}

async function processPage({ db, job, timestamp, pageSize }) {
  const source = job.source;
  const target = job.target;
  if (job.stage === 'recommendations') {
    const page = await pagedQuery(db.collection('recommendations')
      .where('destination.countryId', '==', source.countryId)
      .where('destination.cityId', '==', source.cityId), job.cursor, pageSize);
    const updates = page.documents
      .map((document) => ({ ref: document.ref, patch: { ...recommendationPatch(document.data() || {}, target), updatedAt: timestamp } }));
    await commitUpdates(db, updates);
    return { ...page, updated: updates.length };
  }
  if (job.stage === 'routes') {
    const page = await pagedQuery(db.collection('routes')
      .where('destinationKeys', 'array-contains', destinationKey(source.countryId, source.cityId)), job.cursor, Math.min(5, pageSize));
    const updates = [];
    for (const document of page.documents) {
      updates.push({ ref: document.ref, patch: { ...routePatch(document.data() || {}, source, target), updatedAt: timestamp } });
      updates.push(...await routeStopUpdates(document, source, target));
    }
    await commitUpdates(db, updates);
    return { ...page, updated: updates.length };
  }
  if (job.stage === 'trips') {
    const page = await pagedQuery(db.collection('trips')
      .where('destination.countryId', '==', source.countryId)
      .where('destination.cityId', '==', source.cityId), job.cursor, pageSize);
    const updates = page.documents
      .map((document) => ({ ref: document.ref, patch: { destination: { ...(document.data()?.destination || {}), ...target }, updatedAt: timestamp } }));
    await commitUpdates(db, updates);
    return { ...page, updated: updates.length };
  }
  return migrateFavoritePage({ db, job, pageSize });
}

async function startDestinationReassignment({ admin, source, target, expectedImpactHash, reason, requestedBy }) {
  const cleanSource = refIds(source, 'source');
  const cleanTarget = refIds(target, 'target');
  const db = admin.firestore();
  const initialPreview = await previewDestinationReassignment({ db, source: cleanSource, target: cleanTarget });
  if (!expectedImpactHash || expectedImpactHash !== initialPreview.impactHash) {
    fail('failed-precondition', 'Destination impact changed. Preview again.', 'stale_reassignment_preview');
  }
  const id = reassignmentJobId(cleanSource, cleanTarget);
  const ref = jobRef(db, id);
  const sourceRef = destinationRef(db, cleanSource);
  const targetRef = destinationRef(db, cleanTarget);
  const timestamp = admin.firestore.FieldValue.serverTimestamp();
  const prepared = await db.runTransaction(async (transaction) => {
    const [sourceSnapshot, targetSnapshot, jobSnapshot] = await Promise.all([
      transaction.get(sourceRef), transaction.get(targetRef), transaction.get(ref),
    ]);
    if (!sourceSnapshot.exists || sourceSnapshot.data()?.status !== 'active') {
      fail('failed-precondition', 'Source destination is not active.', 'source_inactive');
    }
    if (!targetSnapshot.exists || !destinationAcceptsNewReferences(targetSnapshot.data())) {
      fail('failed-precondition', 'Target destination is not active.', 'target_inactive');
    }
    const currentJob = jobSnapshot.exists ? jobSnapshot.data() || {} : null;
    const sourceLock = sourceSnapshot.data()?.reassignment;
    const targetLock = targetSnapshot.data()?.reassignment;
    if (sourceLock?.jobId && sourceLock.jobId !== id) {
      fail('failed-precondition', 'Source destination is already being reassigned.', 'source_reassignment_locked');
    }
    if (targetLock?.jobId && targetLock.jobId !== id) {
      fail('failed-precondition', 'Target destination is involved in another reassignment.', 'target_reassignment_locked');
    }
    if (currentJob && (sourceLock?.jobId !== id || targetLock?.jobId !== id)) {
      fail('failed-precondition', 'Destination reassignment locks are inconsistent.', 'reassignment_lock_inconsistent');
    }
    if (currentJob?.status === 'queued' || currentJob?.status === 'preparing') {
      return { mode: currentJob.status, preview: currentJob.preview || initialPreview };
    }
    if (currentJob?.status === 'failed') {
      transaction.update(ref, {
        status: 'queued',
        generation: Number(currentJob.generation || 0) + 1,
        errors: [],
        resumedAt: timestamp,
        updatedAt: timestamp,
      });
      return { mode: 'resumed', preview: currentJob.preview || initialPreview };
    }
    if (currentJob) {
      fail('failed-precondition', 'Destination reassignment job cannot be restarted.', 'reassignment_job_not_restartable');
    }
    transaction.update(sourceRef, {
      reassignment: {
        state: 'reassigning', role: 'source', jobId: id, target: initialPreview.target,
        requestedBy, startedAt: timestamp,
      },
      updatedAt: timestamp,
    });
    transaction.update(targetRef, {
      reassignment: {
        state: 'receiving', role: 'target', jobId: id, source: cleanSource,
        requestedBy, startedAt: timestamp,
      },
      updatedAt: timestamp,
    });
    transaction.create(ref, {
      source: cleanSource,
      target: initialPreview.target,
      reason,
      requestedBy,
      status: 'preparing',
      stage: 'recommendations',
      cursor: null,
      generation: 1,
      updatedCounts: { recommendations: 0, routesAndStops: 0, trips: 0, favorites: 0 },
      errors: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    return { mode: 'preparing', preview: initialPreview };
  });
  if (prepared.mode === 'queued' || prepared.mode === 'resumed') {
    return { jobId: id, status: 'queued', preview: prepared.preview };
  }

  const frozenPreview = await previewDestinationReassignment({
    db, source: cleanSource, target: cleanTarget,
  });
  if (frozenPreview.impactHash !== expectedImpactHash) {
    await db.runTransaction(async (transaction) => {
      const [sourceSnapshot, targetSnapshot, jobSnapshot] = await Promise.all([
        transaction.get(sourceRef), transaction.get(targetRef), transaction.get(ref),
      ]);
      if (!jobSnapshot.exists || jobSnapshot.data()?.status !== 'preparing') return;
      if (sourceSnapshot.data()?.reassignment?.jobId === id) {
        transaction.update(sourceRef, {
          reassignment: admin.firestore.FieldValue.delete(), updatedAt: timestamp,
        });
      }
      if (targetSnapshot.data()?.reassignment?.jobId === id) {
        transaction.update(targetRef, {
          reassignment: admin.firestore.FieldValue.delete(), updatedAt: timestamp,
        });
      }
      transaction.delete(ref);
    });
    fail('failed-precondition', 'Destination impact changed. Preview again.', 'stale_reassignment_preview');
  }
  await db.runTransaction(async (transaction) => {
    const [sourceSnapshot, targetSnapshot, jobSnapshot] = await Promise.all([
      transaction.get(sourceRef), transaction.get(targetRef), transaction.get(ref),
    ]);
    if (!jobSnapshot.exists || jobSnapshot.data()?.status !== 'preparing' ||
        sourceSnapshot.data()?.reassignment?.jobId !== id ||
        targetSnapshot.data()?.reassignment?.jobId !== id) {
      fail('failed-precondition', 'Destination reassignment preparation changed.', 'stale_reassignment_job');
    }
    transaction.update(ref, {
      preview: frozenPreview,
      target: frozenPreview.target,
      status: 'queued',
      updatedAt: timestamp,
    });
  });
  return { jobId: id, status: 'queued', preview: frozenPreview };
}

async function advance(db, ref, job, result, timestamp) {
  const index = STAGES.indexOf(job.stage);
  const next = result.complete ? STAGES[index + 1] : job.stage;
  const countKey = job.stage === 'recommendations'
    ? 'recommendations'
    : job.stage === 'routes'
      ? 'routesAndStops'
      : job.stage === 'trips' ? 'trips' : 'favorites';
  const patch = {
    status: 'queued', stage: next, cursor: result.complete ? null : result.cursor,
    generation: Number(job.generation || 0) + 1,
    [`updatedCounts.${countKey}`]: Number(job.updatedCounts?.[countKey] || 0) + result.updated,
    updatedAt: timestamp,
  };
  let advanced = false;
  await db.runTransaction(async (transaction) => {
    const current = await transaction.get(ref);
    if (!current.exists || current.data()?.status !== 'queued' ||
        Number(current.data()?.generation || 0) !== Number(job.generation || 0)) return;
    transaction.update(ref, patch);
    advanced = true;
  });
  return { state: advanced ? 'processed' : 'stale', status: 'queued', stage: next };
}

async function residualReferenceStage(db, source) {
  const [recommendations, routes, trips, favorites] = await Promise.all([
    db.collection('recommendations')
      .where('destination.countryId', '==', source.countryId)
      .where('destination.cityId', '==', source.cityId).limit(1).get(),
    db.collection('routes')
      .where('destinationKeys', 'array-contains', destinationKey(source.countryId, source.cityId)).limit(1).get(),
    db.collection('trips')
      .where('destination.countryId', '==', source.countryId)
      .where('destination.cityId', '==', source.cityId).limit(1).get(),
    db.collectionGroup('favorites')
      .where('target.path', '==', destinationPath(source)).limit(1).get(),
  ]);
  if (!recommendations.empty) return 'recommendations';
  if (!routes.empty) return 'routes';
  if (!trips.empty) return 'trips';
  if (!favorites.empty) return 'favorites';
  return null;
}

async function finalize({ admin, ref, job }) {
  const db = admin.firestore();
  const sourceRef = destinationRef(db, job.source);
  const targetRef = destinationRef(db, job.target);
  const residualStage = await residualReferenceStage(db, job.source);
  if (residualStage) {
    let requeued = false;
    await db.runTransaction(async (transaction) => {
      const jobSnapshot = await transaction.get(ref);
      if (!jobSnapshot.exists || jobSnapshot.data()?.status !== 'queued' ||
          jobSnapshot.data()?.stage !== 'finalize' ||
          Number(jobSnapshot.data()?.generation || 0) !== Number(job.generation || 0)) return;
      transaction.update(ref, {
        stage: residualStage,
        cursor: null,
        generation: Number(job.generation || 0) + 1,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      requeued = true;
    });
    return { state: requeued ? 'processed' : 'stale', status: 'queued', stage: residualStage };
  }
  await db.runTransaction(async (transaction) => {
    const [jobSnapshot, sourceSnapshot, targetSnapshot] = await Promise.all([
      transaction.get(ref), transaction.get(sourceRef), transaction.get(targetRef),
    ]);
    if (!jobSnapshot.exists || jobSnapshot.data()?.status === 'complete') return;
    if (jobSnapshot.data()?.status !== 'queued' || jobSnapshot.data()?.stage !== 'finalize') {
      fail('failed-precondition', 'Reassignment job changed before finalization.', 'stale_reassignment_job');
    }
    if (Number(jobSnapshot.data()?.generation || 0) !== Number(job.generation || 0)) {
      fail('failed-precondition', 'Reassignment generation changed before finalization.', 'stale_reassignment_job');
    }
    if (!sourceSnapshot.exists || !targetSnapshot.exists) fail('not-found', 'Destination changed during reassignment.', 'destination_missing');
    if (sourceSnapshot.data()?.status !== 'active' ||
        sourceSnapshot.data()?.reassignment?.state !== 'reassigning' ||
        !destinationAcceptsNewReferences(targetSnapshot.data()) ||
        targetSnapshot.data()?.reassignment?.state !== 'receiving') {
      fail('failed-precondition', 'Destination state changed during reassignment.', 'destination_state_changed');
    }
    if (sourceSnapshot.data()?.reassignment?.jobId !== ref.id ||
        targetSnapshot.data()?.reassignment?.jobId !== ref.id) {
      fail('failed-precondition', 'Destination reassignment lock changed.', 'reassignment_lock_inconsistent');
    }
    transaction.update(sourceRef, {
      status: 'inactive',
      mergedInto: { countryId: job.target.countryId, cityId: job.target.cityId },
      reassignment: {
        ...sourceSnapshot.data().reassignment,
        state: 'complete',
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      'stats.recommendationCount': 0,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    transaction.update(targetRef, {
      reassignment: admin.firestore.FieldValue.delete(),
      // Multiple idempotent workers may migrate different pages concurrently.
      // The frozen preview is the authoritative source contribution; progress
      // counters are diagnostic and can legitimately lose a race between pages.
      'stats.recommendationCount': Math.max(0,
        Number(targetSnapshot.data()?.stats?.recommendationCount || 0) +
        migratedRecommendationCount(jobSnapshot.data())),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    transaction.update(ref, {
      status: 'complete', stage: 'complete', completedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
  return { state: 'processed', status: 'complete', stage: 'complete' };
}

async function markFailed({ admin, ref, job, error }) {
  const db = admin.firestore();
  await db.runTransaction(async (transaction) => {
    const current = await transaction.get(ref);
    if (!current.exists || current.data()?.status !== 'queued' ||
        Number(current.data()?.generation || 0) !== Number(job.generation || 0)) return;
    transaction.update(ref, {
      status: 'failed',
      errors: [{ code: String(error?.code || 'destination_reassignment_failed').slice(0, 80) }],
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
}

async function processDestinationReassignmentJob({ admin, jobId, pageSize = PAGE_SIZE }) {
  const db = admin.firestore();
  const ref = jobRef(db, cleanId(jobId, 'jobId'));
  const snapshot = await ref.get();
  if (!snapshot.exists) return { state: 'missing' };
  const job = snapshot.data() || {};
  if (job.status !== 'queued') return { state: 'ignored', status: job.status };
  try {
    if (job.stage === 'finalize') return finalize({ admin, ref, job });
    if (!['recommendations', 'routes', 'trips', 'favorites'].includes(job.stage)) return { state: 'ignored', status: job.status };
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    const result = await processPage({ db, job, timestamp, pageSize });
    return advance(db, ref, job, result, timestamp);
  } catch (error) {
    await markFailed({ admin, ref, job, error });
    return { state: 'failed' };
  }
}

module.exports = {
  STAGES,
  impactHash,
  jobRef,
  migrateFavoritePage,
  migratedRecommendationCount,
  previewDestinationReassignment,
  processDestinationReassignmentJob,
  recommendationPatch,
  reassignmentJobId,
  residualReferenceStage,
  routePatch,
  startDestinationReassignment,
  targetSummary,
};
