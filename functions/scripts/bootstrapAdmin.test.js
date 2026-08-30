const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assertApplyAuthority,
  assertEligibleUser,
  parseArgs,
  run,
} = require('./bootstrapAdmin');

function eligibleUser(overrides = {}) {
  return {
    uid: 'owner-1',
    email: 'owner@example.com',
    emailVerified: true,
    disabled: false,
    customClaims: { support: true },
    multiFactor: { enrolledFactors: [{ factorId: 'totp', uid: 'totp-1' }] },
    ...overrides,
  };
}

function createAdmin({ user: suppliedUser, rejectClaimsReadback = false } = {}) {
  const writes = [];
  const user = suppliedUser || eligibleUser();
  const registry = { active: false };
  const registryRef = {
    get: async () => ({ exists: true, data: () => ({ ...registry }) }),
    set: async (data, options) => {
      writes.push({ type: 'registry', data, options });
      Object.assign(registry, data);
    },
  };
  const adminSdk = {
    apps: [],
    credential: { applicationDefault: () => 'adc' },
    initializeApp: (options) => {
      adminSdk.apps.push({ options });
      return adminSdk.apps[0];
    },
    app: () => adminSdk.apps[0],
    auth: () => ({
      getUserByEmail: async () => user,
      getUser: async () => (
        rejectClaimsReadback
          ? { ...user, customClaims: { ...user.customClaims } }
          : user
      ),
      setCustomUserClaims: async (uid, claims) => {
        writes.push({ type: 'claims', uid, claims });
        if (!rejectClaimsReadback) user.customClaims = { ...claims };
      },
    }),
    firestore: Object.assign(
      () => ({ doc: () => registryRef }),
      { FieldValue: { serverTimestamp: () => 'timestamp' } }
    ),
  };
  return { adminSdk, registry, user, writes };
}

function baseOptions(overrides = {}) {
  return {
    apply: false,
    confirmProduction: '',
    identifier: 'owner@example.com',
    manifestHash: '',
    projectId: 'planli-staging',
    ...overrides,
  };
}

test('admin bootstrap parsing is explicit and dry-run by default', () => {
  assert.deepEqual(parseArgs([
    '--project', 'planli-staging', '--identifier', 'owner@example.com',
  ]), baseOptions());
  assert.throws(() => parseArgs(['owner@example.com']), /Unknown argument/);
  assert.throws(() => parseArgs(['--project', 'planli-staging']), /identifier is required/);
});

test('admin bootstrap rejects disabled, unverified, and non-TOTP users', () => {
  assert.throws(() => assertEligibleUser(eligibleUser({ disabled: true })), /disabled/);
  assert.throws(() => assertEligibleUser(eligibleUser({ emailVerified: false })), /verified email/);
  assert.throws(
    () => assertEligibleUser(eligibleUser({ multiFactor: { enrolledFactors: [] } })),
    /TOTP second factor/
  );
  assert.throws(
    () => assertEligibleUser(eligibleUser({
      multiFactor: { enrolledFactors: [{ factorId: 'phone' }] },
    })),
    /TOTP second factor/
  );
});

test('admin bootstrap is side-effect free in dry-run mode', async () => {
  const state = createAdmin();
  const result = await run(baseOptions(), state.adminSdk);
  assert.equal(result.applied, false);
  assert.equal(result.changed, true);
  assert.match(result.hash, /^[0-9a-f]{64}$/);
  assert.deepEqual(state.writes, []);
  assert.deepEqual(result.manifest.after.claims, { support: true, admin: true });
});

test('admin bootstrap apply requires the current manifest and production confirmation', () => {
  const hash = 'a'.repeat(64);
  assert.throws(() => assertApplyAuthority(baseOptions({
    apply: true,
    manifestHash: 'b'.repeat(64),
  }), hash), /manifest-hash/);
  assert.throws(() => assertApplyAuthority(baseOptions({
    apply: true,
    manifestHash: hash,
    projectId: 'planli-f0b12',
  }), hash), /confirm-production planli-f0b12/);
});

test('admin bootstrap preserves claims, activates registry, and verifies read-back', async () => {
  const state = createAdmin();
  const preview = await run(baseOptions(), state.adminSdk);
  const result = await run(baseOptions({
    apply: true,
    manifestHash: preview.hash,
  }), state.adminSdk);
  assert.equal(result.applied, true);
  assert.deepEqual(state.writes[0].data.uid, 'owner-1');
  assert.equal(state.writes[0].data.active, true);
  assert.deepEqual(state.writes[1], {
    type: 'claims', uid: 'owner-1', claims: { support: true, admin: true },
  });
  assert.equal(state.registry.active, true);
});

test('admin bootstrap fails closed when post-apply read-back is incomplete', async () => {
  const state = createAdmin({ rejectClaimsReadback: true });
  const preview = await run(baseOptions(), state.adminSdk);
  await assert.rejects(() => run(baseOptions({
    apply: true,
    manifestHash: preview.hash,
  }), state.adminSdk), /read-back/);
});
