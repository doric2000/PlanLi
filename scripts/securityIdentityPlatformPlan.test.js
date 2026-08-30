const assert = require('node:assert/strict');
const test = require('node:test');

const {
  CONFIRMATION,
  actionsFor,
  assertApplyGates,
  execute,
  loadPlan,
  manifestHash,
  parseArgs,
  stateMatchesPlan,
  summarizeState,
} = require('./securityIdentityPlatformPlan');

test('Identity Platform manifest is TOTP-only and production bounded', () => {
  const plan = loadPlan();
  assert.equal(plan.projectId, 'planli-f0b12');
  assert.equal(plan.desiredSubtype, 'IDENTITY_PLATFORM');
  assert.equal(plan.mfa.state, 'ENABLED');
  assert.deepEqual(plan.mfa.enabledProviders, []);
  assert.equal(plan.mfa.providerConfigs[0].state, 'ENABLED');
  assert.equal(plan.mfa.providerConfigs[0].totpProviderConfig.adjacentIntervals, 1);
});

test('apply requires exact project, manifest and explicit terms confirmation', () => {
  const hash = manifestHash(loadPlan());
  assert.throws(() => assertApplyGates({ apply: true }, hash), /project/);
  assert.throws(() => assertApplyGates({
    apply: true, project: 'planli-f0b12', manifestHash: 'wrong', confirm: CONFIRMATION,
  }, hash), /hash/);
  assert.throws(() => assertApplyGates({
    apply: true, project: 'planli-f0b12', manifestHash: hash, confirm: 'yes',
  }, hash), /confirmation/);
  assert.doesNotThrow(() => assertApplyGates({
    apply: true, project: 'planli-f0b12', manifestHash: hash, confirm: CONFIRMATION,
  }, hash));
});

test('state matching rejects Firebase Auth, SMS, disabled TOTP and clock-window drift', () => {
  const plan = loadPlan();
  const valid = {
    subtype: 'IDENTITY_PLATFORM', mfaState: 'ENABLED', totpEnabled: true,
    adjacentIntervals: 1, smsEnabled: false,
  };
  assert.equal(stateMatchesPlan(valid, plan), true);
  assert.equal(stateMatchesPlan({ ...valid, subtype: 'FIREBASE_AUTH' }, plan), false);
  assert.equal(stateMatchesPlan({ ...valid, mfaState: 'DISABLED' }, plan), false);
  assert.equal(stateMatchesPlan({ ...valid, smsEnabled: true }, plan), false);
  assert.equal(stateMatchesPlan({ ...valid, totpEnabled: false }, plan), false);
  assert.equal(stateMatchesPlan({ ...valid, adjacentIntervals: 5 }, plan), false);
  assert.equal(actionsFor({ ...valid, subtype: 'FIREBASE_AUTH' }, plan)[0].action, 'initialize-identity-platform');
});

test('config summarization returns no provider details beyond security state', () => {
  assert.deepEqual(summarizeState({
    subtype: 'IDENTITY_PLATFORM',
    mfa: {
      state: 'ENABLED',
      enabledProviders: ['PHONE_SMS'],
      providerConfigs: [{ state: 'ENABLED', totpProviderConfig: { adjacentIntervals: 1 } }],
    },
  }), {
    subtype: 'IDENTITY_PLATFORM', mfaState: 'ENABLED', totpEnabled: true,
    adjacentIntervals: 1, smsEnabled: true,
  });
});

test('apply initializes, patches and independently verifies exact read-back', async () => {
  const plan = loadPlan();
  const hash = manifestHash(plan);
  let reads = 0;
  let initialized = 0;
  let patched = 0;
  const firebaseState = {
    subtype: 'FIREBASE_AUTH',
    mfa: { state: 'DISABLED', providerConfigs: [] },
  };
  const identityState = {
    subtype: 'IDENTITY_PLATFORM',
    mfa: {
      state: 'ENABLED', enabledProviders: [],
      providerConfigs: [{ state: 'ENABLED', totpProviderConfig: { adjacentIntervals: 1 } }],
    },
  };
  const fetchImpl = async (url, request = {}) => {
    assert.match(request.headers.Authorization, /^Bearer /);
    if (request.method === 'GET') {
      reads += 1;
      const data = reads === 1 ? firebaseState : identityState;
      return { ok: true, status: 200, text: async () => JSON.stringify(data) };
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };
  const result = await execute({
    apply: true,
    project: 'planli-f0b12',
    manifestHash: hash,
    confirm: CONFIRMATION,
    dependencies: {
      tokenProvider: () => ({ access_token: 'a'.repeat(60) }),
      fetchImpl,
      initializeIdentityPlatform: async () => { initialized += 1; },
      patchTotp: async () => { patched += 1; },
    },
  });
  assert.equal(initialized, 1);
  assert.equal(patched, 1);
  assert.equal(reads, 2);
  assert.equal(result.readBackVerified, true);
});

test('apply uses the documented initialize endpoint and exact TOTP-only patch', async () => {
  const plan = loadPlan();
  const calls = [];
  let reads = 0;
  const fetchImpl = async (url, request = {}) => {
    calls.push({ url: String(url), request });
    if ((request.method || 'GET') === 'GET') {
      reads += 1;
      const data = reads === 1
        ? { subtype: 'FIREBASE_AUTH', mfa: { state: 'DISABLED' } }
        : {
            subtype: 'IDENTITY_PLATFORM',
            mfa: {
              state: 'ENABLED', enabledProviders: [],
              providerConfigs: [{ state: 'ENABLED', totpProviderConfig: { adjacentIntervals: 1 } }],
            },
          };
      return { ok: true, status: 200, text: async () => JSON.stringify(data) };
    }
    return { ok: true, status: 200, text: async () => '' };
  };
  await execute({
    apply: true,
    project: 'planli-f0b12',
    manifestHash: manifestHash(plan),
    confirm: CONFIRMATION,
    dependencies: {
      tokenProvider: () => ({ access_token: 'a'.repeat(60) }),
      fetchImpl,
    },
  });
  const writes = calls.filter(({ request }) => ['POST', 'PATCH'].includes(request.method));
  assert.equal(writes.length, 2);
  assert.equal(
    writes[0].url,
    'https://identitytoolkit.googleapis.com/v2/projects/planli-f0b12/identityPlatform:initializeAuth',
  );
  assert.equal(writes[0].request.body, undefined);
  assert.equal(
    writes[1].url,
    'https://identitytoolkit.googleapis.com/admin/v2/projects/planli-f0b12/config?updateMask=mfa',
  );
  assert.deepEqual(JSON.parse(writes[1].request.body), { mfa: plan.mfa });
  assert.equal(writes[1].request.headers['X-Goog-User-Project'], 'planli-f0b12');
});

test('argument parser rejects alternate projects and unknown options', () => {
  assert.throws(() => parseArgs(['--project', 'other']), /Refusing/);
  assert.throws(() => parseArgs(['--force']), /Unknown/);
});
