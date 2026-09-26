const assert = require('node:assert/strict');
const test = require('node:test');

const {
  assertApplyAllowed,
  hasMalformedCreatedAt,
  isEmptyPlainObject,
  loadMalformedNotifications,
  manifestFingerprint,
  parseOptions,
  repairManifest,
  runNotificationCreatedAtRepair,
} = require('./repairNotificationCreatedAt');

function fakeCollectionGroup(documents) {
  return {
    collectionGroup(name) {
      assert.equal(name, 'notifications');
      let cursor = '';
      let maximum = Infinity;
      const query = {
        orderBy() { return query; },
        startAfter(entry) { cursor = typeof entry === 'string' ? entry : entry.ref.path; return query; },
        limit(value) { maximum = value; return query; },
        async get() {
          const docs = documents
            .filter((entry) => !cursor || entry.ref.path > cursor)
            .slice(0, maximum);
          return { docs, size: docs.length };
        },
      };
      return query;
    },
  };
}

const timestamp = (milliseconds) => ({ toMillis: () => milliseconds });

function fakeRepairDatabase(seed, { beforeTransaction = null } = {}) {
  const records = new Map(Object.entries(seed).map(([path, value]) => [path, {
    data: value.data,
    createTime: value.createTime,
    updateTime: value.updateTime,
  }]));
  const makeRef = (path) => ({
    path,
    get: async function get() { return makeSnapshot(this); },
  });
  const makeSnapshot = (ref) => {
    const record = records.get(ref.path);
    return {
      ref,
      exists: Boolean(record),
      data: () => record?.data,
      createTime: record?.createTime,
      updateTime: record?.updateTime,
    };
  };
  const db = {
    ...fakeCollectionGroup([]),
    collectionGroup(name) {
      assert.equal(name, 'notifications');
      let cursor = '';
      let maximum = Infinity;
      const query = {
        orderBy() { return query; },
        startAfter(entry) { cursor = typeof entry === 'string' ? entry : entry.ref.path; return query; },
        limit(value) { maximum = value; return query; },
        async get() {
          const docs = [...records.keys()]
            .filter((path) => !cursor || path > cursor)
            .sort()
            .slice(0, maximum)
            .map((path) => makeSnapshot(makeRef(path)));
          return { docs, size: docs.length };
        },
      };
      return query;
    },
    async runTransaction(handler) {
      if (beforeTransaction) await beforeTransaction(records);
      return handler({
        get: async (ref) => makeSnapshot(ref),
        update: (ref, patch) => {
          const record = records.get(ref.path);
          records.set(ref.path, { ...record, data: { ...record.data, ...patch } });
        },
      });
    },
  };
  return { db, records };
}

test('notification repair recognizes only schema-v2 empty-map createdAt values', () => {
  assert.equal(isEmptyPlainObject({}), true);
  assert.equal(isEmptyPlainObject([]), false);
  assert.equal(hasMalformedCreatedAt({ schemaVersion: 2, channel: 'personal', createdAt: {} }), true);
  assert.equal(hasMalformedCreatedAt({ schemaVersion: 2, channel: 'admin', createdAt: {} }), true);
  assert.equal(hasMalformedCreatedAt({ schemaVersion: 2, channel: 'other', createdAt: {} }), false);
  assert.equal(hasMalformedCreatedAt({ schemaVersion: 1, channel: 'personal', createdAt: {} }), false);
  assert.equal(hasMalformedCreatedAt({
    schemaVersion: 2,
    channel: 'personal',
    createdAt: { toMillis: () => 1 },
  }), false);
});

test('notification repair stays dry-run and requires project plus manifest fingerprint for apply', () => {
  const options = parseOptions(['--limit', '50', '--after=users/previous/notifications/row']);
  assert.deepEqual(options, {
    apply: false,
    limit: 50,
    after: 'users/previous/notifications/row',
    fingerprint: '',
    confirmProject: '',
  });
  const manifest = repairManifest([{
    ref: { path: 'users/admin/notifications/row' },
    createTime: { toMillis: () => 10 },
    updateTime: { toMillis: () => 20 },
  }], { limit: options.limit, after: options.after, nextAfter: '' });
  const fingerprint = manifestFingerprint(manifest);
  assert.doesNotThrow(() => assertApplyAllowed({
    options: { ...options, apply: true, confirmProject: 'planli-f0b12', fingerprint },
    fingerprint,
  }));
  assert.throws(() => assertApplyAllowed({
    options: { ...options, apply: true, confirmProject: 'planli-f0b12', fingerprint: 'a'.repeat(64) },
    fingerprint,
  }), /fingerprint/u);
});

test('notification repair scans every personal and admin inbox across pages', async () => {
  const documents = Array.from({ length: 502 }, (_, index) => ({
    ref: { path: `users/user-${String(index).padStart(3, '0')}/notifications/row` },
    data: () => ({
      schemaVersion: 2,
      channel: index === 0 ? 'personal' : 'admin',
      createdAt: [0, 500].includes(index) ? {} : { seconds: index + 1 },
    }),
  }));
  const result = await loadMalformedNotifications(fakeCollectionGroup(documents), 10);
  assert.equal(result.scanned, 502);
  assert.equal(result.truncated, false);
  assert.deepEqual(result.records.map((entry) => entry.ref.path), [
    'users/user-000/notifications/row',
    'users/user-500/notifications/row',
  ]);
});

test('notification repair reports truncation only after finding more candidates than the limit', async () => {
  const documents = Array.from({ length: 12 }, (_, index) => ({
    ref: { path: `users/user/notifications/row-${String(index).padStart(2, '0')}` },
    data: () => ({ schemaVersion: 2, channel: 'personal', createdAt: {} }),
  }));
  const result = await loadMalformedNotifications(fakeCollectionGroup(documents), 10);
  assert.equal(result.records.length, 10);
  assert.equal(result.truncated, true);
  assert.equal(result.nextAfter, 'users/user/notifications/row-09');

  const nextPage = await loadMalformedNotifications(
    fakeCollectionGroup(documents),
    10,
    result.nextAfter
  );
  assert.deepEqual(nextPage.records.map((entry) => entry.ref.path), [
    'users/user/notifications/row-10',
    'users/user/notifications/row-11',
  ]);
  assert.equal(nextPage.truncated, false);
});

test('notification repair applies the reviewed creation times once and verifies the result', async () => {
  const fixture = fakeRepairDatabase({
    'users/owner/notifications/personal': {
      data: { schemaVersion: 2, channel: 'personal', createdAt: {} },
      createTime: timestamp(10),
      updateTime: timestamp(20),
    },
    'users/admin/notifications/admin': {
      data: { schemaVersion: 2, channel: 'admin', createdAt: {} },
      createTime: timestamp(30),
      updateTime: timestamp(40),
    },
  });
  const dryRun = await runNotificationCreatedAtRepair({ db: fixture.db, options: parseOptions([]) });
  const applied = await runNotificationCreatedAtRepair({
    db: fixture.db,
    options: parseOptions([
      '--apply',
      '--confirm-project=planli-f0b12',
      `--fingerprint=${dryRun.fingerprint}`,
    ]),
  });
  assert.equal(applied.applied, 2);
  assert.equal(applied.verified, true);
  assert.equal(fixture.records.get('users/owner/notifications/personal').data.createdAt.toMillis(), 10);
  assert.equal(fixture.records.get('users/admin/notifications/admin').data.createdAt.toMillis(), 30);
  const secondDryRun = await runNotificationCreatedAtRepair({ db: fixture.db, options: parseOptions([]) });
  assert.equal(secondDryRun.malformed, 0);
});

test('notification repair rejects a row changed after manifest loading', async () => {
  let mutate = false;
  const fixture = fakeRepairDatabase({
    'users/owner/notifications/personal': {
      data: { schemaVersion: 2, channel: 'personal', createdAt: {} },
      createTime: timestamp(10),
      updateTime: timestamp(20),
    },
  }, {
    beforeTransaction: async (records) => {
      if (!mutate) return;
      const record = records.get('users/owner/notifications/personal');
      records.set('users/owner/notifications/personal', { ...record, updateTime: timestamp(99) });
    },
  });
  const dryRun = await runNotificationCreatedAtRepair({ db: fixture.db, options: parseOptions([]) });
  mutate = true;
  await assert.rejects(runNotificationCreatedAtRepair({
    db: fixture.db,
    options: parseOptions([
      '--apply',
      '--confirm-project=planli-f0b12',
      `--fingerprint=${dryRun.fingerprint}`,
    ]),
  }), /changed after the dry-run manifest/u);
});
