const test = require('node:test');
const assert = require('node:assert/strict');

const {
  classifyNotificationForCutoff,
  inspectUserNotifications,
  parseArgs,
  runCleanup,
  summarizeNotificationRecords,
} = require('./cleanupLegacyNotifications');

const CUTOFF = '2026-08-21T12:00:00.000Z';
const CUTOFF_MS = Date.parse(CUTOFF);

function updateTime(version) {
  return { seconds: 1_700_000_000, nanoseconds: version };
}

function stateSnapshot(version) {
  if (version == null) return { exists: false };
  return { exists: true, updateTime: updateTime(version), data: () => ({}) };
}

function notificationSnapshot(id, data, version = 1) {
  return {
    id,
    ref: { path: `users/user-1/notifications/${id}` },
    data: () => data,
    createTime: updateTime(version),
    updateTime: updateTime(version),
  };
}

function querySnapshot(docs) {
  return { docs, empty: docs.length === 0, size: docs.length };
}

function createUserHarness({
  notificationScans,
  capturedStates,
  transactionStates,
  transactionUsers = [],
  batchCommits = [],
}) {
  let notificationScanIndex = 0;
  let capturedStateIndex = 0;
  let transactionStateIndex = 0;
  let batchCommitIndex = 0;
  const counterWrites = [];
  const deleteCalls = [];
  const stateRef = {
    path: 'users/user-1/notificationState/state',
    get: async () => capturedStates[capturedStateIndex++],
  };
  const userRef = {
    id: 'user-1',
    path: 'users/user-1',
    collection(name) {
      if (name === 'notificationState') return { doc: () => stateRef };
      assert.equal(name, 'notifications');
      const query = {
        orderBy: () => query,
        limit: () => query,
        startAfter: () => query,
        get: async () => querySnapshot(notificationScans[notificationScanIndex++] || []),
      };
      return query;
    },
  };
  const firestore = {
    batch() {
      return {
        delete(ref, precondition) {
          deleteCalls.push({ ref, precondition });
        },
        commit: async () => {
          const result = batchCommits[batchCommitIndex++];
          if (result instanceof Error) throw result;
          return result;
        },
      };
    },
    runTransaction: async (callback) => {
      const transactionIndex = transactionStateIndex++;
      return callback({
        get: async (ref) => {
          if (ref === userRef) return transactionUsers[transactionIndex] || { exists: true };
          if (ref === stateRef) return transactionStates[transactionIndex];
          throw new Error(`Unexpected transaction read: ${ref?.path || 'unknown'}`);
        },
        set(ref, data, options) {
          counterWrites.push({ ref, data, options });
        },
      });
    },
  };
  return {
    counterWrites,
    deleteCalls,
    firestore,
    getNotificationScanCount: () => notificationScanIndex,
    userRef,
  };
}

test('cleanup is dry-run by default and apply requires an exact cutoff confirmation', () => {
  const dryRun = parseArgs([`--cutoff=${CUTOFF}`]);
  assert.equal(dryRun.apply, false);
  assert.equal(dryRun.cutoffIso, CUTOFF);
  assert.throws(
    () => parseArgs([`--cutoff=${CUTOFF}`, '--apply']),
    /confirm-cutoff/
  );
  assert.equal(parseArgs([
    `--cutoff=${CUTOFF}`,
    '--apply',
    `--confirm-cutoff=${CUTOFF}`,
  ]).apply, true);
  assert.equal(parseArgs([
    `--cutoff=${CUTOFF}`,
    '--resume-after=user-10',
  ]).resumeAfter, 'user-10');
  assert.throws(
    () => parseArgs([
      `--cutoff=${CUTOFF}`,
      '--apply',
      `--confirm-cutoff=${CUTOFF}`,
      '--resume-after=user-10',
    ]),
    /cleanup job checkpoint/
  );
});

test('cutoff classification deletes only records at or before the cutoff', () => {
  assert.equal(classifyNotificationForCutoff({ data: { createdAt: new Date(CUTOFF_MS) } }, CUTOFF_MS).action, 'delete');
  assert.deepEqual(classifyNotificationForCutoff({
    data: {
      schemaVersion: 2,
      channel: 'personal',
      isRead: false,
      createdAt: new Date(CUTOFF_MS + 1),
    },
  }, CUTOFF_MS), { action: 'keep', channel: 'personal', unread: true });
  assert.equal(classifyNotificationForCutoff({ data: {} }, CUTOFF_MS).action, 'skip');
});

test('dry-run summary preserves post-cutoff records and rebuilds exact channel counters', () => {
  const records = [
    { ref: { path: 'old' }, data: { createdAt: new Date(CUTOFF_MS - 1) } },
    { ref: { path: 'personal' }, data: { schemaVersion: 2, channel: 'personal', isRead: false, createdAt: new Date(CUTOFF_MS + 1) } },
    { ref: { path: 'admin' }, data: { schemaVersion: 2, channel: 'admin', isRead: false, createdAt: new Date(CUTOFF_MS + 2) } },
    { ref: { path: 'read' }, data: { schemaVersion: 2, channel: 'admin', isRead: true, createdAt: new Date(CUTOFF_MS + 3) } },
    { ref: { path: 'legacy-new' }, data: { createdAt: new Date(CUTOFF_MS + 4) } },
  ];
  const result = summarizeNotificationRecords(records, CUTOFF_MS);
  assert.equal(result.summary.deleteCandidates, 1);
  assert.equal(result.summary.personalUnread, 1);
  assert.equal(result.summary.adminUnread, 1);
  assert.equal(result.summary.postCutoffLegacy, 1);
  assert.deepEqual(result.deleteRefs.map((ref) => ref.path), ['old']);
});

test('apply rescans from the beginning when notificationState changes and never writes stale counters', async () => {
  const personal = notificationSnapshot('personal', {
    schemaVersion: 2,
    channel: 'personal',
    isRead: false,
    createdAt: new Date(CUTOFF_MS + 1),
  });
  const adminNotification = notificationSnapshot('admin', {
    schemaVersion: 2,
    channel: 'admin',
    isRead: false,
    createdAt: new Date(CUTOFF_MS + 2),
  });
  const harness = createUserHarness({
    notificationScans: [[personal], [personal, adminNotification]],
    capturedStates: [stateSnapshot(1), stateSnapshot(2)],
    transactionStates: [stateSnapshot(2), stateSnapshot(2)],
  });

  const result = await inspectUserNotifications({
    firestore: harness.firestore,
    userRef: harness.userRef,
    cutoffMs: CUTOFF_MS,
    apply: true,
    maxStableAttempts: 3,
  });

  assert.equal(result.stabilityAttempts, 2);
  assert.equal(result.personalUnread, 1);
  assert.equal(result.adminUnread, 1);
  assert.equal(harness.getNotificationScanCount(), 2);
  assert.equal(harness.counterWrites.length, 1);
  assert.equal(harness.counterWrites[0].data.personalUnread, 1);
  assert.equal(harness.counterWrites[0].data.adminUnread, 1);
});

test('apply deletes cutoff records with their exact captured update-time precondition', async () => {
  const old = notificationSnapshot('old', { createdAt: new Date(CUTOFF_MS) }, 17);
  const harness = createUserHarness({
    notificationScans: [[old]],
    capturedStates: [stateSnapshot(1)],
    transactionStates: [stateSnapshot(1)],
  });

  const result = await inspectUserNotifications({
    firestore: harness.firestore,
    userRef: harness.userRef,
    cutoffMs: CUTOFF_MS,
    apply: true,
  });

  assert.equal(result.deleted, 1);
  assert.equal(harness.deleteCalls.length, 1);
  assert.equal(harness.deleteCalls[0].ref.path, old.ref.path);
  assert.deepEqual(harness.deleteCalls[0].precondition, { lastUpdateTime: old.updateTime });
});

test('a notification refreshed after classification survives and forces a bounded rescan', async () => {
  const old = notificationSnapshot('grouped-like', { createdAt: new Date(CUTOFF_MS) }, 17);
  const refreshed = notificationSnapshot('grouped-like', {
    schemaVersion: 2,
    channel: 'personal',
    isRead: false,
    createdAt: new Date(CUTOFF_MS + 1),
  }, 18);
  const conflict = new Error('document changed');
  conflict.code = 9;
  const harness = createUserHarness({
    notificationScans: [[old], [refreshed]],
    capturedStates: [stateSnapshot(1), stateSnapshot(1)],
    transactionStates: [stateSnapshot(1)],
    batchCommits: [conflict],
  });

  const result = await inspectUserNotifications({
    firestore: harness.firestore,
    userRef: harness.userRef,
    cutoffMs: CUTOFF_MS,
    apply: true,
    maxStableAttempts: 3,
  });

  assert.equal(result.stabilityAttempts, 2);
  assert.equal(result.deleted, 0);
  assert.equal(result.personalUnread, 1);
  assert.equal(harness.getNotificationScanCount(), 2);
  assert.equal(harness.counterWrites.length, 1);
  assert.equal(harness.counterWrites[0].data.personalUnread, 1);
});

test('an unstable user does not advance the job checkpoint and the next run resumes that user', async () => {
  const current = notificationSnapshot('current', {
    schemaVersion: 2,
    channel: 'personal',
    isRead: false,
    createdAt: new Date(CUTOFF_MS + 1),
  });
  const harness = createUserHarness({
    notificationScans: [[current], [current], [current]],
    capturedStates: [stateSnapshot(1), stateSnapshot(2), stateSnapshot(3)],
    transactionStates: [stateSnapshot(2), stateSnapshot(3), stateSnapshot(3)],
  });
  const jobWrites = [];
  const resumeCursors = [];
  const jobRef = {
    get: async () => ({
      exists: true,
      data: () => ({ cutoff: CUTOFF, lastCompletedUserId: 'previous-user' }),
    }),
    set: async (data, options) => jobWrites.push({ data, options }),
  };
  harness.firestore.doc = () => jobRef;
  harness.firestore.collection = (name) => {
    assert.equal(name, 'users');
    const query = {
      orderBy: () => query,
      limit: () => query,
      startAfter(value) {
        resumeCursors.push(value);
        return query;
      },
      get: async () => querySnapshot([{ id: 'user-1', ref: harness.userRef }]),
    };
    return query;
  };
  const options = {
    apply: true,
    cutoffIso: CUTOFF,
    cutoffMs: CUTOFF_MS,
    jobId: 'cleanup_job',
    resumeAfter: null,
  };

  await assert.rejects(
    runCleanup({
      firestore: harness.firestore,
      options,
      maxStableAttempts: 2,
      log: { log() {} },
    }),
    (error) => error.code === 'notification-cleanup-state-unstable'
  );
  assert.equal(jobWrites.length, 0);
  assert.equal(harness.counterWrites.length, 0);

  const totals = await runCleanup({
    firestore: harness.firestore,
    options,
    maxStableAttempts: 2,
    log: { log() {} },
  });
  assert.equal(totals.users, 1);
  assert.deepEqual(resumeCursors, ['previous-user', 'previous-user']);
  assert.equal(jobWrites[0].data.lastCompletedUserId, 'user-1');
  assert.equal(jobWrites[1].data.status, 'complete');
});

test('a concurrently removed user is checkpointed without recreating state or counting another deleter work', async () => {
  const old = notificationSnapshot('old', { createdAt: new Date(CUTOFF_MS) }, 17);
  const conflict = new Error('account cleanup removed the notification');
  conflict.code = 9;
  const harness = createUserHarness({
    notificationScans: [[old], []],
    capturedStates: [stateSnapshot(1), stateSnapshot(null)],
    transactionStates: [stateSnapshot(null)],
    transactionUsers: [{ exists: false }],
    batchCommits: [conflict],
  });
  const jobWrites = [];
  const logEntries = [];
  const jobRef = {
    get: async () => ({
      exists: true,
      data: () => ({ cutoff: CUTOFF, lastCompletedUserId: 'previous-user' }),
    }),
    set: async (data, options) => jobWrites.push({ data, options }),
  };
  harness.firestore.doc = () => jobRef;
  harness.firestore.collection = () => {
    const query = {
      orderBy: () => query,
      limit: () => query,
      startAfter: () => query,
      get: async () => querySnapshot([{ id: 'user-1', ref: harness.userRef }]),
    };
    return query;
  };
  const options = {
    apply: true,
    cutoffIso: CUTOFF,
    cutoffMs: CUTOFF_MS,
    jobId: 'cleanup_job',
    resumeAfter: null,
  };

  const totals = await runCleanup({
    firestore: harness.firestore,
    options,
    maxStableAttempts: 3,
    log: { log: (_message, details) => logEntries.push(details) },
  });

  assert.equal(totals.users, 1);
  assert.equal(totals.deleteCandidates, 1);
  assert.equal(totals.deleted, 0);
  assert.equal(harness.counterWrites.length, 0);
  assert.equal(logEntries[0].userMissing, true);
  assert.equal(jobWrites[0].data.lastCompletedUserId, 'user-1');
  assert.equal(jobWrites[0].data.totals.deleted, 0);
  assert.equal(jobWrites[1].data.status, 'complete');
});

test('a resumed cleanup keeps cumulative totals from earlier pages', async () => {
  const writes = [];
  const recordedTotals = {
    users: 4,
    scanned: 12,
    deleteCandidates: 7,
    deleted: 7,
    skipped: 5,
    postCutoffLegacy: 1,
    personalUnread: 2,
    adminUnread: 3,
  };
  const jobRef = {
    get: async () => ({
      exists: true,
      data: () => ({ cutoff: CUTOFF, lastCompletedUserId: 'user-4', totals: recordedTotals }),
    }),
    set: async (data) => writes.push(data),
  };
  const emptyQuery = {
    orderBy: () => emptyQuery,
    limit: () => emptyQuery,
    startAfter: () => emptyQuery,
    get: async () => querySnapshot([]),
  };
  const totals = await runCleanup({
    firestore: { doc: () => jobRef, collection: () => emptyQuery },
    options: {
      apply: true,
      cutoffIso: CUTOFF,
      cutoffMs: CUTOFF_MS,
      jobId: 'cleanup_job',
      resumeAfter: null,
    },
    log: { log() {} },
  });
  assert.deepEqual(totals, recordedTotals);
  assert.deepEqual(writes[0].totals, recordedTotals);
});
