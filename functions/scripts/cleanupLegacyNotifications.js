/* eslint-disable no-await-in-loop, no-console */
const crypto = require('node:crypto');
const admin = require('firebase-admin');
const { initializeAdmin } = require('./localCredentials');

const USER_PAGE_SIZE = 50;
const NOTIFICATION_PAGE_SIZE = 200;
const DELETE_BATCH_SIZE = 400;
const MAX_STABLE_USER_ATTEMPTS = 5;

function valueAfter(argv, flag) {
  const inline = argv.find((value) => value.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : null;
}

function parseCutoff(value) {
  const milliseconds = Date.parse(value || '');
  if (!Number.isFinite(milliseconds)) {
    throw new Error('A valid ISO cutoff is required: --cutoff=2026-08-21T12:00:00.000Z');
  }
  return { iso: new Date(milliseconds).toISOString(), milliseconds };
}

function parseArgs(argv) {
  const cutoff = parseCutoff(valueAfter(argv, '--cutoff'));
  const apply = argv.includes('--apply');
  const confirmation = valueAfter(argv, '--confirm-cutoff');
  if (apply && confirmation !== cutoff.iso) {
    throw new Error(`Apply mode requires --confirm-cutoff=${cutoff.iso}`);
  }
  const requestedJobId = valueAfter(argv, '--job-id');
  const resumeAfter = valueAfter(argv, '--resume-after') || null;
  if (apply && resumeAfter) {
    throw new Error('Apply mode resumes only from the cleanup job checkpoint; remove --resume-after.');
  }
  const defaultJobId = `cutoff_${crypto.createHash('sha256').update(cutoff.iso).digest('hex').slice(0, 16)}`;
  const jobId = requestedJobId || defaultJobId;
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(jobId)) throw new Error('job-id is invalid.');
  return {
    apply,
    cutoffIso: cutoff.iso,
    cutoffMs: cutoff.milliseconds,
    jobId,
    resumeAfter,
  };
}

function timestampMillis(value, fallback = null) {
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value?.seconds === 'number') {
    return (value.seconds * 1000) + Math.floor(Number(value.nanoseconds || 0) / 1000000);
  }
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : fallback;
}

function classifyNotificationForCutoff(record, cutoffMs) {
  const data = record?.data || {};
  const effectiveCreatedAt = timestampMillis(data.createdAt, timestampMillis(record?.createTime));
  if (!Number.isFinite(effectiveCreatedAt)) return { action: 'skip', reason: 'missing_timestamp' };
  if (effectiveCreatedAt <= cutoffMs) return { action: 'delete' };
  if (data.schemaVersion !== 2 || !['personal', 'admin'].includes(data.channel)) {
    return { action: 'keep', channel: null, unread: false, reason: 'post_cutoff_legacy' };
  }
  return {
    action: 'keep',
    channel: data.channel,
    unread: data.isRead !== true,
  };
}

function summarizeNotificationRecords(records, cutoffMs) {
  const summary = {
    scanned: 0,
    deleteCandidates: 0,
    skipped: 0,
    postCutoffLegacy: 0,
    personalUnread: 0,
    adminUnread: 0,
  };
  const deleteRefs = [];
  const deleteRecords = [];
  records.forEach((record) => {
    summary.scanned += 1;
    const result = classifyNotificationForCutoff(record, cutoffMs);
    if (result.action === 'delete') {
      summary.deleteCandidates += 1;
      deleteRefs.push(record.ref);
      deleteRecords.push({ ref: record.ref, updateTime: record.updateTime || null });
    } else if (result.action === 'skip') {
      summary.skipped += 1;
    } else if (result.reason === 'post_cutoff_legacy') {
      summary.postCutoffLegacy += 1;
    } else if (result.unread && result.channel === 'personal') {
      summary.personalUnread += 1;
    } else if (result.unread && result.channel === 'admin') {
      summary.adminUnread += 1;
    }
  });
  return { summary, deleteRefs, deleteRecords };
}

function mergeSummary(target, source) {
  Object.keys(target).forEach((key) => { target[key] += Number(source[key] || 0); });
}

function exactTimestampKey(value) {
  const seconds = value?.seconds ?? value?._seconds;
  const nanoseconds = value?.nanoseconds ?? value?._nanoseconds;
  if (Number.isInteger(seconds) && Number.isInteger(nanoseconds)) {
    return `${seconds}:${nanoseconds}`;
  }
  if (typeof value === 'string' && value.length > 0) return value;
  return null;
}

function captureStateVersion(snapshot) {
  if (!snapshot?.exists) return { exists: false, updateTime: null };
  const updateTime = exactTimestampKey(snapshot.updateTime);
  if (!updateTime) {
    throw new Error('notificationState snapshot is missing an exact update time.');
  }
  return { exists: true, updateTime };
}

function stateVersionMatches(snapshot, capturedVersion) {
  if (Boolean(snapshot?.exists) !== capturedVersion.exists) return false;
  if (!capturedVersion.exists) return true;
  return exactTimestampKey(snapshot.updateTime) === capturedVersion.updateTime;
}

async function deleteRecordsInBatches(firestore, records) {
  const deletedPaths = [];
  for (let offset = 0; offset < records.length; offset += DELETE_BATCH_SIZE) {
    const batch = firestore.batch();
    const page = records.slice(offset, offset + DELETE_BATCH_SIZE);
    page.forEach((record) => {
      if (!record.updateTime) {
        throw new Error(`Refusing to delete ${record.ref?.path || 'notification'} without an update-time precondition.`);
      }
      batch.delete(record.ref, { lastUpdateTime: record.updateTime });
    });
    try {
      await batch.commit();
    } catch (error) {
      error.notificationCleanupDeletedPaths = deletedPaths;
      throw error;
    }
    page.forEach((record) => deletedPaths.push(record.ref.path));
  }
  return deletedPaths;
}

function emptyUserSummary() {
  return {
    scanned: 0,
    deleteCandidates: 0,
    deleted: 0,
    skipped: 0,
    postCutoffLegacy: 0,
    personalUnread: 0,
    adminUnread: 0,
  };
}

async function scanUserNotifications({ firestore, userRef, cutoffMs, apply }) {
  const summary = emptyUserSummary();
  const candidatePaths = [];
  const deletedPaths = [];
  let cursor = null;
  while (true) {
    let notificationsQuery = userRef.collection('notifications')
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(NOTIFICATION_PAGE_SIZE);
    if (cursor) notificationsQuery = notificationsQuery.startAfter(cursor);
    const snapshot = await notificationsQuery.get();
    if (snapshot.empty) break;
    const records = snapshot.docs.map((entry) => ({
      ref: entry.ref,
      data: entry.data() || {},
      createTime: entry.createTime || null,
      updateTime: entry.updateTime || null,
    }));
    const page = summarizeNotificationRecords(records, cutoffMs);
    mergeSummary(summary, page.summary);
    page.deleteRecords.forEach((record) => candidatePaths.push(record.ref.path));
    if (apply) {
      try {
        deletedPaths.push(...await deleteRecordsInBatches(firestore, page.deleteRecords));
      } catch (error) {
        deletedPaths.push(...(error.notificationCleanupDeletedPaths || []));
        error.notificationCleanupProgress = { candidatePaths, deletedPaths };
        throw error;
      }
    }
    cursor = snapshot.docs[snapshot.docs.length - 1];
    if (snapshot.size < NOTIFICATION_PAGE_SIZE) break;
  }
  summary.deleted = deletedPaths.length;
  return { summary, candidatePaths, deletedPaths };
}

async function setCountersIfStateUnchanged({
  firestore,
  userRef,
  stateRef,
  capturedVersion,
  summary,
}) {
  return firestore.runTransaction(async (transaction) => {
    const [currentUser, currentState] = await Promise.all([
      transaction.get(userRef),
      transaction.get(stateRef),
    ]);
    if (!currentUser.exists) return 'user_missing';
    if (!stateVersionMatches(currentState, capturedVersion)) return 'state_changed';
    transaction.set(stateRef, {
      schemaVersion: 2,
      personalUnread: summary.personalUnread,
      adminUnread: summary.adminUnread,
      countersRebuiltAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return 'committed';
  });
}

function unstableUserError(userRef, maxAttempts) {
  const error = new Error(
    `Notification state kept changing for ${userRef.path}; no counter checkpoint was written after ${maxAttempts} attempts.`
  );
  error.code = 'notification-cleanup-state-unstable';
  return error;
}

function isWritePreconditionConflict(error) {
  const code = String(error?.code || '').toLowerCase();
  return code === '9'
    || code === '10'
    || code === 'failed-precondition'
    || code === 'aborted';
}

/*
 * Deletions use each notification's exact update time, while the final
 * transaction verifies that the parent user still exists and compares the
 * notificationState update time captured before the scan. Any live mutation
 * therefore either conflicts with a delete or forces a complete user rescan;
 * account deletion can never be followed by recreation of the state document.
 */
async function inspectUserNotifications({
  firestore,
  userRef,
  cutoffMs,
  apply,
  maxStableAttempts = MAX_STABLE_USER_ATTEMPTS,
}) {
  if (!apply) {
    const { summary } = await scanUserNotifications({ firestore, userRef, cutoffMs, apply: false });
    return summary;
  }
  if (!Number.isInteger(maxStableAttempts) || maxStableAttempts < 1 || maxStableAttempts > 20) {
    throw new Error('maxStableAttempts must be an integer between 1 and 20.');
  }

  const stateRef = userRef.collection('notificationState').doc('state');
  const candidatePaths = new Set();
  const deletedPaths = new Set();
  for (let attempt = 1; attempt <= maxStableAttempts; attempt += 1) {
    const capturedVersion = captureStateVersion(await stateRef.get());
    let scan;
    try {
      scan = await scanUserNotifications({ firestore, userRef, cutoffMs, apply: true });
    } catch (error) {
      (error.notificationCleanupProgress?.candidatePaths || []).forEach((path) => candidatePaths.add(path));
      (error.notificationCleanupProgress?.deletedPaths || []).forEach((path) => deletedPaths.add(path));
      if (!isWritePreconditionConflict(error)) throw error;
      if (attempt === maxStableAttempts) throw unstableUserError(userRef, maxStableAttempts);
      continue;
    }
    scan.candidatePaths.forEach((path) => candidatePaths.add(path));
    scan.deletedPaths.forEach((path) => deletedPaths.add(path));
    const outcome = await setCountersIfStateUnchanged({
      firestore,
      userRef,
      stateRef,
      capturedVersion,
      summary: scan.summary,
    });
    if (outcome === 'committed') {
      return {
        ...scan.summary,
        deleteCandidates: candidatePaths.size,
        deleted: deletedPaths.size,
        stabilityAttempts: attempt,
      };
    }
    if (outcome === 'user_missing') {
      return {
        ...scan.summary,
        deleteCandidates: candidatePaths.size,
        deleted: deletedPaths.size,
        personalUnread: 0,
        adminUnread: 0,
        stabilityAttempts: attempt,
        userMissing: true,
      };
    }
  }
  throw unstableUserError(userRef, maxStableAttempts);
}

async function runCleanup({
  firestore,
  options,
  log = console,
  maxStableAttempts = MAX_STABLE_USER_ATTEMPTS,
}) {
  const total = {
    users: 0,
    scanned: 0,
    deleteCandidates: 0,
    deleted: 0,
    skipped: 0,
    postCutoffLegacy: 0,
    personalUnread: 0,
    adminUnread: 0,
  };
  const jobRef = firestore.doc(`system/runtime/notificationCleanupJobs/${options.jobId}`);
  let resumeAfter = options.resumeAfter;

  if (options.apply) {
    const existing = await jobRef.get();
    if (existing.exists) {
      const recorded = existing.data() || {};
      if (recorded.cutoff !== options.cutoffIso) throw new Error('The cleanup job cutoff is immutable.');
      for (const key of Object.keys(total)) {
        const value = Number(recorded.totals?.[key]);
        total[key] = Number.isFinite(value) && value >= 0 ? value : 0;
      }
      if (!resumeAfter) resumeAfter = recorded.lastCompletedUserId || null;
    } else {
      await jobRef.create({
        type: 'legacy_notification_cleanup',
        status: 'running',
        cutoff: options.cutoffIso,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  }

  while (true) {
    let usersQuery = firestore.collection('users')
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(USER_PAGE_SIZE);
    if (resumeAfter) usersQuery = usersQuery.startAfter(resumeAfter);
    const users = await usersQuery.get();
    if (users.empty) break;

    for (const user of users.docs) {
      const result = await inspectUserNotifications({
        firestore,
        userRef: user.ref,
        cutoffMs: options.cutoffMs,
        apply: options.apply,
        maxStableAttempts,
      });
      total.users += 1;
      mergeSummary(total, result);
      resumeAfter = user.id;
      log.log('Notification cleanup user inspected.', {
        userId: user.id,
        mode: options.apply ? 'apply' : 'dry-run',
        ...result,
      });
      if (options.apply) {
        await jobRef.set({
          status: 'running',
          lastCompletedUserId: user.id,
          totals: total,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }
    }
    if (users.size < USER_PAGE_SIZE) break;
  }

  if (options.apply) {
    await jobRef.set({
      status: 'complete',
      lastCompletedUserId: resumeAfter || null,
      totals: total,
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  return total;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  initializeAdmin(admin);
  console.log(`Legacy notification cleanup: ${options.apply ? 'APPLY' : 'DRY RUN'}`, {
    cutoff: options.cutoffIso,
    jobId: options.jobId,
  });
  const totals = await runCleanup({ firestore: admin.firestore(), options });
  console.log('Legacy notification cleanup complete.', totals);
  if (!options.apply) console.log('No data changed. Review this output before using --apply.');
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Legacy notification cleanup failed.', error);
    process.exitCode = 1;
  });
}

module.exports = {
  classifyNotificationForCutoff,
  inspectUserNotifications,
  parseArgs,
  runCleanup,
  summarizeNotificationRecords,
  timestampMillis,
};
