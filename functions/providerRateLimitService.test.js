const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DAY_MAXIMUM,
  MINUTE_MAXIMUM,
  PROVIDER_BUDGET_VERSION,
  PROVIDER_CALLABLE_LIMITS,
  PROVIDER_COSTS,
  PROVIDER_ROUTE_CALLABLE_LIMITS,
  bucketState,
  consumeProviderBudget,
  providerPrincipal,
} = require('./providerRateLimitService');

function fakeAdmin() {
  const documents = new Map();
  const db = {
    doc: (path) => ({ path }),
    runTransaction: async (callback) => callback({
      get: async (ref) => ({ data: () => documents.get(ref.path) }),
      set: (ref, data) => documents.set(ref.path, data),
    }),
  };
  return {
    firestore: Object.assign(() => db, {
      FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' },
    }),
  };
}

test('provider costs and budgets are explicit', () => {
  assert.equal(PROVIDER_COSTS.autocomplete, 1);
  assert.equal(PROVIDER_COSTS.bilingualResolution, 2);
  assert.equal(PROVIDER_COSTS.localityResolution, 3);
  assert.equal(PROVIDER_COSTS.fullResolution, 5);
  assert.equal(MINUTE_MAXIMUM, 30);
  assert.equal(DAY_MAXIMUM, 120);
  assert.equal(PROVIDER_BUDGET_VERSION, 6);
  assert.deepEqual(PROVIDER_CALLABLE_LIMITS, { concurrency: 4, maxInstances: 1 });
  assert.deepEqual(PROVIDER_ROUTE_CALLABLE_LIMITS, { concurrency: 4, maxInstances: 1 });
});

test('provider bucket resets only after its window', () => {
  assert.deepEqual(bucketState({ used: 48, windowStartedAtMs: 1_000 }, 30_000, 60_000), {
    used: 48,
    windowStartedAtMs: 1_000,
  });
  assert.deepEqual(bucketState({ used: 48, windowStartedAtMs: 1_000 }, 61_000, 60_000), {
    used: 0,
    windowStartedAtMs: 61_000,
  });
});

test('provider identities are stable and do not expose UIDs', () => {
  const principal = providerPrincipal('private-user-id', 'test-key');
  assert.equal(principal, providerPrincipal('private-user-id', 'test-key'));
  assert.equal(principal.includes('private-user-id'), false);
});

test('provider budget enforces the minute limit', async () => {
  const admin = fakeAdmin();
  const auth = { uid: 'user-one' };
  await consumeProviderBudget({
    admin,
    auth,
    action: 'bilingualResolution',
    units: 15,
    key: 'test-key',
    now: 1_000,
  });
  await assert.rejects(
    consumeProviderBudget({
      admin,
      auth,
      action: 'autocomplete',
      key: 'test-key',
      now: 2_000,
    }),
    /request limit reached/
  );
});

test('provider budget enforces the daily limit across minute windows', async () => {
  const admin = fakeAdmin();
  const auth = { uid: 'user-one' };
  for (let minute = 0; minute < 4; minute += 1) {
    await consumeProviderBudget({
      admin,
      auth,
      action: 'bilingualResolution',
      units: 15,
      key: 'test-key',
      now: 1_000 + minute * 60_000,
    });
  }
  await assert.rejects(
    consumeProviderBudget({
      admin,
      auth,
      action: 'localityResolution',
      units: 1,
      key: 'test-key',
      now: 1_000 + 4 * 60_000,
    }),
    /Daily Google request limit reached/
  );
});

test('provider budget allows a normal place-selection session', async () => {
  const admin = fakeAdmin();
  const auth = { uid: 'user-one' };
  for (let query = 0; query < 5; query += 1) {
    await consumeProviderBudget({
      admin, auth, action: 'autocomplete', key: 'test-key', now: 1_000 + query,
    });
  }
  await consumeProviderBudget({
    admin, auth, action: 'bilingualResolution', key: 'test-key', now: 2_000,
  });
  await consumeProviderBudget({
    admin, auth, action: 'localityResolution', key: 'test-key', now: 3_000,
  });
  await consumeProviderBudget({
    admin, auth, action: 'bilingualResolution', key: 'test-key', now: 4_000,
  });
  await consumeProviderBudget({
    admin, auth, action: 'localityResolution', key: 'test-key', now: 5_000,
  });
});

test('provider budget supports at least ten complete exact-place sessions per day', async () => {
  const admin = fakeAdmin();
  const auth = { uid: 'beta-user' };
  for (let session = 0; session < 10; session += 1) {
    const now = 1_000 + session * 61_000;
    await consumeProviderBudget({ admin, auth, action: 'autocomplete', key: 'test-key', now });
    await consumeProviderBudget({ admin, auth, action: 'bilingualResolution', key: 'test-key', now });
    await consumeProviderBudget({ admin, auth, action: 'localityResolution', key: 'test-key', now });
  }
});
