const crypto = require('crypto');
const { FieldPath } = require('firebase-admin/firestore');
const { HttpsError } = require('firebase-functions/v2/https');

const { buildSearchIndex, destinationKey } = require('./discoverySearch');
const {
  DESTINATION_NAMING_POLICY_VERSION,
  hasHebrewName,
} = require('./destinationLocalizationService');

const DEFAULT_PAGE_SIZE = 25;
const MAX_BATCH_WRITES = 400;
const STAGES = Object.freeze(['recommendations', 'routes', 'trips', 'complete']);
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/;

function fail(code, message, reason = 'invalid_input') {
  throw new HttpsError(code, message, { reason });
}

function cleanId(value, field) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > 180 || text.includes('/')) {
    fail('invalid-argument', `${field} is invalid.`);
  }
  return text;
}

function cleanHebrewDestinationName(value) {
  const name = typeof value === 'string'
    ? value.normalize('NFC').trim().replace(/\s+/g, ' ')
    : '';
  if (name.length < 2 || name.length > 80 || CONTROL_CHARACTERS.test(name) || !hasHebrewName(name)) {
    fail('invalid-argument', 'Hebrew destination name is invalid.', 'invalid_hebrew_name');
  }
  return name;
}

function renameJobId(countryId, cityId, nameHe) {
  return `drn_${crypto.createHash('sha256')
    .update(`${countryId}\n${cityId}\n${nameHe}`)
    .digest('base64url').slice(0, 28)}`;
}

function renameJobRef(db, jobId) {
  return db.doc(`system/runtime/destinationRenameJobs/${jobId}`);
}

function destinationNamePatch(nameHe) {
  return {
    namingPolicyVersion: DESTINATION_NAMING_POLICY_VERSION,
    'googleCache.names.he': nameHe,
    'googleCache.nameSources.he': 'admin',
  };
}

function shouldQueueRename(existingJob, currentName, nameHe) {
  return existingJob?.status !== 'complete' || currentName !== nameHe;
}

function recommendationRenamePatch(data, nameHe) {
  const destination = { ...(data.destination || {}), cityName: nameHe };
  return {
    destination,
    search: buildSearchIndex({
      title: data.title,
      description: data.description,
      destination,
      place: data.place,
      categoryIds: [data.categoryId].filter(Boolean),
      subcategoryIds: data.tags,
      interestIds: data.facets?.interests,
    }),
  };
}

function routeRenamePatch(data, countryId, cityId, nameHe) {
  const destinations = (Array.isArray(data.destinations) ? data.destinations : []).map((destination) =>
    destination?.countryId === countryId && destination?.cityId === cityId
      ? { ...destination, cityName: nameHe }
      : destination
  );
  return {
    destinations,
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

function tripRenamePatch(data, nameHe) {
  return { destination: { ...(data.destination || {}), cityName: nameHe } };
}

async function commitUpdates(db, updates) {
  for (let offset = 0; offset < updates.length; offset += MAX_BATCH_WRITES) {
    const batch = db.batch();
    updates.slice(offset, offset + MAX_BATCH_WRITES)
      .forEach(({ ref, patch }) => batch.update(ref, patch));
    await batch.commit();
  }
}

async function pagedQuery(query, cursor, pageSize) {
  let page = query.orderBy(FieldPath.documentId()).limit(pageSize);
  if (cursor) page = page.startAfter(cursor);
  const snapshot = await page.get();
  return {
    documents: snapshot.docs,
    cursor: snapshot.docs.at(-1)?.id || null,
    complete: snapshot.size < pageSize,
  };
}

async function processRecommendationPage({ db, job, pageSize, timestamp }) {
  const page = await pagedQuery(
    db.collection('recommendations')
      .where('destination.countryId', '==', job.countryId)
      .where('destination.cityId', '==', job.cityId),
    job.cursor,
    pageSize
  );
  const updates = page.documents
    .filter((document) => document.data()?.status !== 'deleting')
    .map((document) => ({
      ref: document.ref,
      patch: { ...recommendationRenamePatch(document.data() || {}, job.nameHe), updatedAt: timestamp },
    }));
  await commitUpdates(db, updates);
  return { ...page, updated: updates.length };
}

async function routeStopUpdates(routeDocument, countryId, cityId, nameHe) {
  const updates = [];
  const revisions = await routeDocument.ref.collection('revisions')
    .where('state', 'in', ['active', 'prepared']).get();
  for (const revision of revisions.docs) {
    const days = await revision.ref.collection('days').get();
    for (const day of days.docs) {
      const stops = await day.ref.collection('stops').get();
      stops.docs.forEach((stop) => {
        const data = stop.data() || {};
        if (data.destination?.countryId === countryId && data.destination?.cityId === cityId) {
          updates.push({
            ref: stop.ref,
            patch: { destination: { ...data.destination, cityName: nameHe } },
          });
        }
      });
    }
  }
  return updates;
}

async function processRoutePage({ db, job, pageSize, timestamp }) {
  const page = await pagedQuery(
    db.collection('routes').where('destinationKeys', 'array-contains', destinationKey(job.countryId, job.cityId)),
    job.cursor,
    Math.min(pageSize, 5)
  );
  const updates = [];
  for (const document of page.documents) {
    const data = document.data() || {};
    if (data.status === 'deleting') continue;
    updates.push({
      ref: document.ref,
      patch: { ...routeRenamePatch(data, job.countryId, job.cityId, job.nameHe), updatedAt: timestamp },
    });
    updates.push(...await routeStopUpdates(document, job.countryId, job.cityId, job.nameHe));
  }
  await commitUpdates(db, updates);
  return { ...page, updated: updates.length };
}

async function processTripPage({ db, job, pageSize, timestamp }) {
  const page = await pagedQuery(
    db.collection('trips')
      .where('destination.countryId', '==', job.countryId)
      .where('destination.cityId', '==', job.cityId),
    job.cursor,
    pageSize
  );
  const updates = page.documents
    .filter((document) => document.data()?.status !== 'deleting')
    .map((document) => ({
      ref: document.ref,
      patch: { ...tripRenamePatch(document.data() || {}, job.nameHe), updatedAt: timestamp },
    }));
  await commitUpdates(db, updates);
  return { ...page, updated: updates.length };
}

async function startDestinationRename({ admin, countryId, cityId, nameHe, reason, requestedBy }) {
  const cleanCountryId = cleanId(countryId, 'countryId');
  const cleanCityId = cleanId(cityId, 'cityId');
  const cleanName = cleanHebrewDestinationName(nameHe);
  const db = admin.firestore();
  const cityRef = db.doc(`countries/${cleanCountryId}/destinations/${cleanCityId}`);
  const jobId = renameJobId(cleanCountryId, cleanCityId, cleanName);
  const jobRef = renameJobRef(db, jobId);
  let result;
  await db.runTransaction(async (transaction) => {
    const [citySnapshot, jobSnapshot] = await Promise.all([
      transaction.get(cityRef),
      transaction.get(jobRef),
    ]);
    if (!citySnapshot.exists) fail('not-found', 'Destination was not found.', 'destination_missing');
    const existingJob = jobSnapshot.exists ? jobSnapshot.data() || {} : {};
    const currentName = citySnapshot.data()?.googleCache?.names?.he;
    const shouldQueue = shouldQueueRename(existingJob, currentName, cleanName);
    transaction.update(cityRef, {
      ...destinationNamePatch(cleanName),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    if (shouldQueue) {
      const restartCompletedJob = existingJob.status === 'complete';
      transaction.set(jobRef, {
        countryId: cleanCountryId,
        cityId: cleanCityId,
        nameHe: cleanName,
        reason,
        requestedBy,
        status: 'queued',
        stage: !restartCompletedJob && STAGES.includes(existingJob.stage) && existingJob.stage !== 'complete'
          ? existingJob.stage
          : 'recommendations',
        cursor: restartCompletedJob ? null : existingJob.cursor || null,
        generation: Number(existingJob.generation || 0) + 1,
        updatedCounts: restartCompletedJob
          ? { recommendations: 0, routesAndStops: 0, trips: 0 }
          : existingJob.updatedCounts || { recommendations: 0, routesAndStops: 0, trips: 0 },
        errors: [],
        ...(jobSnapshot.exists ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    result = {
      jobId,
      status: shouldQueue ? 'queued' : 'complete',
      progress: shouldQueue && existingJob.status === 'complete'
        ? { recommendations: 0, routesAndStops: 0, trips: 0 }
        : existingJob.updatedCounts || { recommendations: 0, routesAndStops: 0, trips: 0 },
    };
  });
  return result;
}

async function advanceJob(db, jobRef, job, result, timestamp) {
  const currentStageIndex = STAGES.indexOf(job.stage);
  const nextStage = result.complete ? STAGES[currentStageIndex + 1] : job.stage;
  const countKey = job.stage === 'recommendations'
    ? 'recommendations'
    : job.stage === 'routes' ? 'routesAndStops' : 'trips';
  const patch = {
    status: nextStage === 'complete' ? 'complete' : 'queued',
    stage: nextStage,
    cursor: result.complete ? null : result.cursor,
    generation: Number(job.generation || 0) + 1,
    [`updatedCounts.${countKey}`]: Number(job.updatedCounts?.[countKey] || 0) + result.updated,
    updatedAt: timestamp,
    ...(nextStage === 'complete' ? { completedAt: timestamp } : {}),
  };
  let advanced = false;
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(jobRef);
    const current = snapshot.data() || {};
    if (!snapshot.exists || current.status !== 'queued' ||
        Number(current.generation || 0) !== Number(job.generation || 0)) return;
    transaction.update(jobRef, patch);
    advanced = true;
  });
  return { advanced, status: patch.status, stage: patch.stage };
}

async function processDestinationRenameJob({ admin, jobId, pageSize = DEFAULT_PAGE_SIZE }) {
  const db = admin.firestore();
  const jobRef = renameJobRef(db, cleanId(jobId, 'jobId'));
  const snapshot = await jobRef.get();
  if (!snapshot.exists) return { state: 'missing' };
  const job = snapshot.data() || {};
  if (job.status !== 'queued' || !['recommendations', 'routes', 'trips'].includes(job.stage)) {
    return { state: 'ignored', status: job.status };
  }
  const citySnapshot = await db.doc(`countries/${job.countryId}/destinations/${job.cityId}`).get();
  if (!citySnapshot.exists || citySnapshot.data()?.googleCache?.names?.he !== job.nameHe ||
      citySnapshot.data()?.googleCache?.nameSources?.he !== 'admin') {
    await jobRef.update({
      status: 'superseded',
      errors: [{ code: 'canonical_name_changed' }],
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { state: 'superseded' };
  }
  const timestamp = admin.firestore.FieldValue.serverTimestamp();
  try {
    const options = { db, job, pageSize, timestamp };
    const result = job.stage === 'recommendations'
      ? await processRecommendationPage(options)
      : job.stage === 'routes'
        ? await processRoutePage(options)
        : await processTripPage(options);
    return { state: 'processed', ...await advanceJob(db, jobRef, job, result, timestamp) };
  } catch (error) {
    await db.runTransaction(async (transaction) => {
      const current = await transaction.get(jobRef);
      if (!current.exists || Number(current.data()?.generation || 0) !== Number(job.generation || 0)) return;
      transaction.update(jobRef, {
        status: 'failed',
        errors: [{ code: String(error?.code || 'rename_propagation_failed').slice(0, 80) }],
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    return { state: 'failed' };
  }
}

module.exports = {
  STAGES,
  cleanHebrewDestinationName,
  destinationNamePatch,
  getDestinationRenameJobRef: renameJobRef,
  processRecommendationPage,
  processDestinationRenameJob,
  processRoutePage,
  processTripPage,
  recommendationRenamePatch,
  renameJobId,
  routeRenamePatch,
  routeStopUpdates,
  shouldQueueRename,
  startDestinationRename,
  tripRenamePatch,
};
