/* eslint-disable no-console */
const admin = require('firebase-admin');

const { recommendationPatch } = require('../destinationReassignmentService');
const { initializeAdmin } = require('./localCredentials');

const DEFAULT_PROJECT_ID = 'planli-f0b12';
const SOURCE = Object.freeze({
  countryId: 'VN',
  cityId: 'dst_A0jOcAnQnrv043C_6an9',
  registryId: 'vn-da-nang',
});
const TARGET = Object.freeze({
  countryId: 'VN',
  cityId: 'dst_2TFjKLNl3aKzCxz52BkF',
  registryId: 'vn-hoi-an',
});
const REPAIRS = Object.freeze([
  Object.freeze({
    recommendationId: 'rec__jSW5rjzCQ2u-Q50XMxZ',
    placeId: 'ChIJrehzLjwPQjERian_LUN7b7Q',
  }),
  Object.freeze({
    recommendationId: 'rec_defTMiUIJFCskNckd9UN',
    placeId: 'ChIJ4Vn6dQANQjERKgBrQfyCbgE',
  }),
]);
const AUDIT_ID = 'location_repair_hoi_an_20260828_v1';

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

function assertDestination(document, expected, label) {
  if (!document.exists) throw new Error(`${label} destination is missing.`);
  const data = document.data() || {};
  if (data.status !== 'active') throw new Error(`${label} destination is not active.`);
  if (data.canonicalPolicy?.registryId !== expected.registryId) {
    throw new Error(`${label} destination canonical identity changed.`);
  }
  return data;
}

function classifyRecommendation(document, repair) {
  if (!document.exists) throw new Error(`Recommendation ${repair.recommendationId} is missing.`);
  const data = document.data() || {};
  if (data.status !== 'active') {
    throw new Error(`Recommendation ${repair.recommendationId} is not active.`);
  }
  if (data.place?.placeId !== repair.placeId) {
    throw new Error(`Recommendation ${repair.recommendationId} Place ID changed.`);
  }
  if (sameDestination(data.destination, TARGET)) return { state: 'current', data };
  if (sameDestination(data.destination, SOURCE)) return { state: 'repair', data };
  throw new Error(`Recommendation ${repair.recommendationId} destination changed unexpectedly.`);
}

function buildPlan({ sourceDocument, targetDocument, recommendationDocuments }) {
  const sourceData = assertDestination(sourceDocument, SOURCE, 'Source');
  const targetData = assertDestination(targetDocument, TARGET, 'Target');
  const items = REPAIRS.map((repair, index) => ({
    ...repair,
    ...classifyRecommendation(recommendationDocuments[index], repair),
  }));
  return {
    sourceData,
    targetData,
    items,
    changedRecommendationIds: items
      .filter((item) => item.state === 'repair')
      .map((item) => item.recommendationId),
  };
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

async function loadPlan(db) {
  const sourceRef = db.doc(`countries/${SOURCE.countryId}/destinations/${SOURCE.cityId}`);
  const targetRef = db.doc(`countries/${TARGET.countryId}/destinations/${TARGET.cityId}`);
  const recommendationRefs = REPAIRS.map((repair) =>
    db.doc(`recommendations/${repair.recommendationId}`));
  const [sourceDocument, targetDocument, ...recommendationDocuments] = await db.getAll(
    sourceRef, targetRef, ...recommendationRefs
  );
  return {
    sourceRef,
    targetRef,
    recommendationRefs,
    plan: buildPlan({ sourceDocument, targetDocument, recommendationDocuments }),
  };
}

async function applyPlan({ adminImpl, db, actor }) {
  const auditRef = db.doc(`system/moderation/audit/${AUDIT_ID}`);
  return db.runTransaction(async (transaction) => {
    const sourceRef = db.doc(`countries/${SOURCE.countryId}/destinations/${SOURCE.cityId}`);
    const targetRef = db.doc(`countries/${TARGET.countryId}/destinations/${TARGET.cityId}`);
    const recommendationRefs = REPAIRS.map((repair) =>
      db.doc(`recommendations/${repair.recommendationId}`));
    const [sourceDocument, targetDocument, auditDocument, ...recommendationDocuments] =
      await transaction.getAll(sourceRef, targetRef, auditRef, ...recommendationRefs);
    const plan = buildPlan({ sourceDocument, targetDocument, recommendationDocuments });
    const changedCount = plan.changedRecommendationIds.length;
    if (!changedCount) return { changedRecommendationIds: [], auditId: auditDocument.exists ? AUDIT_ID : null };
    if (auditDocument.exists) throw new Error('Repair audit exists while recommendations still need repair.');

    const countryName = plan.items.find((item) => item.data?.destination?.countryName)
      ?.data.destination.countryName || 'וייטנאם';
    const cityName = plan.targetData.googleCache?.names?.he || plan.targetData.identity?.names?.he;
    if (!cityName) throw new Error('Target destination has no approved Hebrew name.');
    const target = { ...TARGET, countryName, cityName };
    delete target.registryId;
    const timestamp = adminImpl.firestore.FieldValue.serverTimestamp();
    plan.items.forEach((item, index) => {
      if (item.state !== 'repair') return;
      transaction.update(recommendationRefs[index], {
        ...recommendationPatch(item.data, target),
        updatedAt: timestamp,
      });
    });
    transaction.update(sourceRef, {
      'stats.recommendationCount': Math.max(
        0, Number(plan.sourceData.stats?.recommendationCount || 0) - changedCount
      ),
      updatedAt: timestamp,
    });
    transaction.update(targetRef, {
      'stats.recommendationCount': Math.max(
        0, Number(plan.targetData.stats?.recommendationCount || 0) + changedCount
      ),
      updatedAt: timestamp,
    });
    transaction.create(auditRef, {
      actorUid: actor.uid,
      actorName: actor.displayName || '',
      action: 'recommendation_destination_repair',
      target: { type: 'destination', countryId: TARGET.countryId, cityId: TARGET.cityId },
      reason: 'תיקון שתי המלצות בהוי אן ששויכו בטעות לדה נאנג',
      metadata: {
        source: { countryId: SOURCE.countryId, cityId: SOURCE.cityId },
        target,
        recommendationIds: plan.changedRecommendationIds,
      },
      createdAt: timestamp,
    });
    return { changedRecommendationIds: plan.changedRecommendationIds, auditId: AUDIT_ID };
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
  const initial = await loadPlan(db);
  let result = {
    changedRecommendationIds: initial.plan.changedRecommendationIds,
    auditId: null,
  };
  if (apply) {
    const actor = await assertProductionAdmin(adminImpl, options.requestedBy);
    result = await applyPlan({ adminImpl, db, actor });
  }
  const output = {
    mode: apply ? 'apply' : 'dry-run',
    projectId,
    source: SOURCE,
    target: TARGET,
    expectedRecommendations: REPAIRS.length,
    proposedWrites: initial.plan.changedRecommendationIds.length
      ? initial.plan.changedRecommendationIds.length + 3
      : 0,
    changedRecommendationIds: result.changedRecommendationIds,
    auditId: result.auditId,
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
  AUDIT_ID,
  REPAIRS,
  SOURCE,
  TARGET,
  buildPlan,
  classifyRecommendation,
  parseArguments,
  run,
};
