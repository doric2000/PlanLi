const test = require('node:test');
const assert = require('node:assert/strict');
const { CORE_EMAIL, MEDIA_EMAIL, addMember, plan } = require('./configureFunctionServiceAccounts');

test('IAM policy additions are idempotent and preserve existing bindings', () => {
  const original = { version: 1, bindings: [{ role: 'roles/viewer', members: ['user:a@example.com'] }] };
  const once = addMember(original, 'roles/logging.logWriter', `serviceAccount:${CORE_EMAIL}`);
  const twice = addMember(once, 'roles/logging.logWriter', `serviceAccount:${CORE_EMAIL}`);
  assert.deepEqual(once, twice);
  assert.deepEqual(original.bindings, [{ role: 'roles/viewer', members: ['user:a@example.com'] }]);
});

test('runtime accounts receive distinct bucket permissions and no key creation', () => {
  const configuration = plan();
  assert.ok(configuration.bucketBindings.some((entry) =>
    entry.member.endsWith(CORE_EMAIL) && entry.role === 'roles/storage.objectViewer'));
  assert.ok(configuration.bucketBindings.some((entry) =>
    entry.member.endsWith(MEDIA_EMAIL) && entry.role === 'roles/storage.objectAdmin'));
  assert.equal(JSON.stringify(configuration).includes('serviceAccountKeys'), false);
});
