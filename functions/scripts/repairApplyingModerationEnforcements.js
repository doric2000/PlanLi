/* eslint-disable no-await-in-loop, no-console */
const crypto = require('crypto');
const admin = require('firebase-admin');

const {
  applyingSuspensionDisposition,
  applyingSuspensionStillIntended,
  recoverApplyingSuspension,
} = require('../adminService');
const { initializeAdmin } = require('./localCredentials');

const PROJECT_ID = 'planli-f0b12';
const MEDIA_BUCKET = 'planli-f0b12-media-eu';
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;

function optionValue(argv, name) {
  const inline = argv.find((value) => value.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : '';
}

function parseOptions(argv = process.argv.slice(2)) {
  const requestedLimit = Number(optionValue(argv, '--limit') || DEFAULT_LIMIT);
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > MAX_LIMIT) {
    throw new Error(`--limit must be an integer between 1 and ${MAX_LIMIT}.`);
  }
  const after = String(optionValue(argv, '--after') || '').trim();
  if (after.includes('/') || after.length > 180) throw new Error('--after must be a Firestore document ID.');
  return {
    apply: argv.includes('--apply'),
    limit: requestedLimit,
    after,
    confirmProject: String(optionValue(argv, '--confirm-project') || '').trim(),
    fingerprint: String(optionValue(argv, '--fingerprint') || '').trim(),
  };
}

function timestampMillis(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (Number.isFinite(Number(value?._seconds))) return Number(value._seconds) * 1000;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function privateHash(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function repairPageFingerprint({ after, limit, records }) {
  const scope = {
    version: 1,
    projectId: PROJECT_ID,
    after: after || null,
    limit,
    records: records.map(({ entry, enforcement, userData, authUser, intended, disposition }) => ({
      enforcementId: entry.id,
      userHash: privateHash(enforcement.userUid),
      type: enforcement.type || null,
      status: enforcement.status || null,
      stage: enforcement.stage || null,
      updatedAtMs: timestampMillis(enforcement.updatedAt),
      endsAtMs: timestampMillis(enforcement.endsAt),
      moderationStatus: userData?.moderation?.status || null,
      currentEnforcementId: userData?.moderation?.enforcementId || null,
      authDisabled: authUser?.disabled === true,
      intended,
      action: disposition.action,
      reason: disposition.reason,
    })),
  };
  return crypto.createHash('sha256').update(JSON.stringify(scope)).digest('hex');
}

async function getAuthUser(auth, uid) {
  try {
    return await auth.getUser(uid);
  } catch (error) {
    if (error?.code === 'auth/user-not-found') return null;
    throw error;
  }
}

async function loadApplyingPage({ db, limit, after }) {
  let query = db.collection('system/moderation/enforcements')
    .where('status', '==', 'applying')
    .orderBy(admin.firestore.FieldPath.documentId())
    .limit(limit);
  if (after) query = query.startAfter(after);
  return query.get();
}

async function classifyApplyingPage({ db, auth, snapshot, now = Date.now() }) {
  const records = [];
  for (const entry of snapshot.docs) {
    const enforcement = entry.data() || {};
    const uid = typeof enforcement.userUid === 'string' ? enforcement.userUid.trim() : '';
    const userSnapshot = uid
      ? await db.doc(`users/${uid}`).get()
      : { exists: false, data: () => null };
    const authUser = uid ? await getAuthUser(auth, uid) : null;
    const userData = userSnapshot.exists ? userSnapshot.data() || {} : {};
    const intended = enforcement.type === 'suspension'
      ? await applyingSuspensionStillIntended({ admin: { firestore: () => db }, enforcement, enforcementId: entry.id })
      : null;
    records.push({
      entry,
      enforcement,
      userData,
      authUser,
      intended,
      disposition: applyingSuspensionDisposition({
        enforcementId: entry.id,
        enforcement,
        userExists: userSnapshot.exists,
        userData,
        authUser,
        intended,
        now,
      }),
    });
  }
  return records;
}

function summarize(records) {
  const counts = {
    resume: 0,
    expire: 0,
    expireBeforeActivation: 0,
    cancelBeforeActivation: 0,
    supersede: 0,
    ambiguous: 0,
    ignored: 0,
  };
  records.forEach(({ disposition }) => {
    if (disposition.action === 'resume') counts.resume += 1;
    else if (disposition.action === 'expire') counts.expire += 1;
    else if (disposition.action === 'expire_before_activation') counts.expireBeforeActivation += 1;
    else if (disposition.action === 'cancel_before_activation') counts.cancelBeforeActivation += 1;
    else if (disposition.action === 'supersede') counts.supersede += 1;
    else if (disposition.action === 'ambiguous') counts.ambiguous += 1;
    else counts.ignored += 1;
  });
  return {
    ...counts,
    safeRemaining: counts.resume + counts.expire + counts.expireBeforeActivation
      + counts.cancelBeforeActivation + counts.supersede,
    suspendedPastEnd: counts.expire,
  };
}

function assertRepairApplyAllowed({ options, fingerprint, counts }) {
  if (options.confirmProject !== PROJECT_ID) {
    throw new Error(`Apply refused. Pass --confirm-project=${PROJECT_ID}.`);
  }
  if (!options.fingerprint || options.fingerprint !== fingerprint) {
    throw new Error('Apply refused. The dry-run fingerprint is missing or no longer matches.');
  }
  if (counts.ambiguous > 0) {
    throw new Error('Apply refused before writes because historical state is ambiguous.');
  }
}

async function runRepair({ db, auth, mediaBucket, options, now = Date.now(), recoverImpl = recoverApplyingSuspension }) {
  const snapshot = await loadApplyingPage({ db, limit: options.limit, after: options.after });
  const records = await classifyApplyingPage({ db, auth, snapshot, now });
  const fingerprint = repairPageFingerprint({ after: options.after, limit: options.limit, records });
  const counts = summarize(records);
  const nextAfter = snapshot.size === options.limit && snapshot.docs.length
    ? snapshot.docs[snapshot.docs.length - 1].id
    : null;
  const report = {
    mode: options.apply ? 'apply' : 'dry-run',
    projectId: PROJECT_ID,
    scanned: snapshot.size,
    ...counts,
    nextAfter,
    fingerprint,
  };
  if (!options.apply) return report;
  assertRepairApplyAllowed({ options, fingerprint, counts });

  let applied = 0;
  for (const record of records) {
    if (!['resume', 'expire', 'expire_before_activation', 'cancel_before_activation', 'supersede'].includes(record.disposition.action)) continue;
    const result = await recoverImpl({
      admin,
      enforcementEntry: record.entry,
      mediaBucket,
      now,
    });
    if (result?.ambiguous) throw new Error('Repair stopped because state changed to ambiguous during apply.');
    applied += 1;
  }
  return { ...report, applied };
}

async function main() {
  const options = parseOptions();
  initializeAdmin(admin, { projectId: PROJECT_ID, storageBucket: MEDIA_BUCKET });
  if (admin.app().options.projectId !== PROJECT_ID) {
    throw new Error(`Active Firebase project must be ${PROJECT_ID}.`);
  }
  const result = await runRepair({
    db: admin.firestore(),
    auth: admin.auth(),
    mediaBucket: admin.storage().bucket(MEDIA_BUCKET),
    options,
  });
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}

module.exports = {
  assertRepairApplyAllowed,
  parseOptions,
  repairPageFingerprint,
  runRepair,
  summarize,
};
