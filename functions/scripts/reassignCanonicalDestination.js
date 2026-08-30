/* eslint-disable no-await-in-loop, no-console */
const admin = require('firebase-admin');

const { audit } = require('../adminService');
const {
  REGISTRY_PATH,
  REGISTRY_VERSION,
  canonicalDestinationId,
  destinationTypeForKind,
  validateRegistryEntry,
} = require('../canonicalDestinationRegistry');
const { syncDestinationCatalog } = require('../destinationCatalogService');
const {
  impactHash,
  previewDestinationReassignment,
  processDestinationReassignmentJob,
  startDestinationReassignment,
} = require('../destinationReassignmentService');
const { DESTINATION_NAMING_POLICY_VERSION } = require('../destinationLocalizationService');
const { initializeAdmin } = require('./localCredentials');

const DEFAULT_PROJECT_ID = 'planli-f0b12';
const DEFAULT_PAGE_SIZE = 25;
const MAX_PROCESSING_STEPS = 100;

function valueFor(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? String(argv[index + 1] || '').trim() : '';
}

function cleanId(value, field) {
  const text = String(value || '').trim();
  if (!text || text.length > 180 || text.includes('/')) throw new Error(`${field} is invalid.`);
  return text;
}

function parseArguments(argv) {
  return {
    apply: argv.includes('--apply'),
    projectId: valueFor(argv, '--project') || DEFAULT_PROJECT_ID,
    countryId: valueFor(argv, '--country'),
    sourceCityId: valueFor(argv, '--source-city'),
    registryId: valueFor(argv, '--target-registry'),
    reason: valueFor(argv, '--reason'),
    requestedBy: valueFor(argv, '--requested-by'),
  };
}

function buildCanonicalDestination({ countryId, registryEntry, now = new Date() }) {
  const validation = validateRegistryEntry(registryEntry, { requireProviderIdentity: true });
  if (!validation.valid) {
    throw new Error(`Registry entry ${registryEntry?.id || ''} is invalid: ${validation.errors.join(', ')}`);
  }
  if (registryEntry.countryCode !== countryId.toUpperCase()) {
    throw new Error('Registry country does not match the requested country.');
  }
  const refreshAfter = new Date(now.getTime() + 24 * 24 * 60 * 60 * 1000);
  const expiresAt = new Date(now.getTime() + 28 * 24 * 60 * 60 * 1000);
  return {
    schemaVersion: 3,
    namingPolicyVersion: DESTINATION_NAMING_POLICY_VERSION,
    countryId,
    destinationType: destinationTypeForKind(registryEntry.kind),
    providerRefs: registryEntry.providerRefs,
    googleCache: {
      placeId: registryEntry.providerRefs.googlePlaceId,
      names: { he: registryEntry.names.he, en: registryEntry.names.en },
      nameSources: { he: 'admin', en: 'planli_registry' },
      countryCode: registryEntry.countryCode,
      coordinates: registryEntry.center || null,
      viewport: registryEntry.viewport || null,
      types: Array.isArray(registryEntry.googleTypes) ? registryEntry.googleTypes.slice(0, 20) : [],
      fetchedAt: now,
      refreshAfter,
      expiresAt,
      source: 'planli_registry',
    },
    canonicalPolicy: {
      approved: true,
      registryId: registryEntry.id,
      kind: registryEntry.kind,
      parentId: registryEntry.parentId || null,
      groupingPolicy: registryEntry.groupingPolicy,
      aliases: registryEntry.aliases || [],
      version: Number(registryEntry.registryVersion || REGISTRY_VERSION),
    },
    stats: { recommendationCount: 0 },
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
}

async function prospectivePreview({ db, source, target, targetCity, targetCountry }) {
  const [recommendations, routes, trips, favorites] = await Promise.all([
    db.collection('recommendations')
      .where('destination.countryId', '==', source.countryId)
      .where('destination.cityId', '==', source.cityId).get(),
    db.collection('routes').where('destinationKeys', 'array-contains', `${source.countryId}:${source.cityId}`).get(),
    db.collection('trips')
      .where('destination.countryId', '==', source.countryId)
      .where('destination.cityId', '==', source.cityId).get(),
    db.collectionGroup('favorites')
      .where('target.path', '==', `countries/${source.countryId}/destinations/${source.cityId}`).get(),
  ]);
  const counts = {
    recommendations: recommendations.docs.filter((document) => document.data()?.status !== 'deleting').length,
    routes: routes.docs.filter((document) => document.data()?.status !== 'deleting').length,
    trips: trips.docs.filter((document) => document.data()?.status !== 'deleting').length,
    favorites: favorites.size,
  };
  const targetSummary = {
    ...target,
    countryName: targetCountry?.names?.he || targetCountry?.name || target.countryId,
    cityName: targetCity.googleCache.names.he,
  };
  return {
    source,
    target: targetSummary,
    counts,
    totalTopLevelDocuments: Object.values(counts).reduce((total, count) => total + count, 0),
    impactHash: impactHash(source, target, counts),
  };
}

async function assertProductionAdmin(adminImpl, requestedBy) {
  const [user, registry] = await Promise.all([
    adminImpl.auth().getUser(requestedBy),
    adminImpl.firestore().doc(`system/moderation/admins/${requestedBy}`).get(),
  ]);
  if (user.customClaims?.admin !== true || registry.data()?.active !== true) {
    throw new Error('requestedBy is not an active PlanLi administrator.');
  }
  return user;
}

async function materializeTarget({ adminImpl, countryId, registryId, targetCityId, targetData }) {
  const db = adminImpl.firestore();
  const targetRef = db.doc(`countries/${countryId}/destinations/${targetCityId}`);
  let created = false;
  await db.runTransaction(async (transaction) => {
    const [countrySnapshot, registrySnapshot, targetSnapshot] = await Promise.all([
      transaction.get(db.doc(`countries/${countryId}`)),
      transaction.get(db.doc(`${REGISTRY_PATH}/${registryId}`)),
      transaction.get(targetRef),
    ]);
    if (!countrySnapshot.exists || countrySnapshot.data()?.status !== 'active') {
      throw new Error('Target country is missing or inactive.');
    }
    if (!registrySnapshot.exists || registrySnapshot.data()?.status !== 'active') {
      throw new Error('Target registry entry is missing or inactive.');
    }
    const liveEntry = { id: registrySnapshot.id, ...registrySnapshot.data() };
    const expectedData = buildCanonicalDestination({ countryId, registryEntry: liveEntry });
    if (JSON.stringify(expectedData.providerRefs) !== JSON.stringify(targetData.providerRefs) ||
        expectedData.canonicalPolicy.registryId !== targetData.canonicalPolicy.registryId) {
      throw new Error('Target registry entry changed after preview.');
    }
    if (targetSnapshot.exists) {
      if (targetSnapshot.data()?.canonicalPolicy?.registryId !== registryId) {
        throw new Error('Canonical target ID is occupied by another policy.');
      }
      return;
    }
    transaction.create(targetRef, {
      ...targetData,
      createdAt: adminImpl.firestore.FieldValue.serverTimestamp(),
      updatedAt: adminImpl.firestore.FieldValue.serverTimestamp(),
    });
    created = true;
  });
  if (created) {
    const createdSnapshot = await targetRef.get();
    await syncDestinationCatalog({ admin: adminImpl, countryId, cityId: targetCityId, city: createdSnapshot.data() });
  }
  return created;
}

async function processToCompletion({ adminImpl, jobId }) {
  const ref = adminImpl.firestore().doc(`system/runtime/destinationReassignmentJobs/${jobId}`);
  for (let step = 0; step < MAX_PROCESSING_STEPS; step += 1) {
    const snapshot = await ref.get();
    if (!snapshot.exists) throw new Error('Destination reassignment job disappeared.');
    const job = snapshot.data() || {};
    if (job.status === 'complete') return { stepCount: step, job };
    if (job.status === 'failed') throw new Error(`Destination reassignment failed at ${job.stage || 'unknown'}.`);
    await processDestinationReassignmentJob({ admin: adminImpl, jobId, pageSize: DEFAULT_PAGE_SIZE });
  }
  throw new Error(`Destination reassignment did not finish within ${MAX_PROCESSING_STEPS} steps.`);
}

async function run(options = {}) {
  const apply = options.apply === true;
  const projectId = options.projectId || DEFAULT_PROJECT_ID;
  if (projectId !== DEFAULT_PROJECT_ID) throw new Error(`Expected project ${DEFAULT_PROJECT_ID}.`);
  const countryId = cleanId(options.countryId, 'country');
  const sourceCityId = cleanId(options.sourceCityId, 'source-city');
  const registryId = cleanId(options.registryId, 'target-registry');
  const reason = String(options.reason || '').trim();
  const requestedBy = String(options.requestedBy || '').trim();
  if (apply && reason.length < 10) throw new Error('--apply requires a reason of at least 10 characters.');
  if (apply && !requestedBy) throw new Error('--apply requires --requested-by.');

  const adminImpl = options.adminImpl || admin;
  if (options.initialize !== false) initializeAdmin(adminImpl, { projectId });
  const db = adminImpl.firestore();
  const source = { countryId, cityId: sourceCityId };
  const registrySnapshot = await db.doc(`${REGISTRY_PATH}/${registryId}`).get();
  if (!registrySnapshot.exists) throw new Error(`Registry entry ${registryId} was not found.`);
  const registryEntry = { id: registrySnapshot.id, ...registrySnapshot.data() };
  const targetCityId = canonicalDestinationId(countryId, registryId);
  const target = { countryId, cityId: targetCityId };
  if (sourceCityId === targetCityId) throw new Error('Source already is the canonical destination.');
  const [countrySnapshot, sourceSnapshot, targetSnapshot] = await Promise.all([
    db.doc(`countries/${countryId}`).get(),
    db.doc(`countries/${countryId}/destinations/${sourceCityId}`).get(),
    db.doc(`countries/${countryId}/destinations/${targetCityId}`).get(),
  ]);
  if (!countrySnapshot.exists || !sourceSnapshot.exists) throw new Error('Source country or destination was not found.');
  if (sourceSnapshot.data()?.status !== 'active') throw new Error('Source destination is not active.');
  const targetData = buildCanonicalDestination({ countryId, registryEntry });
  if (targetSnapshot.exists && targetSnapshot.data()?.canonicalPolicy?.registryId !== registryId) {
    throw new Error('Canonical target ID is occupied by another policy.');
  }
  const preview = targetSnapshot.exists
    ? await previewDestinationReassignment({ db, source, target })
    : await prospectivePreview({
      db, source, target, targetCity: targetData, targetCountry: countrySnapshot.data() || {},
    });
  const result = {
    mode: apply ? 'apply' : 'dry-run',
    source: { ...source, cityName: sourceSnapshot.data()?.googleCache?.names?.he || sourceCityId },
    registryId,
    target: preview.target,
    targetExists: targetSnapshot.exists,
    wouldMaterializeTarget: !targetSnapshot.exists,
    preview,
  };
  if (!apply) {
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  const adminUser = await assertProductionAdmin(adminImpl, requestedBy);
  result.targetCreated = await materializeTarget({ adminImpl, countryId, registryId, targetCityId, targetData });
  const livePreview = await previewDestinationReassignment({ db, source, target });
  const started = await startDestinationReassignment({
    admin: adminImpl,
    source,
    target,
    expectedImpactHash: livePreview.impactHash,
    reason,
    requestedBy,
  });
  await audit({
    admin: adminImpl,
    auth: { uid: requestedBy, token: { name: adminUser.displayName || '' } },
    action: 'destination_reassignment_started',
    target: { source, target },
    reason,
    metadata: { jobId: started.jobId, counts: livePreview.counts, registryId },
  });
  const completed = await processToCompletion({ adminImpl, jobId: started.jobId });
  await audit({
    admin: adminImpl,
    auth: { uid: requestedBy, token: { name: adminUser.displayName || '' } },
    action: 'destination_reassignment_completed',
    target: { source, target },
    reason,
    metadata: { jobId: started.jobId, updatedCounts: completed.job.updatedCounts, registryId },
  });
  result.jobId = started.jobId;
  result.status = completed.job.status;
  result.updatedCounts = completed.job.updatedCounts;
  result.processingSteps = completed.stepCount;
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (require.main === module) {
  run(parseArguments(process.argv.slice(2))).catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_PROJECT_ID,
  buildCanonicalDestination,
  destinationTypeForKind,
  parseArguments,
  prospectivePreview,
  run,
};
