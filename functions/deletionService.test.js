const test = require('node:test');
const assert = require('node:assert/strict');

const { requestAccountDeletion } = require('./deletionService');

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
