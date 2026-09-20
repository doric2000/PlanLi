const test = require('node:test');
const assert = require('node:assert/strict');
const { runtimeEnvironment } = require('./runtimeEnvironment');
test('production retains its existing bucket and identities', () => {
  assert.deepEqual(runtimeEnvironment({ GCLOUD_PROJECT: 'planli-f0b12' }), {
    bucket: 'planli-f0b12-media-eu', coreServiceAccount: 'planli-core-functions@planli-f0b12.iam.gserviceaccount.com',
    mediaServiceAccount: 'planli-media-functions@planli-f0b12.iam.gserviceaccount.com',
  });
});
test('staging does not use production resources', () => {
  const result = runtimeEnvironment({ GCLOUD_PROJECT: 'planli-staging-demo' });
  assert.equal(result.bucket, 'planli-staging-demo-media-eu');
  assert.equal(result.mediaServiceAccount, 'planli-media-functions@planli-staging-demo.iam.gserviceaccount.com');
  assert.throws(() => runtimeEnvironment({ GCLOUD_PROJECT: 'planli-staging-demo', MEDIA_STORAGE_BUCKET: 'planli-f0b12-media-eu' }));
});
test('unknown cloud projects fail closed while the local harness remains compatible', () => {
  assert.throws(() => runtimeEnvironment({ GCLOUD_PROJECT: 'unrelated-project' }));
  assert.doesNotThrow(() => runtimeEnvironment({ GCLOUD_PROJECT: 'demo-planli-e2e', FUNCTIONS_EMULATOR: 'true' }));
});
