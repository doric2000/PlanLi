const test = require('node:test');
const assert = require('node:assert/strict');

const {
  deleteDocumentStrict,
  deleteNotificationDevicesForUser,
  removeReporterModerationData,
  requestAccountDeletion,
} = require('./deletionService');

test('account cleanup includes durable owner-notification outboxes', () => {
  const source = require('node:fs').readFileSync(require.resolve('./deletionService'), 'utf8');
  assert.match(
    source,
    /collection\('system\/moderation\/ownerNotifications'\)\.where\('uid', '==', uid\)/u
  );
  assert.ok(
    source.indexOf("collection('system/moderation/ownerNotifications')")
      > source.indexOf('recursiveDelete(userRef)'),
    'owner outboxes must be swept after the parent user is deleted'
  );
  assert.ok(
    source.lastIndexOf("userRef.collection('notificationState')")
      > source.indexOf('recursiveDelete(userRef)'),
    'notification state must receive a final sweep after the parent user is deleted'
  );
  assert.ok(
    source.lastIndexOf("userRef.collection('notifications')")
      > source.indexOf('recursiveDelete(userRef)'),
    'notifications must receive a final sweep after the parent user is deleted'
  );
  assert.ok(
    source.lastIndexOf('deleteNotificationDevicesForUser({ admin, uid })')
      > source.indexOf('recursiveDelete(userRef)'),
    'notification devices must be swept after the parent user is deleted'
  );
  assert.ok(
    source.indexOf("status: 'deleting'") < source.indexOf("step: 'content'"),
    'the account must be write-gated before destructive cleanup begins'
  );
});

test('account cleanup deletes every global notification device owned by the user', async () => {
  const deleted = [];
  const docs = [
    { ref: { path: 'notificationDevices/a' } },
    { ref: { path: 'notificationDevices/b' } },
  ];
  let queryUid = null;
  const db = {
    collection: (name) => {
      assert.equal(name, 'notificationDevices');
      return {
        where: (field, operator, uid) => {
          assert.equal(field, 'uid');
          assert.equal(operator, '==');
          queryUid = uid;
          return {
            limit: () => ({
              get: async () => ({ empty: false, size: docs.length, docs }),
            }),
          };
        },
      };
    },
    batch: () => ({
      delete: (ref) => deleted.push(ref.path),
      commit: async () => {},
    }),
  };

  const count = await deleteNotificationDevicesForUser({
    admin: { firestore: () => db },
    uid: 'user-1',
  });

  assert.equal(queryUid, 'user-1');
  assert.equal(count, 2);
  assert.deepEqual(deleted, ['notificationDevices/a', 'notificationDevices/b']);
});

function recentAuth() {
  return {
    uid: 'firebase-user-1',
    token: { auth_time: Math.floor(Date.now() / 1000) },
  };
}

test('Apple account deletion binds the fresh code to the linked provider before deleting data', async () => {
  const sentinel = new Error('stop-after-revocation-check');
  let received;
  const admin = {
    auth: () => ({
      getUser: async () => ({ providerData: [{ providerId: 'apple.com', uid: 'apple-subject-1' }] }),
    }),
  };

  await assert.rejects(requestAccountDeletion({
    admin,
    auth: recentAuth(),
    data: { appleAuthorizationCode: 'fresh-code' },
    mediaBucket: 'test.appspot.com',
    appleConfig: { clientId: 'com.planli.planlitravels' },
    revokeAppleAuthorizationImpl: async (input) => {
      received = input;
      throw sentinel;
    },
  }), sentinel);

  assert.deepEqual(received, {
    authorizationCode: 'fresh-code',
    expectedSubject: 'apple-subject-1',
    config: { clientId: 'com.planli.planlitravels' },
  });
});

test('non-Apple accounts cannot submit an Apple authorization code', async () => {
  const admin = {
    auth: () => ({
      getUser: async () => ({ providerData: [{ providerId: 'password', uid: 'firebase-user-1' }] }),
    }),
  };

  await assert.rejects(requestAccountDeletion({
    admin,
    auth: recentAuth(),
    data: { appleAuthorizationCode: 'foreign-code' },
  }), (error) => error.code === 'invalid-argument');
});

test('account deletion still requires a recent Firebase authentication', async () => {
  await assert.rejects(requestAccountDeletion({
    admin: {},
    auth: { uid: 'firebase-user-1', token: { auth_time: 1 } },
    data: {},
  }), (error) => error.code === 'failed-precondition');
});

test('reporter moderation records are removed and aggregate counters are decremented', async () => {
  const reportRef = { path: 'system/moderation/cases/case-1/reports/user-1' };
  reportRef.parent = { parent: { path: 'system/moderation/cases/case-1' } };
  let update;
  let deleted;
  const db = {
    collectionGroup: () => ({
      where: () => ({
        get: async () => ({
          size: 1,
          docs: [{ ref: reportRef, data: () => ({ category: 'spam_scam_commercial' }) }],
        }),
      }),
    }),
    runTransaction: async (handler) => handler({
      get: async () => ({
        exists: true,
        data: () => ({
          reportCount: 2,
          uniqueCount24h: 1,
          recentReporters: { 'user-1': 123 },
          categoryCounts: { spam_scam_commercial: 2 },
        }),
      }),
      update: (_ref, value) => { update = value; },
      delete: (ref) => { deleted = ref.path; },
    }),
  };
  const admin = {
    firestore: Object.assign(() => db, {
      FieldValue: { delete: () => 'DELETE', serverTimestamp: () => 'time' },
    }),
  };
  assert.equal(await removeReporterModerationData({ admin, uid: 'user-1' }), 1);
  assert.equal(update.reportCount, 1);
  assert.equal(update.uniqueCount24h, 0);
  assert.equal(update['recentReporters.user-1'], 'DELETE');
  assert.equal(update['categoryCounts.spam_scam_commercial'], 1);
  assert.equal(deleted, reportRef.path);
});

test('public-profile deletion ignores only not-found errors', async () => {
  await assert.doesNotReject(deleteDocumentStrict({ delete: async () => { throw { code: 404 }; } }));
  const failure = new Error('permission denied');
  failure.code = 7;
  await assert.rejects(deleteDocumentStrict({ delete: async () => { throw failure; } }), failure);
});
