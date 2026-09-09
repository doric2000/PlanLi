const test = require('node:test');
const assert = require('node:assert/strict');
const { assertLocalEnvironment, localEnvironment } = require('./environment');

test('local harness refuses live projects, release runtimes and nonlocal services', () => {
  const local = localEnvironment();
  assert.equal(assertLocalEnvironment(local), true);
  for (const patch of [{ GCLOUD_PROJECT: 'planli-f0b12' }, { EAS_BUILD: 'true' }, { K_SERVICE: 'deployed' },
    { NODE_ENV: 'production' }, { FIRESTORE_EMULATOR_HOST: 'remote:8080' }, { PLANLI_LOCAL_E2E: '' }]) {
    assert.throws(() => assertLocalEnvironment({ ...local, ...patch }));
  }
});

test('runner cleanup restores registered local state once and respects completed recovery', () => {
  const { registerCleanup, cleanup } = require('./run');
  let restored = 0;
  registerCleanup(() => restored++);
  const completed = registerCleanup(() => restored += 100);
  completed(); cleanup(); cleanup();
  assert.equal(restored, 1);
});
