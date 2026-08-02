const test = require('node:test');
const assert = require('node:assert/strict');
const { firebaseCliAuthorizedUser, firebaseToolsLibDirectory } = require('./localCredentials');

test('local maintenance credentials come from the signed-in Firebase CLI', () => {
  const directory = firebaseToolsLibDirectory();
  const credential = firebaseCliAuthorizedUser();
  assert.ok(directory.endsWith('firebase-tools\\lib') || directory.endsWith('firebase-tools/lib'));
  assert.equal(credential.type, 'authorized_user');
  assert.ok(credential.client_id);
  assert.ok(credential.client_secret);
  assert.ok(credential.refresh_token);
  assert.equal('private_key' in credential, false);
});
