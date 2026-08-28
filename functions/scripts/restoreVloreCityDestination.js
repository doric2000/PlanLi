/* eslint-disable no-await-in-loop, no-console */
const admin = require('firebase-admin');

const {
  BUILTIN_POLICIES,
  REGISTRY_PATH,
  REGISTRY_VERSION,
  buildMatchProfile,
  canonicalDestinationId,
  validateRegistryEntry,
} = require('../canonicalDestinationRegistry');
const { CANDIDATES, REGIONAL_COUNTS } = require('../data/canonicalDestinationCandidates');
const { syncDestinationCatalog } = require('../destinationCatalogService');
const { recommendationPatch, routePatch } = require('../destinationReassignmentService');
const { destinationClaimId } = require('../destinationV3Service');
const { mergePolicy } = require('./seedCanonicalDestinationRegistry');
const { initializeAdmin } = require('./localCredentials');

const DEFAULT_PROJECT_ID = 'planli-f0b12';
const LEGACY_SOURCE = Object.freeze({ countryId: 'AL', cityId: 'dst_kfPRVC0prOtZdzibI1y5' });
const WRONG_TARGET = Object.freeze({ countryId: 'AL', cityId: 'dst_F8tbKtdlzr6KIMMVs2ZT' });
const REGISTRY_ID = 'al-vlore';
const CANONICAL_TARGET = Object.freeze({
  countryId: 'AL',
  cityId: canonicalDestinationId('AL', REGISTRY_ID),
  countryName: 'אלבניה',
  cityName: 'ולורה',
});
const JOB_ID = 'dra_YdpWKOLkobQkM_TiZgIxvLsvH3oj';
const RECOMMENDATION_ID = 'rec_GiMpMfW5sxBdz0RZ5u7o';
const RECOMMENDATION_PLACE_ID = 'ChIJ586pMBsyRRMRVQBWpFYw2vg';
const ROUTE_ID = 'route_kkHJt7mARPv_m5XwOhp-';
const EXPECTED_STOP_PLACE_IDS = Object.freeze([
  'ChIJlRjM6PEzRRMRhg4-8ZoJMQ0',
  'ChIJYY6geGMxRRMRbqKO3jkPW_A',
  'ChIJ586pMBsyRRMRVQBWpFYw2vg',
  'ChIJA43QA3MzRRMRhjjb21hWAKM',
]);
const AUDIT_ID = 'location_repair_vlore_city_20260828_v1';
const CLAIM_AUDIT_ID = 'location_repair_vlore_claim_20260828_v1';

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? String(argv[index + 1] || '').trim() : '';
}

function parseArguments(argv) {
  return {
    apply: argv.includes('--apply'),
    projectId: valueAfter(argv, '--project') || DEFAULT_PROJECT_ID,
    confirmProject: valueAfter(argv, '--confirm-project'),
    requestedBy: valueAfter(argv, '--requested-by'),
  };
}

function sameDestination(value, expected) {
  return value?.countryId === expected.countryId && value?.cityId === expected.cityId;
}

function canonicalClaimEntries(value) {
  const entries = value?.entries || {};
  const keys = Object.keys(entries);
  return keys.length === 1 && keys[0] === CANONICAL_TARGET.cityId &&
    entries[CANONICAL_TARGET.cityId]?.providerPlaceId === 'ChIJlRjM6PEzRRMRhg4-8ZoJMQ0';
}

function repairableClaimEntries(value) {
  const entries = value?.entries || {};
  const keys = Object.keys(entries).sort();
  return JSON.stringify(keys) === JSON.stringify([
    CANONICAL_TARGET.cityId,
    LEGACY_SOURCE.cityId,
  ].sort()) && keys.every((key) =>
    entries[key]?.providerPlaceId === 'ChIJlRjM6PEzRRMRhg4-8ZoJMQ0');
}

function vloreRegistryEntry() {
  const candidate = CANDIDATES.find((entry) => entry.id === REGISTRY_ID);
  const reviewed = BUILTIN_POLICIES.find((entry) => entry.id === REGISTRY_ID);
  if (!candidate || !reviewed) throw new Error('Vlore canonical policy is missing from source.');
  const merged = mergePolicy(candidate);
  const entry = {
    ...merged,
    providerRefs: reviewed.providerRefs,
    providerDisplayName: 'Vlorë',
    providerAddress: 'Vlorë, Albania',
    googleTypes: reviewed.googleTypes,
    providerIdentity: {
      compatible: true,
      reviewedOverride: true,
      source: 'reviewed_provider_identity',
    },
    registryVersion: REGISTRY_VERSION,
    status: 'active',
  };
  entry.matchProfile = buildMatchProfile(entry);
  const validation = validateRegistryEntry(entry, { requireProviderIdentity: true });
  if (!validation.valid) throw new Error(`Vlore registry entry is invalid: ${validation.errors.join(', ')}`);
  return entry;
}

function registryWriteData(entry) {
  const { id, providerQuery, researchRegion, ...data } = entry;
  return data;
}

function canonicalDestinationData({ source, wrongTarget, registryEntry }) {
  const googleCache = source.googleCache || {};
  return {
    schemaVersion: 3,
    namingPolicyVersion: Math.max(2, Number(source.namingPolicyVersion || 0)),
    countryId: CANONICAL_TARGET.countryId,
    destinationType: 'city',
    providerRefs: registryEntry.providerRefs,
    googleCache: {
      ...googleCache,
      placeId: registryEntry.providerRefs.googlePlaceId,
      names: { he: CANONICAL_TARGET.cityName, en: 'Vlorë' },
      nameSources: { he: 'admin', en: 'planli_registry' },
      countryCode: 'AL',
      coordinates: registryEntry.center,
      viewport: registryEntry.viewport,
      types: registryEntry.googleTypes,
      source: 'planli_registry',
    },
    canonicalPolicy: {
      approved: true,
      registryId: REGISTRY_ID,
      kind: 'city_hub',
      parentId: null,
      groupingPolicy: 'self',
      aliases: registryEntry.aliases,
      registryVersion: REGISTRY_VERSION,
    },
    discoveryRegionId: 'europe',
    ...(source.travelFacts ? { travelFacts: source.travelFacts } : {}),
    ...(wrongTarget.destinationImage ? { destinationImage: wrongTarget.destinationImage } : {}),
    stats: { recommendationCount: 1 },
    status: 'active',
  };
}

function classifyState({ source, wrongTarget, canonical, job, recommendation, route, registry, claim }) {
  const corrected = canonical?.status === 'active' &&
    canonical?.canonicalPolicy?.registryId === REGISTRY_ID &&
    sameDestination(recommendation?.destination, CANONICAL_TARGET) &&
    (route?.destinationKeys || []).includes(`AL:${CANONICAL_TARGET.cityId}`) &&
    !wrongTarget && job?.status === 'rolled_back' && registry?.status === 'active';
  if (corrected) {
    if (claim && canonicalClaimEntries(claim)) return 'current';
    if (claim && repairableClaimEntries(claim)) return 'claim_cleanup';
    throw new Error('Vlore identity claim changed unexpectedly; refusing repair.');
  }
  const repairable = source?.status === 'inactive' &&
    sameDestination(source?.mergedInto, WRONG_TARGET) &&
    source?.googleCache?.names?.he === CANONICAL_TARGET.cityName &&
    source?.providerRefs?.googlePlaceId === 'ChIJlRjM6PEzRRMRhg4-8ZoJMQ0' &&
    wrongTarget?.status === 'active' &&
    wrongTarget?.canonicalPolicy?.registryId === 'al-albanian-riviera' &&
    job?.status === 'complete' &&
    sameDestination(job?.source, LEGACY_SOURCE) &&
    sameDestination(job?.target, WRONG_TARGET) &&
    recommendation?.status === 'active' &&
    recommendation?.place?.placeId === RECOMMENDATION_PLACE_ID &&
    sameDestination(recommendation?.destination, WRONG_TARGET) &&
    route?.status === 'active' &&
    (route?.destinationKeys || []).includes(`AL:${WRONG_TARGET.cityId}`) &&
    !canonical;
  if (repairable) return 'repair';
  throw new Error('Vlore production state changed unexpectedly; refusing repair.');
}

async function assertProductionAdmin(adminImpl, requestedBy) {
  if (!requestedBy) throw new Error('--requested-by is required with --apply.');
  const [user, registry] = await Promise.all([
    adminImpl.auth().getUser(requestedBy),
    adminImpl.firestore().doc(`system/moderation/admins/${requestedBy}`).get(),
  ]);
  if (user.customClaims?.admin !== true || registry.data()?.active !== true) {
    throw new Error('requestedBy is not an active PlanLi administrator.');
  }
  return user;
}

async function loadActiveStopDocuments(routeDocument) {
  const documents = [];
  const revisions = await routeDocument.ref.collection('revisions')
    .where('state', 'in', ['active', 'prepared']).get();
  for (const revision of revisions.docs) {
    const days = await revision.ref.collection('days').get();
    for (const day of days.docs) {
      const stops = await day.ref.collection('stops').get();
      documents.push(...stops.docs.filter((stop) =>
        sameDestination(stop.data()?.destination, WRONG_TARGET)));
    }
  }
  return documents;
}

async function loadState(db) {
  const refs = {
    source: db.doc(`countries/AL/destinations/${LEGACY_SOURCE.cityId}`),
    wrongTarget: db.doc(`countries/AL/destinations/${WRONG_TARGET.cityId}`),
    canonical: db.doc(`countries/AL/destinations/${CANONICAL_TARGET.cityId}`),
    job: db.doc(`system/runtime/destinationReassignmentJobs/${JOB_ID}`),
    recommendation: db.doc(`recommendations/${RECOMMENDATION_ID}`),
    route: db.doc(`routes/${ROUTE_ID}`),
    registry: db.doc(`${REGISTRY_PATH}/${REGISTRY_ID}`),
    registryMetadata: db.doc('system/destinationRegistry'),
    claim: db.doc(`system/runtime/destinationClaims/${destinationClaimId({
      countryId: 'AL', type: 'city', nameEn: 'Vlorë',
    })}`),
    wrongCatalog: db.doc(`destinationCatalog/AL_${WRONG_TARGET.cityId}`),
    canonicalCatalog: db.doc(`destinationCatalog/AL_${CANONICAL_TARGET.cityId}`),
  };
  const snapshots = await db.getAll(...Object.values(refs));
  const data = Object.fromEntries(Object.keys(refs).map((key, index) => [
    key, snapshots[index].exists ? snapshots[index].data() : null,
  ]));
  const routeDocument = snapshots[Object.keys(refs).indexOf('route')];
  const stopDocuments = routeDocument.exists ? await loadActiveStopDocuments(routeDocument) : [];
  const stopPlaceIds = stopDocuments.map((document) => document.data()?.place?.placeId).sort();
  const expectedPlaceIds = [...EXPECTED_STOP_PLACE_IDS].sort();
  const state = classifyState(data);
  if (state === 'repair' && JSON.stringify(stopPlaceIds) !== JSON.stringify(expectedPlaceIds)) {
    throw new Error('Vlore active route stops changed unexpectedly; refusing repair.');
  }
  return { refs, data, stopDocuments, state };
}

async function assertExclusiveWrongTargetReferences(db) {
  const [recommendations, routes, trips, favorites] = await Promise.all([
    db.collection('recommendations')
      .where('destination.countryId', '==', 'AL')
      .where('destination.cityId', '==', WRONG_TARGET.cityId).get(),
    db.collection('routes')
      .where('destinationKeys', 'array-contains', `AL:${WRONG_TARGET.cityId}`).get(),
    db.collection('trips')
      .where('destination.countryId', '==', 'AL')
      .where('destination.cityId', '==', WRONG_TARGET.cityId).get(),
    db.collectionGroup('favorites')
      .where('target.path', '==', `countries/AL/destinations/${WRONG_TARGET.cityId}`).get(),
  ]);
  const recommendationIds = recommendations.docs.map((document) => document.id);
  const routeIds = routes.docs.map((document) => document.id);
  if (JSON.stringify(recommendationIds) !== JSON.stringify([RECOMMENDATION_ID]) ||
      JSON.stringify(routeIds) !== JSON.stringify([ROUTE_ID]) ||
      !trips.empty || !favorites.empty) {
    throw new Error('Albanian Riviera gained unrelated references; refusing repair.');
  }
  return { recommendations: recommendations.size, routes: routes.size, trips: 0, favorites: 0 };
}

async function applyRepair({ adminImpl, db, actor, loaded, registryEntry }) {
  const auditRef = db.doc(`system/moderation/audit/${AUDIT_ID}`);
  const stopRefs = loaded.stopDocuments.map((document) => document.ref);
  await db.runTransaction(async (transaction) => {
    const orderedRefs = [
      loaded.refs.source, loaded.refs.wrongTarget, loaded.refs.canonical, loaded.refs.job,
      loaded.refs.recommendation, loaded.refs.route, loaded.refs.registry,
      loaded.refs.registryMetadata, loaded.refs.claim, loaded.refs.wrongCatalog, auditRef,
      ...stopRefs,
    ];
    const snapshots = await transaction.getAll(...orderedRefs);
    const transactionData = {
      source: snapshots[0].exists ? snapshots[0].data() : null,
      wrongTarget: snapshots[1].exists ? snapshots[1].data() : null,
      canonical: snapshots[2].exists ? snapshots[2].data() : null,
      job: snapshots[3].exists ? snapshots[3].data() : null,
      recommendation: snapshots[4].exists ? snapshots[4].data() : null,
      route: snapshots[5].exists ? snapshots[5].data() : null,
      registry: snapshots[6].exists ? snapshots[6].data() : null,
    };
    if (classifyState(transactionData) !== 'repair') {
      throw new Error('Vlore state changed after dry run; refusing repair.');
    }
    if (snapshots[10].exists) throw new Error('Vlore correction audit already exists.');
    const liveStopPlaceIds = snapshots.slice(11).map((snapshot) => snapshot.data()?.place?.placeId).sort();
    if (JSON.stringify(liveStopPlaceIds) !== JSON.stringify([...EXPECTED_STOP_PLACE_IDS].sort()) ||
        snapshots.slice(11).some((snapshot) => !sameDestination(snapshot.data()?.destination, WRONG_TARGET))) {
      throw new Error('Vlore route stops changed after dry run; refusing repair.');
    }

    const timestamp = adminImpl.firestore.FieldValue.serverTimestamp();
    const canonical = canonicalDestinationData({
      source: transactionData.source,
      wrongTarget: transactionData.wrongTarget,
      registryEntry,
    });
    transaction.create(loaded.refs.canonical, {
      ...canonical,
      createdAt: transactionData.source.createdAt || timestamp,
      updatedAt: timestamp,
    });
    transaction.set(loaded.refs.registry, {
      ...registryWriteData(registryEntry),
      updatedAt: timestamp,
    });
    transaction.set(loaded.refs.registryMetadata, {
      version: REGISTRY_VERSION,
      entryCount: CANDIDATES.length,
      regionalCounts: REGIONAL_COUNTS,
      updatedAt: timestamp,
    }, { merge: true });
    transaction.update(loaded.refs.recommendation, {
      ...recommendationPatch(transactionData.recommendation, CANONICAL_TARGET),
      updatedAt: timestamp,
    });
    transaction.update(loaded.refs.route, {
      ...routePatch(transactionData.route, WRONG_TARGET, CANONICAL_TARGET),
      updatedAt: timestamp,
    });
    stopRefs.forEach((ref) => transaction.update(ref, {
      destination: CANONICAL_TARGET,
      country: CANONICAL_TARGET.countryName,
    }));
    transaction.update(loaded.refs.claim, {
      entries: {
        [CANONICAL_TARGET.cityId]: { providerPlaceId: registryEntry.providerRefs.googlePlaceId },
      },
      updatedAt: timestamp,
    });
    transaction.update(loaded.refs.source, {
      mergedInto: { countryId: 'AL', cityId: CANONICAL_TARGET.cityId },
      reassignment: {
        ...transactionData.source.reassignment,
        state: 'corrected',
        target: CANONICAL_TARGET,
        correctionAuditId: AUDIT_ID,
        correctedAt: timestamp,
      },
      updatedAt: timestamp,
    });
    transaction.update(loaded.refs.job, {
      status: 'rolled_back',
      correctedTo: CANONICAL_TARGET,
      correctionAuditId: AUDIT_ID,
      rolledBackAt: timestamp,
      updatedAt: timestamp,
    });
    transaction.delete(loaded.refs.wrongTarget);
    transaction.delete(loaded.refs.wrongCatalog);
    transaction.create(auditRef, {
      actorUid: actor.uid,
      actorName: actor.displayName || '',
      action: 'destination_reassignment_corrected',
      target: { type: 'destination', countryId: 'AL', cityId: CANONICAL_TARGET.cityId },
      reason: 'שחזור ולורה כעיר קנונית לאחר שיוך שגוי לריביירה האלבנית',
      metadata: {
        rolledBackJobId: JOB_ID,
        legacySource: LEGACY_SOURCE,
        removedWrongTarget: WRONG_TARGET,
        recommendationId: RECOMMENDATION_ID,
        routeId: ROUTE_ID,
        stopCount: stopRefs.length,
      },
      createdAt: timestamp,
    });
  });
  const canonicalSnapshot = await loaded.refs.canonical.get();
  await syncDestinationCatalog({
    admin: adminImpl,
    countryId: 'AL',
    cityId: CANONICAL_TARGET.cityId,
    city: canonicalSnapshot.data(),
  });
}

async function applyClaimCleanup({ adminImpl, db, actor, loaded }) {
  const auditRef = db.doc(`system/moderation/audit/${CLAIM_AUDIT_ID}`);
  await db.runTransaction(async (transaction) => {
    const [claimSnapshot, auditSnapshot] = await transaction.getAll(loaded.refs.claim, auditRef);
    if (!claimSnapshot.exists || !repairableClaimEntries(claimSnapshot.data())) {
      throw new Error('Vlore identity claim changed before cleanup; refusing repair.');
    }
    if (auditSnapshot.exists) throw new Error('Vlore claim cleanup audit already exists.');
    const timestamp = adminImpl.firestore.FieldValue.serverTimestamp();
    transaction.update(loaded.refs.claim, {
      entries: {
        [CANONICAL_TARGET.cityId]: { providerPlaceId: 'ChIJlRjM6PEzRRMRhg4-8ZoJMQ0' },
      },
      updatedAt: timestamp,
    });
    transaction.create(auditRef, {
      actorUid: actor.uid,
      actorName: actor.displayName || '',
      action: 'destination_identity_claim_repaired',
      target: { type: 'destination', countryId: 'AL', cityId: CANONICAL_TARGET.cityId },
      reason: 'הסרת מזהה ולורה הישן מרשומת זהות הספק לאחר השחזור הקנוני',
      metadata: { providerPlaceId: 'ChIJlRjM6PEzRRMRhg4-8ZoJMQ0' },
      createdAt: timestamp,
    });
  });
}

async function syncCanonicalCatalog({ adminImpl, loaded }) {
  const canonicalSnapshot = await loaded.refs.canonical.get();
  if (!canonicalSnapshot.exists) throw new Error('Canonical Vlore destination is missing.');
  await syncDestinationCatalog({
    admin: adminImpl,
    countryId: 'AL',
    cityId: CANONICAL_TARGET.cityId,
    city: canonicalSnapshot.data(),
  });
}

async function run(options = {}) {
  const apply = options.apply === true;
  const projectId = options.projectId || DEFAULT_PROJECT_ID;
  if (projectId !== DEFAULT_PROJECT_ID) throw new Error(`Expected project ${DEFAULT_PROJECT_ID}.`);
  if (apply && options.confirmProject !== projectId) {
    throw new Error(`Production writes require --confirm-project ${projectId}.`);
  }
  const adminImpl = options.adminImpl || admin;
  if (options.initialize !== false) initializeAdmin(adminImpl, { projectId });
  const db = adminImpl.firestore();
  const registryEntry = vloreRegistryEntry();
  const loaded = await loadState(db);
  let references = { recommendations: 0, routes: 0, trips: 0, favorites: 0 };
  if (loaded.state === 'repair') references = await assertExclusiveWrongTargetReferences(db);
  const catalogNeedsSync = loaded.state !== 'repair' &&
    loaded.data.canonicalCatalog?.status !== 'active';
  const proposedWrites = loaded.state === 'repair' ? 16
    : loaded.state === 'claim_cleanup' ? 2 + Number(catalogNeedsSync)
      : Number(catalogNeedsSync);
  if (apply && proposedWrites) {
    const actor = await assertProductionAdmin(adminImpl, options.requestedBy);
    if (loaded.state === 'repair') {
      await applyRepair({ adminImpl, db, actor, loaded, registryEntry });
    } else {
      if (loaded.state === 'claim_cleanup') {
        await applyClaimCleanup({ adminImpl, db, actor, loaded });
      }
      if (catalogNeedsSync) await syncCanonicalCatalog({ adminImpl, loaded });
    }
  }
  const output = {
    mode: apply ? 'apply' : 'dry-run',
    projectId,
    state: loaded.state,
    proposedWrites,
    canonicalTarget: CANONICAL_TARGET,
    references,
    activeRouteStops: loaded.stopDocuments.length,
    auditId: apply && loaded.state === 'repair' ? AUDIT_ID
      : apply && loaded.state === 'claim_cleanup' ? CLAIM_AUDIT_ID : null,
  };
  console.log(JSON.stringify(output, null, 2));
  return output;
}

if (require.main === module) {
  run(parseArguments(process.argv.slice(2))).catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}

module.exports = {
  CANONICAL_TARGET,
  LEGACY_SOURCE,
  WRONG_TARGET,
  canonicalDestinationData,
  canonicalClaimEntries,
  repairableClaimEntries,
  classifyState,
  parseArguments,
  registryWriteData,
  vloreRegistryEntry,
};
