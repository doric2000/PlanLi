const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assertApplyAuthority,
  manifestHash,
  parseArgs,
  run,
} = require('./setEmailVerified');

test('email verification is dry-run by default and has no implicit verified value', () => {
  assert.deepEqual(parseArgs([
    '--project', 'planli-staging',
    '--identifier', 'admin@example.com',
    '--verified', 'false',
  ]), {
    apply: false,
    confirmProduction: '',
    identifier: 'admin@example.com',
    manifestHash: '',
    projectId: 'planli-staging',
    verified: false,
  });
  assert.throws(() => parseArgs([
    '--project', 'planli-staging', '--identifier', 'admin@example.com',
  ]), /--verified is required/);
});
test('apply requires the exact manifest hash and typed production project', () => {
  const hash = 'a'.repeat(64);
  assert.throws(() => assertApplyAuthority({
    apply: true, projectId: 'planli-staging', manifestHash: 'b'.repeat(64),
  }, hash), /manifest-hash/);
  assert.throws(() => assertApplyAuthority({
    apply: true,
    projectId: 'planli-f0b12',
    manifestHash: hash,
    confirmProduction: '',
  }, hash), /confirm-production planli-f0b12/);
  assert.doesNotThrow(() => assertApplyAuthority({
    apply: true,
    projectId: 'planli-f0b12',
    manifestHash: hash,
    confirmProduction: 'planli-f0b12',
  }, hash));
});

test('dry-run reads the target but never mutates it', async () => {
  const updateUser = async () => assert.fail('dry-run must not update Auth');
  const user = { uid: 'user-1', email: 'admin@example.com', emailVerified: false };
  const admin = {
    apps: [{ name: 'existing' }],
    app: () => ({ name: 'existing' }),
    auth: () => ({ getUserByEmail: async () => user, updateUser }),
  };
  const result = await run({
    apply: false,
    projectId: 'planli-staging',
    identifier: user.email,
    verified: true,
    manifestHash: '',
    confirmProduction: '',
  }, admin);
  assert.equal(result.applied, false);
  assert.equal(result.changed, true);
  assert.equal(result.hash, manifestHash(result.manifest));
});
