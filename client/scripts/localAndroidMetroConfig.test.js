const test = require('node:test');
const assert = require('node:assert/strict');
const { withLocalAndroidValidation } = require('./localAndroidMetroConfig');
test('local Metro bounds workers and ignores downloaded tools while preserving normal configuration', () => {
  const original = { maxWorkers: 12, resolver: { blockList: /existing/, assetExts: ['jpg'] } };
  assert.equal(withLocalAndroidValidation(original, {}), original);
  const local = withLocalAndroidValidation(original, { PLANLI_LOCAL_E2E: 'true' });
  assert.equal(local.maxWorkers, 2);
  assert.deepEqual(local.resolver.assetExts, ['jpg']);
  assert.equal(local.resolver.blockList[0], original.resolver.blockList);
  assert.ok(local.resolver.blockList[1].test('C:/repo/.codex_tmp/android/sdk/bin/tool'));
  assert.ok(local.resolver.blockList[1].test('C:\\repo\\.codex_tmp\\android\\tool'));
  assert.equal(local.resolver.blockList[1].test('C:/repo/client/src/screen.js'), false);
});
