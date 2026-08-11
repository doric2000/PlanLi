const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DAY_MAXIMUM,
  MINUTE_MAXIMUM,
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
  assert.equal(PROVIDER_COSTS.bilingualResolution, 12);
  assert.equal(MINUTE_MAXIMUM, 60);
  assert.equal(DAY_MAXIMUM, 600);
  assert.deepEqual(PROVIDER_CALLABLE_LIMITS, { concurrency: 10, maxInstances: 10 });
  assert.deepEqual(PROVIDER_ROUTE_CALLABLE_LIMITS, { concurrency: 4, maxInstances: 5 });
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
    units: 5,
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
  for (let minute = 0; minute < 10; minute += 1) {
    await consumeProviderBudget({
      admin,
      auth,
      action: 'bilingualResolution',
      units: 5,
      key: 'test-key',
      now: 1_000 + minute * 60_000,
    });
  }
  await assert.rejects(
    consumeProviderBudget({
      admin,
      auth,
      action: 'autocomplete',
      key: 'test-key',
      now: 1_000 + 10 * 60_000,
    }),
    /Daily Google request limit reached/
  );
});
