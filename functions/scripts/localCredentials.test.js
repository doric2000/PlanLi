const test = require('node:test');
const assert = require('node:assert/strict');
const { firebaseCliAuthorizedUser, firebaseToolsLibDirectory } = require('./localCredentials');

test('local maintenance credentials use the signed-in Firebase CLI account shape', () => {
  const directory = firebaseToolsLibDirectory();
  const credential = firebaseCliAuthorizedUser({
    directory,
    auth: {
      getGlobalDefaultAccount: () => ({
        tokens: { refresh_token: 'test-refresh-token' },
      }),
    },
    api: {
      clientId: () => 'test-client-id',
      clientSecret: () => 'test-client-secret',
    },
  });
  assert.ok(directory.endsWith('firebase-tools\\lib') || directory.endsWith('firebase-tools/lib'));
  assert.equal(credential.type, 'authorized_user');
  assert.equal(credential.client_id, 'test-client-id');
  assert.equal(credential.client_secret, 'test-client-secret');
  assert.equal(credential.refresh_token, 'test-refresh-token');
  assert.equal('private_key' in credential, false);
});
