const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { CORE_EMAIL, MEDIA_EMAIL, addMember, plan } = require('./configureFunctionServiceAccounts');

test('CLI defaults to a credential-free dry run with the tested policy plan', () => {
  const output = execFileSync(process.execPath, [require.resolve('./configureFunctionServiceAccounts')], {
    encoding: 'utf8', env: { ...process.env, APPDATA: '' },
  });
  assert.deepEqual(JSON.parse(output), { mode: 'dry-run', ...plan() });
});

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

test('background publication grants only its provider secrets and the Storage event publisher', () => {
  const configuration = plan();
  assert.deepEqual(configuration.secretBindings.filter((entry) => entry.member.endsWith(MEDIA_EMAIL))
    .map((entry) => entry.secretId).sort(), ['PUBLIC_RATE_LIMIT_KEY', 'REST_COUNTRIES_KEY']);
  assert(configuration.projectBindings.some((entry) => entry.member.endsWith(MEDIA_EMAIL)
    && entry.role === 'roles/serviceusage.serviceUsageConsumer'));
  assert.deepEqual(configuration.projectBindings.filter((entry) => entry.role === 'roles/pubsub.publisher'), [{
    role: 'roles/pubsub.publisher',
    member: `serviceAccount:service-${configuration.projectNumber}@gs-project-accounts.iam.gserviceaccount.com`,
  }]);
});
