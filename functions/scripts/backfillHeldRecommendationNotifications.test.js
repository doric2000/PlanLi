const assert = require('node:assert/strict');
const test = require('node:test');

const {
  assertApplyAllowed,
  deterministicBackfillVersion,
  heldEventTime,
  loadPendingBackfill,
  parseOptions,
  runHeldRecommendationNotificationBackfill,
} = require('./backfillHeldRecommendationNotifications');

const timestamp = (milliseconds) => ({ toMillis: () => milliseconds });

function fakeDb(seed, { beforeTransaction = null } = {}) {
  const values = new Map(Object.entries(seed).map(([path, record]) => [path, {
    data: record.data,
    createTime: record.createTime || timestamp(100),
    updateTime: record.updateTime || timestamp(200),
  }]));
  const makeRef = (path) => ({
    path,
    id: path.split('/').at(-1),
    get: async function get() { return makeSnapshot(this); },
  });
  const makeSnapshot = (ref) => {
    const record = values.get(ref.path);
    return {
      ref,
      id: ref.id,
      exists: Boolean(record),
      data: () => record?.data,
      createTime: record?.createTime,
      updateTime: record?.updateTime,
    };
  };
  const db = {
    doc: makeRef,
    collection(path) {
      let maximum = Infinity;
      let expectedStatus = null;
      let cursor = '';
      const query = {
        where(field, operator, value) {
          assert.equal(field, 'status');
          assert.equal(operator, '==');
          expectedStatus = value;
          return query;
        },
        orderBy() { return query; },
        startAfter(value) { cursor = value; return query; },
        limit(value) { maximum = value; return query; },
        async get() {
          const prefix = `${path}/`;
          const docs = [...values.entries()]
            .filter(([entryPath, record]) => entryPath.startsWith(prefix)
              && !entryPath.slice(prefix.length).includes('/')
              && (!expectedStatus || record.data.status === expectedStatus)
              && (!cursor || entryPath.slice(prefix.length) > cursor))
            .sort(([left], [right]) => left.localeCompare(right))
            .slice(0, maximum)
            .map(([entryPath]) => makeSnapshot(makeRef(entryPath)));
          return { docs, size: docs.length };
        },
      };
      return query;
    },
    async runTransaction(handler) {
      if (beforeTransaction) await beforeTransaction(values);
      return handler({
        get: async (ref) => makeSnapshot(ref),
        set: (ref, data) => values.set(ref.path, {
          data,
          createTime: values.get(ref.path)?.createTime || timestamp(300),
          updateTime: timestamp(400),
        }),
      });
    },
  };
  return { db, values };
}

function heldRecord(ownerId, heldAt = 150) {
  return {
    data: {
      ownerId,
      status: 'moderation_hold',
      title: 'המלצה בבדיקה',
      moderation: { heldAt: timestamp(heldAt) },
      updatedAt: timestamp(160),
      createdAt: timestamp(120),
    },
    createTime: timestamp(100),
    updateTime: timestamp(200),
  };
}

test('held backfill options are dry-run by default and enforce the reviewed fingerprint', () => {
  const options = parseOptions(['--limit=25']);
  assert.deepEqual(options, {
    apply: false, limit: 25, after: '', fingerprint: '', confirmProject: '',
  });
  assert.throws(() => assertApplyAllowed({
    options: { ...options, apply: true, confirmProject: 'planli-f0b12', fingerprint: 'a'.repeat(64) },
    fingerprint: 'b'.repeat(64),
  }), /fingerprint/u);
  assert.doesNotThrow(() => assertApplyAllowed({
    options: { ...options, apply: true, confirmProject: 'planli-f0b12', fingerprint: 'a'.repeat(64) },
    fingerprint: 'a'.repeat(64),
  }));
});

test('held event time uses heldAt, then content timestamps, then Firestore metadata', () => {
  const snapshot = {
    data: () => ({
      moderation: { heldAt: timestamp(10) },
      updatedAt: timestamp(20),
      createdAt: timestamp(30),
    }),
    updateTime: timestamp(40),
    createTime: timestamp(50),
  };
  assert.equal(heldEventTime(snapshot).toMillis(), 10);
  assert.equal(heldEventTime({ ...snapshot, data: () => ({ updatedAt: timestamp(20) }) }).toMillis(), 20);
  assert.equal(heldEventTime({ ...snapshot, data: () => ({}) }).toMillis(), 40);
  assert.equal(
    deterministicBackfillVersion('recommendations/one', timestamp(10)),
    deterministicBackfillVersion('recommendations/one', timestamp(10))
  );
});

test('held backfill globally scans, bounds, and skips an existing deterministic outbox', async () => {
  const fixture = fakeDb({
    'recommendations/a': heldRecord('owner-a'),
    'recommendations/b': heldRecord('owner-b'),
  });
  const truncated = await loadPendingBackfill(fixture.db, 1);
  assert.equal(truncated.truncated, true);
  assert.equal(truncated.nextAfter, 'a');
  const nextPage = await loadPendingBackfill(fixture.db, 1, truncated.nextAfter);
  assert.equal(nextPage.records[0].snapshot.id, 'b');
  assert.equal(nextPage.truncated, false);

  const full = await loadPendingBackfill(fixture.db, 2);
  assert.equal(full.records.length, 2);
  const existing = full.records[0];
  fixture.values.set(existing.outboxRef.path, {
    data: {
      schemaVersion: 1,
      type: 'content_review_notification',
      state: 'ready',
      version: existing.version,
      ownerUid: existing.ownerUid,
      target: { type: 'recommendation', id: 'a', path: 'recommendations/a' },
    },
    createTime: timestamp(300),
    updateTime: timestamp(400),
  });
  const rescanned = await loadPendingBackfill(fixture.db, 2);
  assert.equal(rescanned.records.length, 1);
  assert.equal(rescanned.alreadyPresent, 1);
});

test('held backfill applies once, verifies the outbox, and is idempotent', async () => {
  const fixture = fakeDb({ 'recommendations/held': heldRecord('owner') });
  const dryRun = await runHeldRecommendationNotificationBackfill({
    db: fixture.db,
    options: parseOptions([]),
  });
  const applied = await runHeldRecommendationNotificationBackfill({
    db: fixture.db,
    options: parseOptions([
      '--apply',
      '--confirm-project=planli-f0b12',
      `--fingerprint=${dryRun.fingerprint}`,
    ]),
  });
  assert.equal(applied.applied, 1);
  assert.equal(applied.verified, true);

  const secondDryRun = await runHeldRecommendationNotificationBackfill({
    db: fixture.db,
    options: parseOptions([]),
  });
  assert.equal(secondDryRun.pending, 0);
  assert.equal(secondDryRun.alreadyPresent, 1);
});

test('held backfill rejects a recommendation that changes after manifest loading', async () => {
  let mutate = false;
  const fixture = fakeDb({ 'recommendations/held': heldRecord('owner') }, {
    beforeTransaction: async (values) => {
      if (!mutate) return;
      const record = values.get('recommendations/held');
      values.set('recommendations/held', { ...record, updateTime: timestamp(999) });
    },
  });
  const dryRun = await runHeldRecommendationNotificationBackfill({ db: fixture.db, options: parseOptions([]) });
  mutate = true;
  await assert.rejects(runHeldRecommendationNotificationBackfill({
    db: fixture.db,
    options: parseOptions([
      '--apply',
      '--confirm-project=planli-f0b12',
      `--fingerprint=${dryRun.fingerprint}`,
    ]),
  }), /changed after the dry run/u);
});
