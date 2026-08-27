/* eslint-disable no-await-in-loop, no-console */
const admin = require('firebase-admin');
const { FieldPath } = require('firebase-admin/firestore');

const { audit } = require('../adminService');
const { reassignDestinationPersonalization } = require('../destinationReassignmentService');
const { initializeAdmin } = require('./localCredentials');

const DEFAULT_PROJECT_ID = 'planli-f0b12';
const PAGE_SIZE = 200;

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

function completedMappings(documents) {
  const direct = new Map();
  documents.forEach((document) => {
    const job = document.data() || {};
    if (job.status !== 'complete' || !job.source?.countryId || !job.source?.cityId ||
        !job.target?.countryId || !job.target?.cityId) return;
    direct.set(`${job.source.countryId}:${job.source.cityId}`, {
      source: { countryId: job.source.countryId, cityId: job.source.cityId },
      target: { countryId: job.target.countryId, cityId: job.target.cityId },
    });
  });
  return Array.from(direct.values()).map((mapping) => {
    let target = mapping.target;
    const visited = new Set();
    while (direct.has(`${target.countryId}:${target.cityId}`) &&
        !visited.has(`${target.countryId}:${target.cityId}`)) {
      visited.add(`${target.countryId}:${target.cityId}`);
      target = direct.get(`${target.countryId}:${target.cityId}`).target;
    }
    return { source: mapping.source, target };
  });
}

function repairedPersonalization(personalization, mappings, nowMs) {
  let next = personalization;
  let changed = false;
  mappings.forEach((mapping) => {
    const repaired = reassignDestinationPersonalization(next, mapping.source, mapping.target, nowMs);
    if (repaired) {
      next = repaired;
      changed = true;
    }
  });
  return changed ? next : null;
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
  const jobs = await db.collection('system/runtime/destinationReassignmentJobs').get();
  const mappings = completedMappings(jobs.docs);
  const nowMs = Number(options.nowMs || Date.now());
  const changes = [];
  let cursor = null;
  let scannedUsers = 0;
  while (true) {
    let query = db.collection('users').orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    if (page.empty) break;
    scannedUsers += page.size;
    page.docs.forEach((document) => {
      const personalization = repairedPersonalization(
        document.data()?.personalization, mappings, nowMs
      );
      if (personalization) changes.push({ ref: document.ref, personalization });
    });
    cursor = page.docs.at(-1).id;
    if (page.size < PAGE_SIZE) break;
  }

  let actor = null;
  if (apply) actor = await assertProductionAdmin(adminImpl, options.requestedBy);
  if (apply) {
    for (let offset = 0; offset < changes.length; offset += 350) {
      const batch = db.batch();
      changes.slice(offset, offset + 350).forEach((change) => {
        batch.update(change.ref, {
          personalization: change.personalization,
          updatedAt: adminImpl.firestore.FieldValue.serverTimestamp(),
        });
      });
      await batch.commit();
    }
    await audit({
      admin: adminImpl,
      auth: { uid: actor.uid, token: { name: actor.displayName || '' } },
      action: 'merged_destination_personalization_repaired',
      target: { type: 'system', id: 'destination-personalization' },
      reason: 'העברת זיקת משתמשים מיעדים שמוזגו ליעד הקנוני הפעיל',
      metadata: { mappings: mappings.length, scannedUsers, updatedUsers: changes.length },
    });
  }
  const result = {
    mode: apply ? 'apply' : 'dry-run',
    projectId,
    mappings: mappings.length,
    scannedUsers,
    updatedUsers: changes.length,
  };
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
  completedMappings,
  parseArguments,
  repairedPersonalization,
  run,
};
