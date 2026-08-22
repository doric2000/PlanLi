const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_PUSH_PREFERENCES,
  PLANLI_EAS_PROJECT_ID,
  PUSH_SCHEMA_VERSION,
  buildExpoMessage,
  deviceDocumentId,
  dispatchDocumentId,
  dispatchNotificationVersion,
  dispatchNotificationWrite,
  derivePushCategory,
  getPushPreferences,
  handleNotificationPushWriteEvent,
  processPendingPushDispatches,
  processPendingPushReceipts,
  registerNotificationDevice,
  sendMessagesWithRetry,
  updateNotificationPreferences,
  unregisterNotificationDevice,
} = require('./notificationPushService');

const TOKEN = 'ExpoPushToken[test-device-token]';

test('reply pushes use direct-reply copy on the existing comments channel', () => {
  const message = buildExpoMessage({
    token: TOKEN,
    notificationId: 'notification-1',
    channel: 'personal',
    category: 'comments',
    subtype: 'new_reply',
    version: 1,
  });
  assert.equal(message.channelId, 'planli-comments');
  assert.equal(message.title, 'תשובה חדשה ב-PlanLi');
  assert.equal(message.body, 'מישהו השיב לתגובה שלך.');
});

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function mergeData(current, next) {
  return { ...(current || {}), ...clone(next) };
}

function valueAt(data, field) {
  return String(field).split('.').reduce((value, key) => value?.[key], data);
}

class MemoryDocumentReference {
  constructor(db, path) {
    this.db = db;
    this.path = path;
    this.id = path.split('/').at(-1);
  }

  async get() {
    return this.db.snapshot(this.path);
  }

  async set(data, options = {}) {
    this.db.write(this.path, data, options);
  }

  async delete() {
    this.db.documents.delete(this.path);
  }
}

class MemoryQuery {
  constructor(db, path, constraints = [], requestedLimit = Infinity) {
    this.db = db;
    this.path = path;
    this.constraints = constraints;
    this.requestedLimit = requestedLimit;
  }

  where(field, operator, value) {
    return new MemoryQuery(
      this.db,
      this.path,
      [...this.constraints, { type: 'where', field, operator, value }],
      this.requestedLimit
    );
  }

  orderBy(field, direction = 'asc') {
    return new MemoryQuery(
      this.db,
      this.path,
      [...this.constraints, { type: 'orderBy', field, direction }],
      this.requestedLimit
    );
  }

  limit(value) {
    return new MemoryQuery(this.db, this.path, this.constraints, value);
  }

  async get() {
    const prefix = `${this.path}/`;
    let docs = [...this.db.documents.entries()]
      .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
      .map(([path]) => this.db.snapshot(path));
    this.constraints.filter((constraint) => constraint.type === 'where')
      .forEach(({ field, operator, value }) => {
        docs = docs.filter((entry) => {
          const actual = valueAt(entry.data(), field);
          if (operator === '==') return actual === value;
          if (operator === 'in') return Array.isArray(value) && value.includes(actual);
          if (operator === '<=') return actual <= value;
          throw new Error(`Unsupported query operator: ${operator}`);
        });
      });
    this.constraints.filter((constraint) => constraint.type === 'orderBy')
      .forEach(({ field, direction }) => {
        docs.sort((left, right) => {
          const a = valueAt(left.data(), field);
          const b = valueAt(right.data(), field);
          const result = a < b ? -1 : a > b ? 1 : 0;
          return direction === 'desc' ? -result : result;
        });
      });
    docs = docs.slice(0, this.requestedLimit);
    return { docs, size: docs.length, empty: docs.length === 0 };
  }
}

class MemoryFirestore {
  constructor(seed = {}) {
    this.documents = new Map(Object.entries(seed).map(([path, data]) => [path, clone(data)]));
    this.transactionTail = Promise.resolve();
  }

  doc(path) {
    return new MemoryDocumentReference(this, path);
  }

  collection(path) {
    return new MemoryQuery(this, path);
  }

  snapshot(path) {
    const exists = this.documents.has(path);
    const ref = this.doc(path);
    return {
      exists,
      id: ref.id,
      ref,
      data: () => exists ? clone(this.documents.get(path)) : undefined,
    };
  }

  write(path, data, options = {}) {
    const current = this.documents.get(path);
    this.documents.set(path, options.merge ? mergeData(current, data) : clone(data));
  }

  read(path) {
    return clone(this.documents.get(path));
  }

  find(collectionPath, predicate = () => true) {
    const prefix = `${collectionPath}/`;
    return [...this.documents.entries()]
      .filter(([path, data]) => (
        path.startsWith(prefix)
        && !path.slice(prefix.length).includes('/')
        && predicate(data, path)
      ));
  }

  async runTransaction(operation) {
    const previous = this.transactionTail;
    let release;
    this.transactionTail = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      const writes = [];
      const transaction = {
        get: (ref) => ref.get(),
        set: (ref, data, options) => writes.push(() => this.write(ref.path, data, options)),
        delete: (ref) => writes.push(() => this.documents.delete(ref.path)),
      };
      const result = await operation(transaction);
      writes.forEach((write) => write());
      return result;
    } finally {
      release();
    }
  }
}

function createAdmin(seed, { authUsers = {} } = {}) {
  const db = new MemoryFirestore(seed);
  const firestore = () => db;
  firestore.FieldValue = { serverTimestamp: () => new Date('2026-08-21T10:00:00.000Z') };
  const auth = () => ({
    getUser: async (uid) => authUsers[uid] || { uid, customClaims: {} },
  });
  return { admin: { auth, firestore }, db };
}

function eventSnapshot(path, data, exists = true) {
  return {
    exists,
    ref: { path },
    data: () => data,
  };
}

function successExpo(receiptId = 'receipt-1') {
  const sent = [];
  return {
    sent,
    chunkPushNotifications: (messages) => [messages],
    sendPushNotificationsAsync: async (messages) => {
      sent.push(...messages);
      return messages.map((_message, index) => ({ status: 'ok', id: `${receiptId}-${index}` }));
    },
  };
}

test('device registration uses one global token hash and atomically reassigns ownership', async () => {
  const { admin, db } = createAdmin({
    'users/user-a': { moderation: { status: 'active' } },
    'users/user-b': { moderation: { status: 'active' } },
  });
  const data = {
    token: TOKEN,
    platform: 'ios',
    schemaVersion: PUSH_SCHEMA_VERSION,
    projectId: PLANLI_EAS_PROJECT_ID,
    timeZone: 'Asia/Jerusalem',
    appVersion: '1.1.0',
  };

  await registerNotificationDevice({ admin, auth: { uid: 'user-a' }, data });
  await registerNotificationDevice({ admin, auth: { uid: 'user-b' }, data });

  const path = `notificationDevices/${deviceDocumentId(TOKEN)}`;
  assert.equal(db.find('notificationDevices').length, 1);
  assert.equal(db.read(path).uid, 'user-b');
  assert.equal(db.read(path).tokenHash, deviceDocumentId(TOKEN));
  assert.equal(db.read(path).enabled, true);

  assert.deepEqual(
    await unregisterNotificationDevice({ admin, auth: { uid: 'user-a' }, data: { token: TOKEN } }),
    { unregistered: false }
  );
  assert.equal(db.read(path).uid, 'user-b');
  assert.deepEqual(
    await unregisterNotificationDevice({ admin, auth: { uid: 'user-b' }, data: { token: TOKEN } }),
    { unregistered: true }
  );
  assert.equal(db.read(path), undefined);
});

test('device registration requires an eligible parent user and creates no orphan state', async () => {
  const { admin, db } = createAdmin();

  await assert.rejects(
    registerNotificationDevice({
      admin,
      auth: { uid: 'deleted-user' },
      data: {
        token: TOKEN,
        platform: 'ios',
        schemaVersion: PUSH_SCHEMA_VERSION,
        projectId: PLANLI_EAS_PROJECT_ID,
      },
    }),
    (error) => error?.details?.reason === 'PUSH_ACCOUNT_INELIGIBLE'
  );

  assert.equal(db.find('notificationDevices').length, 0);
  assert.equal(db.read('users/deleted-user/notificationState/state'), undefined);

  for (const status of ['suspended', 'deleting']) {
    db.write(`users/${status}-user`, { moderation: { status } });
    await assert.rejects(
      registerNotificationDevice({
        admin,
        auth: { uid: `${status}-user` },
        data: {
          token: `ExpoPushToken[${status}-device]`,
          platform: 'android',
          schemaVersion: PUSH_SCHEMA_VERSION,
          projectId: PLANLI_EAS_PROJECT_ID,
        },
      }),
      (error) => error?.details?.reason === 'PUSH_ACCOUNT_INELIGIBLE'
    );
  }
  assert.equal(db.find('notificationDevices').length, 0);
});

test('device registration enforces a per-user active cap while allowing refreshes', async () => {
  const { admin, db } = createAdmin({
    'users/user-a': { moderation: { status: 'active' } },
  });
  const registration = (token) => registerNotificationDevice({
    admin,
    auth: { uid: 'user-a' },
    data: {
      token,
      platform: 'ios',
      schemaVersion: PUSH_SCHEMA_VERSION,
      projectId: PLANLI_EAS_PROJECT_ID,
    },
  });

  for (let index = 0; index < 5; index += 1) {
    await registration(`ExpoPushToken[active-device-${index}]`);
  }
  await registration('ExpoPushToken[active-device-0]');
  await assert.rejects(
    registration('ExpoPushToken[active-device-overflow]'),
    (error) => error?.details?.reason === 'PUSH_DEVICE_LIMIT_REACHED'
  );

  assert.equal(db.find('notificationDevices').length, 5);
  assert.equal(
    db.read('users/user-a/notificationState/state').deviceRegistrationRate.registrations,
    5
  );
});

test('device registration rate-limits ownership churn independently of the active cap', async () => {
  const now = new Date('2026-08-21T10:00:00.000Z');
  const { admin, db } = createAdmin({
    'users/user-a': { moderation: { status: 'active' } },
  });
  for (let index = 0; index < 10; index += 1) {
    const token = `ExpoPushToken[churn-device-${index}]`;
    await registerNotificationDevice({
      admin,
      auth: { uid: 'user-a' },
      data: {
        token,
        platform: 'android',
        schemaVersion: PUSH_SCHEMA_VERSION,
        projectId: PLANLI_EAS_PROJECT_ID,
      },
      now,
    });
    await unregisterNotificationDevice({
      admin,
      auth: { uid: 'user-a' },
      data: { token },
    });
  }

  await assert.rejects(
    registerNotificationDevice({
      admin,
      auth: { uid: 'user-a' },
      data: {
        token: 'ExpoPushToken[churn-device-overflow]',
        platform: 'android',
        schemaVersion: PUSH_SCHEMA_VERSION,
        projectId: PLANLI_EAS_PROJECT_ID,
      },
      now,
    }),
    (error) => error?.details?.reason === 'PUSH_DEVICE_REGISTRATION_RATE_LIMITED'
  );
  assert.equal(db.find('notificationDevices').length, 0);
});

test('device registration rejects a token attributed to a different Expo project', async () => {
  const { admin } = createAdmin();
  await assert.rejects(
    registerNotificationDevice({
      admin,
      auth: { uid: 'user-a' },
      data: {
        token: TOKEN,
        platform: 'ios',
        schemaVersion: PUSH_SCHEMA_VERSION,
        projectId: 'foreign-project',
      },
    }),
    (error) => error?.details?.reason === 'PUSH_PROJECT_MISMATCH'
  );
});

test('preferences are nested in notificationState and remain opt-in by default', async () => {
  const { admin, db } = createAdmin({
    'users/user-a': {},
    'users/user-a/notificationState/state': { unreadPersonal: 4 },
  });

  assert.deepEqual(
    await getPushPreferences({ admin, auth: { uid: 'user-a' } }),
    { preferences: DEFAULT_PUSH_PREFERENCES }
  );
  const result = await updateNotificationPreferences({
    admin,
    auth: { uid: 'user-a' },
    data: { preferences: { pushEnabled: true, comments: false, quietHoursEnabled: true } },
  });

  assert.equal(result.preferences.pushEnabled, true);
  assert.equal(result.preferences.comments, false);
  assert.equal(result.preferences.likes, true);
  assert.equal(Object.hasOwn(result.preferences, 'quietHoursEnabled'), false);
  assert.equal(db.read('users/user-a/notificationState/state').unreadPersonal, 4);
  assert.equal(db.read('users/user-a/notificationState/state').schemaVersion, 2);
  assert.deepEqual(
    db.read('users/user-a/notificationState/state').pushPreferences,
    result.preferences
  );
});

test('preference-only notificationState creation uses the canonical schema version', async () => {
  const { admin, db } = createAdmin({ 'users/user-a': {} });

  await updateNotificationPreferences({
    admin,
    auth: { uid: 'user-a' },
    data: { preferences: { pushEnabled: true } },
  });

  const state = db.read('users/user-a/notificationState/state');
  assert.equal(state.schemaVersion, 2);
  assert.equal(state.pushPreferences.pushEnabled, true);
});

test('preference updates cannot recreate notification state after account deletion starts', async () => {
  for (const seed of [{}, { 'users/user-a': { status: 'deleting' } }]) {
    const { admin, db } = createAdmin(seed);
    await assert.rejects(updateNotificationPreferences({
      admin,
      auth: { uid: 'user-a' },
      data: { preferences: { pushEnabled: true } },
    }), (error) => error?.details?.reason === 'PUSH_ACCOUNT_INELIGIBLE');
    assert.equal(db.read('users/user-a/notificationState/state'), undefined);
  }
});

test('Expo message content is generic Hebrew and payload data contains only id and channel', () => {
  const message = buildExpoMessage({
    token: TOKEN,
    uid: 'user-a',
    notificationId: 'notification-1',
    channel: 'personal',
    category: 'comments',
    version: 2,
    actorName: 'Sensitive Actor',
    targetId: 'private-target',
  });

  assert.deepEqual(message.data, {
    notificationId: 'notification-1',
    channel: 'personal',
  });
  assert.deepEqual(Object.keys(message.data), ['notificationId', 'channel']);
  assert.match(message.title, /PlanLi/u);
  assert.doesNotMatch(JSON.stringify(message), /Sensitive Actor|private-target/u);
});

test('push preference categories are derived from the durable inbox row', () => {
  assert.equal(derivePushCategory({ channel: 'personal', type: 'like' }), 'likes');
  assert.equal(derivePushCategory({ channel: 'personal', type: 'comment' }), 'comments');
  assert.equal(derivePushCategory({ channel: 'personal', type: 'system' }), 'system');
  assert.equal(derivePushCategory({
    channel: 'admin', type: 'moderation', subtype: 'destination_review_discovered',
  }), 'adminDestinations');
  assert.equal(derivePushCategory({
    channel: 'admin', type: 'moderation', subtype: 'urgent_escalation',
  }), 'adminReports');
  assert.equal(derivePushCategory({ channel: 'admin', type: 'system' }), null);
});

test('send retries transient transport failures and retryable Expo tickets with backoff', async () => {
  let attempts = 0;
  const delays = [];
  const expoClient = {
    sendPushNotificationsAsync: async () => {
      attempts += 1;
      if (attempts === 1) throw Object.assign(new Error('unavailable'), { statusCode: 503 });
      if (attempts === 2) {
        return [{ status: 'error', details: { error: 'MessageRateExceeded' } }];
      }
      return [{ status: 'ok', id: 'receipt-final' }];
    },
  };

  const tickets = await sendMessagesWithRetry(expoClient, [{ to: TOKEN }], {
    sleep: async (delay) => delays.push(delay),
  });

  assert.deepEqual(tickets, [{ status: 'ok', id: 'receipt-final' }]);
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [500, 1000]);
});

test('version dispatch is claimed before send and cannot send the same version twice', async () => {
  const now = new Date('2026-08-21T10:00:00.000Z');
  const deviceId = deviceDocumentId(TOKEN);
  const notificationData = {
    channel: 'personal', type: 'like', subtype: 'grouped_likes', push: { version: 3 },
  };
  const { admin, db } = createAdmin({
    'users/user-a/notificationState/state': {
      pushPreferences: { pushEnabled: true },
    },
    'users/user-a/notifications/notification-1': notificationData,
    [`notificationDevices/${deviceId}`]: {
      uid: 'user-a', token: TOKEN, enabled: true, platform: 'ios',
    },
  });
  const expoClient = successExpo();
  const input = {
    admin,
    uid: 'user-a',
    notificationId: 'notification-1',
    notificationData,
    expoClient,
    now,
    sleep: async () => {},
  };

  const first = await dispatchNotificationVersion(input);
  const second = await dispatchNotificationVersion(input);

  assert.equal(first.status, 'sent');
  assert.equal(second.status, 'already_claimed');
  assert.equal(expoClient.sent.length, 1);
  assert.deepEqual(expoClient.sent[0].data, {
    notificationId: 'notification-1', channel: 'personal',
  });
  const dispatch = db.find('system/runtime/notificationPushDispatches')[0][1];
  assert.equal(dispatch.status, 'complete');
  assert.equal(dispatch.version, 3);
  assert.equal(dispatch.category, 'likes');
  const receipt = db.find('system/runtime/notificationPushReceipts')[0][1];
  assert.equal(receipt.checkAfter.getTime() - now.getTime(), 15 * 60 * 1000);
});

test('admin category dispatch rechecks both the Auth claim and active server registry', async () => {
  const deviceId = deviceDocumentId(TOKEN);
  const seed = {
    'users/admin-a/notificationState/state': { pushPreferences: { pushEnabled: true } },
    [`notificationDevices/${deviceId}`]: { uid: 'admin-a', token: TOKEN, enabled: true },
    'system/moderation/admins/admin-a': { active: true },
    'users/admin-a/notifications/admin-notification-1': {
      channel: 'admin', type: 'moderation', subtype: 'report_received', push: { version: 1 },
    },
    'users/admin-a/notifications/admin-notification-2': {
      channel: 'admin', type: 'moderation', subtype: 'destination_review_discovered',
      push: { version: 1 },
    },
  };
  const ineligible = createAdmin(seed, {
    authUsers: { 'admin-a': { uid: 'admin-a', customClaims: { admin: false } } },
  });
  const blockedExpo = successExpo();
  const blocked = await dispatchNotificationVersion({
    admin: ineligible.admin,
    uid: 'admin-a',
    notificationId: 'admin-notification-1',
    notificationData: {
      channel: 'admin', type: 'moderation', subtype: 'report_received', push: { version: 1 },
    },
    expoClient: blockedExpo,
  });
  assert.equal(blocked.status, 'skipped');
  assert.equal(blocked.reason, 'admin_ineligible');
  assert.equal(blockedExpo.sent.length, 0);

  const eligible = createAdmin(seed, {
    authUsers: { 'admin-a': { uid: 'admin-a', customClaims: { admin: true } } },
  });
  const allowedExpo = successExpo();
  const allowed = await dispatchNotificationVersion({
    admin: eligible.admin,
    uid: 'admin-a',
    notificationId: 'admin-notification-2',
    notificationData: {
      channel: 'admin',
      type: 'moderation',
      subtype: 'destination_review_discovered',
      push: { version: 1 },
    },
    expoClient: allowedExpo,
  });
  assert.equal(allowed.status, 'sent');
  assert.equal(allowedExpo.sent.length, 1);
});

test('write dispatcher ignores read-only changes and event helper forwards a new version', async () => {
  const path = 'users/user-a/notifications/notification-1';
  const afterData = {
    channel: 'personal', type: 'system', subtype: 'content_held', isRead: true,
    push: { version: 1 },
  };
  const after = eventSnapshot(path, afterData);
  const unchanged = await dispatchNotificationWrite({
    admin: createAdmin().admin,
    before: eventSnapshot(path, { ...afterData, isRead: false }),
    after,
    uid: 'user-a',
    notificationId: 'notification-1',
  });
  assert.deepEqual(unchanged, { status: 'ignored', reason: 'version_unchanged' });

  const { admin } = createAdmin({ [path]: afterData });
  const forwarded = await handleNotificationPushWriteEvent({
    admin,
    event: {
      params: { userId: 'user-a', notificationId: 'notification-1' },
      data: {
        before: eventSnapshot(path, {}, false),
        after,
      },
    },
  });
  assert.deepEqual(forwarded, {
    status: 'skipped',
    reason: 'push_disabled',
    dispatchId: forwarded.dispatchId,
  });
});

test('immediate dispatch suppresses deleted and superseded authoritative inbox rows', async () => {
  const path = 'users/user-a/notifications/notification-1';
  const eventData = {
    channel: 'personal', type: 'like', subtype: 'grouped_likes',
    generation: 'event-generation', push: { version: 1 },
  };
  const cases = [
    { name: 'deleted', authoritative: null, reason: 'notification_deleted' },
    {
      name: 'newer version',
      authoritative: { ...eventData, push: { version: 2 } },
      reason: 'superseded',
    },
    {
      name: 'new generation',
      authoritative: { ...eventData, generation: 'new-generation' },
      reason: 'superseded',
    },
  ];

  for (const item of cases) {
    const seed = {
      'users/user-a/notificationState/state': { pushPreferences: { pushEnabled: true } },
      [`notificationDevices/${deviceDocumentId(TOKEN)}`]: {
        uid: 'user-a', token: TOKEN, enabled: true,
      },
      ...(item.authoritative ? { [path]: item.authoritative } : {}),
    };
    const { admin } = createAdmin(seed);
    const expoClient = successExpo(item.name);
    const result = await dispatchNotificationWrite({
      admin,
      before: eventSnapshot(path, {}, false),
      after: eventSnapshot(path, eventData),
      uid: 'user-a',
      notificationId: 'notification-1',
      expoClient,
    });

    assert.equal(result.status, 'skipped', item.name);
    assert.equal(result.reason, item.reason, item.name);
    assert.equal(expoClient.sent.length, 0, item.name);
  }
});

test('receipt worker disables DeviceNotRegistered tokens and removes the receipt job', async () => {
  const now = new Date('2026-08-21T10:30:00.000Z');
  const deviceId = deviceDocumentId(TOKEN);
  const { admin, db } = createAdmin({
    [`notificationDevices/${deviceId}`]: {
      uid: 'user-a', token: TOKEN, enabled: true,
    },
    'system/runtime/notificationPushReceipts/job-1': {
      receiptId: 'receipt-1',
      dispatchId: 'dispatch-1',
      uid: 'user-a',
      notificationId: 'notification-1',
      version: 1,
      channel: 'personal',
      category: 'system',
      deviceId,
      mode: 'receipt',
      attempts: 0,
      receiptChecks: 0,
      checkAfter: new Date('2026-08-21T10:15:00.000Z'),
      expireAt: new Date('2026-08-22T10:00:00.000Z'),
    },
  });
  const expoClient = {
    chunkPushNotificationReceiptIds: (ids) => [ids],
    getPushNotificationReceiptsAsync: async () => ({
      'receipt-1': { status: 'error', details: { error: 'DeviceNotRegistered' } },
    }),
  };

  const summary = await processPendingPushReceipts({ admin, expoClient, now });

  assert.deepEqual(summary, { scanned: 1, completed: 1, rescheduled: 0, disabled: 1 });
  assert.equal(db.read(`notificationDevices/${deviceId}`).enabled, false);
  assert.equal(db.read(`notificationDevices/${deviceId}`).disabledReason, 'DeviceNotRegistered');
  assert.equal(db.read('system/runtime/notificationPushReceipts/job-1'), undefined);
});

test('persistent ticket retry rechecks opt-out before sending again', async () => {
  const now = new Date('2026-08-21T10:30:00.000Z');
  const deviceId = deviceDocumentId(TOKEN);
  const { admin, db } = createAdmin({
    'users/user-a/notificationState/state': { pushPreferences: { pushEnabled: false } },
    'users/user-a/notifications/notification-1': {
      channel: 'personal', type: 'comment', subtype: 'new_comment', push: { version: 1 },
    },
    [`notificationDevices/${deviceId}`]: { uid: 'user-a', token: TOKEN, enabled: true },
    'system/runtime/notificationPushReceipts/retry-job': {
      receiptId: null,
      dispatchId: 'dispatch-1',
      uid: 'user-a',
      notificationId: 'notification-1',
      version: 1,
      channel: 'personal',
      category: 'comments',
      deviceId,
      mode: 'retry_send',
      attempts: 1,
      checkAfter: new Date('2026-08-21T10:15:00.000Z'),
      expireAt: new Date('2026-08-22T10:00:00.000Z'),
    },
  });
  const expoClient = {
    sendPushNotificationsAsync: async () => {
      throw new Error('No send is expected after opt-out.');
    },
  };

  const summary = await processPendingPushReceipts({ admin, expoClient, now });

  assert.deepEqual(summary, { scanned: 1, completed: 1, rescheduled: 0, disabled: 0 });
  assert.equal(db.read('system/runtime/notificationPushReceipts/retry-job'), undefined);
});

test('persistent ticket retry drops a deleted or superseded inbox generation before sending', async () => {
  const now = new Date('2026-08-21T10:30:00.000Z');
  const deviceId = deviceDocumentId(TOKEN);
  const retryPath = 'system/runtime/notificationPushReceipts/retry-job';
  const notificationPath = 'users/user-a/notifications/notification-1';
  const { admin, db } = createAdmin({
    'users/user-a/notificationState/state': { pushPreferences: { pushEnabled: true } },
    [`notificationDevices/${deviceId}`]: { uid: 'user-a', token: TOKEN, enabled: true },
    [notificationPath]: {
      channel: 'personal',
      type: 'like',
      subtype: 'grouped_likes',
      generation: 'new-generation',
      push: { version: 1 },
    },
    [retryPath]: {
      receiptId: null,
      dispatchId: 'dispatch-1',
      uid: 'user-a',
      notificationId: 'notification-1',
      version: 1,
      generation: 'old-generation',
      channel: 'personal',
      category: 'likes',
      deviceId,
      mode: 'retry_send',
      attempts: 1,
      checkAfter: new Date('2026-08-21T10:15:00.000Z'),
      expireAt: new Date('2026-08-22T10:00:00.000Z'),
    },
  });
  const expoClient = {
    sendPushNotificationsAsync: async () => {
      throw new Error('A superseded generation must never be sent.');
    },
  };

  const summary = await processPendingPushReceipts({ admin, expoClient, now });

  assert.deepEqual(summary, { scanned: 1, completed: 1, rescheduled: 0, disabled: 0 });
  assert.equal(db.read(retryPath), undefined);
});

test('concurrent retry-send workers claim one lease and send exactly once', async () => {
  const now = new Date('2026-08-21T10:30:00.000Z');
  const deviceId = deviceDocumentId(TOKEN);
  const retryPath = 'system/runtime/notificationPushReceipts/retry-job';
  const notificationPath = 'users/user-a/notifications/notification-1';
  const { admin, db } = createAdmin({
    'users/user-a/notificationState/state': { pushPreferences: { pushEnabled: true } },
    [`notificationDevices/${deviceId}`]: { uid: 'user-a', token: TOKEN, enabled: true },
    [notificationPath]: {
      channel: 'personal', type: 'comment', subtype: 'new_comment', push: { version: 1 },
    },
    [retryPath]: {
      receiptId: null,
      dispatchId: 'dispatch-1',
      uid: 'user-a',
      notificationId: 'notification-1',
      version: 1,
      generation: null,
      channel: 'personal',
      category: 'comments',
      deviceId,
      mode: 'retry_send',
      retryState: 'pending',
      attempts: 1,
      checkAfter: new Date('2026-08-21T10:15:00.000Z'),
      expireAt: new Date('2026-08-22T10:00:00.000Z'),
    },
  });
  let sends = 0;
  const expoClient = {
    sendPushNotificationsAsync: async () => {
      sends += 1;
      return [{ status: 'ok', id: 'claimed-receipt' }];
    },
  };

  await Promise.all([
    processPendingPushReceipts({ admin, expoClient, now }),
    processPendingPushReceipts({ admin, expoClient, now }),
  ]);

  assert.equal(sends, 1);
  assert.equal(db.read(retryPath), undefined);
  assert.equal(db.find('system/runtime/notificationPushReceipts').length, 1);
  assert.equal(
    db.find('system/runtime/notificationPushReceipts')[0][1].receiptId,
    'claimed-receipt'
  );
});

test('an expired retry-send lease is reclaimed', async () => {
  const now = new Date('2026-08-21T10:30:00.000Z');
  const deviceId = deviceDocumentId(TOKEN);
  const retryPath = 'system/runtime/notificationPushReceipts/retry-job';
  const notificationPath = 'users/user-a/notifications/notification-1';
  const { admin, db } = createAdmin({
    'users/user-a/notificationState/state': { pushPreferences: { pushEnabled: true } },
    [`notificationDevices/${deviceId}`]: { uid: 'user-a', token: TOKEN, enabled: true },
    [notificationPath]: {
      channel: 'personal', type: 'system', subtype: 'content_restored', push: { version: 1 },
    },
    [retryPath]: {
      receiptId: null,
      dispatchId: 'dispatch-1',
      uid: 'user-a',
      notificationId: 'notification-1',
      version: 1,
      channel: 'personal',
      category: 'system',
      deviceId,
      mode: 'retry_send',
      retryState: 'processing',
      retryClaimToken: 'abandoned-claim',
      retryLeaseUntil: new Date('2026-08-21T10:20:00.000Z'),
      attempts: 1,
      checkAfter: new Date('2026-08-21T10:15:00.000Z'),
      expireAt: new Date('2026-08-22T10:00:00.000Z'),
    },
  });
  const expoClient = successExpo('reclaimed-receipt');

  const summary = await processPendingPushReceipts({ admin, expoClient, now });

  assert.deepEqual(summary, { scanned: 1, completed: 1, rescheduled: 0, disabled: 0 });
  assert.equal(expoClient.sent.length, 1);
  assert.equal(db.read(retryPath), undefined);
});

test('a recreated grouped-like row claims a fresh dispatch for its new generation', async () => {
  const deviceId = deviceDocumentId(TOKEN);
  const notificationPath = 'users/user-a/notifications/like-target-1';
  const firstNotification = {
    channel: 'personal', type: 'like', subtype: 'grouped_likes',
    generation: 'generation-one', push: { version: 1 },
  };
  const { admin, db } = createAdmin({
    'users/user-a/notificationState/state': { pushPreferences: { pushEnabled: true } },
    [`notificationDevices/${deviceId}`]: { uid: 'user-a', token: TOKEN, enabled: true },
    [notificationPath]: firstNotification,
  });
  const expoClient = successExpo('generation');
  const base = {
    admin,
    uid: 'user-a',
    notificationId: 'like-target-1',
    notificationPath,
    expoClient,
  };

  const first = await dispatchNotificationVersion({
    ...base,
    notificationData: firstNotification,
  });
  const recreatedNotification = {
    channel: 'personal', type: 'like', subtype: 'grouped_likes',
    generation: 'generation-two', push: { version: 1 },
  };
  db.write(notificationPath, recreatedNotification);
  const recreated = await dispatchNotificationVersion({
    ...base,
    notificationData: recreatedNotification,
  });

  assert.equal(first.status, 'sent');
  assert.equal(recreated.status, 'sent');
  assert.notEqual(first.dispatchId, recreated.dispatchId);
  assert.equal(expoClient.sent.length, 2);
});

test('persistent dispatch worker retries a transient send for the exact durable inbox version', async () => {
  const firstNow = new Date('2026-08-21T10:00:00.000Z');
  const retryNow = new Date('2026-08-21T10:02:00.000Z');
  const deviceId = deviceDocumentId(TOKEN);
  const notificationPath = 'users/user-a/notifications/notification-1';
  const notificationData = {
    channel: 'personal', type: 'system', subtype: 'content_restored', push: { version: 4 },
  };
  const { admin, db } = createAdmin({
    'users/user-a/notificationState/state': { pushPreferences: { pushEnabled: true } },
    [`notificationDevices/${deviceId}`]: { uid: 'user-a', token: TOKEN, enabled: true },
    [notificationPath]: notificationData,
  });
  const failed = await dispatchNotificationVersion({
    admin,
    uid: 'user-a',
    notificationId: 'notification-1',
    notificationData,
    notificationPath,
    now: firstNow,
    expoClient: {
      sendPushNotificationsAsync: async () => {
        throw Object.assign(new Error('unavailable'), { statusCode: 503 });
      },
    },
    sleep: async () => {},
  });
  assert.equal(failed.status, 'retry');

  const expoClient = successExpo('recovered');
  const summary = await processPendingPushDispatches({
    admin,
    expoClient,
    now: retryNow,
    sleep: async () => {},
  });

  assert.deepEqual(summary, { scanned: 1, retried: 1, completed: 0 });
  assert.equal(expoClient.sent.length, 1);
  const dispatch = db.find('system/runtime/notificationPushDispatches')[0][1];
  assert.equal(dispatch.status, 'complete');
  assert.equal(dispatch.attempts, 2);
});

test('terminal dispatch flood cannot starve an expired processing lease', async () => {
  const now = new Date('2026-08-21T10:30:00.000Z');
  const deviceId = deviceDocumentId(TOKEN);
  const notificationId = 'notification-expired-lease';
  const notificationPath = `users/user-a/notifications/${notificationId}`;
  const notificationData = {
    channel: 'personal', type: 'system', subtype: 'content_held', push: { version: 2 },
  };
  const dispatchId = dispatchDocumentId('user-a', notificationId, 2);
  const dispatchPath = `system/runtime/notificationPushDispatches/${dispatchId}`;
  const terminalDispatches = Object.fromEntries(Array.from({ length: 101 }, (_, index) => [
    `system/runtime/notificationPushDispatches/terminal-${String(index).padStart(3, '0')}`,
    {
      status: 'complete',
      leaseUntil: null,
      nextAttemptAt: null,
      expireAt: new Date('2026-08-22T10:00:00.000Z'),
    },
  ]));
  const { admin, db } = createAdmin({
    'users/user-a/notificationState/state': { pushPreferences: { pushEnabled: true } },
    [`notificationDevices/${deviceId}`]: { uid: 'user-a', token: TOKEN, enabled: true },
    [notificationPath]: notificationData,
    ...terminalDispatches,
    [dispatchPath]: {
      uid: 'user-a',
      notificationId,
      notificationPath,
      version: 2,
      generation: null,
      channel: 'personal',
      category: 'system',
      status: 'processing',
      claimToken: 'abandoned-claim',
      attempts: 1,
      leaseUntil: new Date('2026-08-21T10:20:00.000Z'),
      nextAttemptAt: null,
      expireAt: new Date('2026-08-22T10:00:00.000Z'),
    },
  });
  const expoClient = successExpo('lease-recovered');

  const summary = await processPendingPushDispatches({
    admin,
    expoClient,
    now,
    sleep: async () => {},
  });

  assert.deepEqual(summary, { scanned: 1, retried: 1, completed: 0 });
  assert.equal(expoClient.sent.length, 1);
  assert.equal(db.read(dispatchPath).status, 'complete');
  assert.equal(db.read(dispatchPath).attempts, 2);
  assert.notEqual(db.read(dispatchPath).claimToken, 'abandoned-claim');
});

test('transient receipt persistence retries the same tickets without another Expo send', async () => {
  const now = new Date('2026-08-21T10:00:00.000Z');
  const notificationId = 'notification-partial-persistence';
  const notificationPath = `users/user-a/notifications/${notificationId}`;
  const notificationData = {
    channel: 'personal', type: 'system', subtype: 'content_restored', push: { version: 1 },
  };
  const secondToken = 'ExpoPushToken[second-device]';
  const { admin, db } = createAdmin({
    'users/user-a/notificationState/state': { pushPreferences: { pushEnabled: true } },
    [`notificationDevices/${deviceDocumentId(TOKEN)}`]: {
      uid: 'user-a', token: TOKEN, enabled: true,
    },
    [`notificationDevices/${deviceDocumentId(secondToken)}`]: {
      uid: 'user-a', token: secondToken, enabled: true,
    },
    [notificationPath]: notificationData,
  });
  const originalWrite = db.write.bind(db);
  let receiptWrites = 0;
  db.write = (path, data, options) => {
    if (path.startsWith('system/runtime/notificationPushReceipts/')) {
      receiptWrites += 1;
      if (receiptWrites === 2) throw Object.assign(new Error('unavailable'), { code: 'unavailable' });
    }
    return originalWrite(path, data, options);
  };
  const expoClient = successExpo('partial');

  const result = await dispatchNotificationVersion({
    admin,
    uid: 'user-a',
    notificationId,
    notificationData,
    notificationPath,
    expoClient,
    now,
    sleep: async () => {},
  });
  const recovery = await processPendingPushDispatches({
    admin,
    expoClient,
    now: new Date('2026-08-21T10:10:00.000Z'),
  });

  assert.equal(result.status, 'sent');
  assert.equal(result.counts.persistenceErrors, undefined);
  assert.equal(result.counts.receipts, 2);
  assert.equal(expoClient.sent.length, 2);
  assert.equal(db.find('system/runtime/notificationPushReceipts').length, 2);
  assert.deepEqual(recovery, { scanned: 0, retried: 0, completed: 0 });
  assert.equal(
    db.find('system/runtime/notificationPushDispatches')[0][1].status,
    'complete'
  );
});

test('permanent Expo request failures terminate the dispatch without a retry job', async () => {
  const deviceId = deviceDocumentId(TOKEN);
  const notificationData = {
    channel: 'personal', type: 'system', subtype: 'content_held', push: { version: 1 },
  };
  const { admin, db } = createAdmin({
    'users/user-a/notificationState/state': { pushPreferences: { pushEnabled: true } },
    [`notificationDevices/${deviceId}`]: { uid: 'user-a', token: TOKEN, enabled: true },
    'users/user-a/notifications/notification-permanent': notificationData,
  });
  const result = await dispatchNotificationVersion({
    admin,
    uid: 'user-a',
    notificationId: 'notification-permanent',
    notificationData,
    expoClient: {
      sendPushNotificationsAsync: async () => {
        throw Object.assign(new Error('bad request'), { statusCode: 400 });
      },
    },
  });

  assert.equal(result.status, 'failed');
  const dispatch = db.find('system/runtime/notificationPushDispatches')[0][1];
  assert.equal(dispatch.status, 'skipped');
  assert.equal(dispatch.outcome, 'permanent_failure');
  assert.equal(dispatch.nextAttemptAt, null);
});
