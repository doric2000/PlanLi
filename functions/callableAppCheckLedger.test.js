const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assertCallableAppCheckFresh } = require('./callableAppCheck');

const NOW = 1800000000000;
const options = { enforceAppCheck: true, consumeAppCheckToken: true };
const request = (changes = {}) => ({ app: { appId: 'app', alreadyConsumed: false,
  token: { iss: 'issuer', sub: 'app', jti: 'one-token', exp: NOW / 1000 + 300 }, ...changes } });
function fixture() {
  const records = new Map(), logs = [];
  const admin = { firestore: () => ({ doc: (id) => ({ create: async (data) => {
    if (records.has(id)) throw Object.assign(new Error('Exists'), { code: 6 });
    records.set(id, data);
  } }) }) };
  const dependencies = { admin, now: NOW, log: (...args) => logs.push(args) };
  return { records, logs, dependencies, invoke: (value, opts = options) =>
    assertCallableAppCheckFresh(value, opts, dependencies) };
}
const replay = (error) => error.code === 'permission-denied' && error.details.reason === 'APP_CHECK_REPLAYED';

test('an inconsistent provider cannot admit a token again, including after an initial true', async () => {
  for (const sequence of [[false, false, false], [true, false], [false, true, false]]) {
    const f = fixture();
    for (let index = 0; index < sequence.length; index++) {
      const operation = f.invoke(request({ alreadyConsumed: sequence[index] }));
      if (index === 0 && sequence[index] === false) await operation;
      else await assert.rejects(operation, replay);
    }
    assert.equal(f.records.size, 1);
  }
});

test('concurrent requests share one create-only winner across handler instances', async () => {
  const f = fixture();
  const outcomes = await Promise.allSettled(Array.from({ length: 20 }, () =>
    assertCallableAppCheckFresh(request(), options, { ...f.dependencies })));
  assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 1);
  for (const result of outcomes.filter((r) => r.status === 'rejected')) assert.ok(replay(result.reason));
});

test('identity ignores endpoint, user, payload and raw JWT representation', async () => {
  const f = fixture();
  await f.invoke({ ...request(), auth: { uid: 'one' }, data: { action: 'deleteContent' } });
  await assert.rejects(f.invoke({ ...request(), auth: { uid: 'two' },
    rawRequest: { headers: { 'x-firebase-appcheck': 'different-encoding' } },
    data: { action: 'requestAccountDeletion', app: { token: { jti: 'attacker' } } } }), replay);
  const distinct = request(); distinct.app.token.jti = 'two-token';
  await f.invoke(distinct);
  assert.equal(f.records.size, 2);
  for (const [key, value] of f.records) {
    assert.match(key, /^system\/runtime\/appCheckConsumedTokens\/[a-f0-9]{64}$/);
    assert.deepEqual(Object.keys(value), ['expireAt']);
    assert.equal(value.expireAt.getTime(), NOW + 600000);
  }
});

test('malformed or missing verified identity fails closed without writes', async () => {
  const invalid = [request({ token: undefined }), request({ appId: '' }), request({ alreadyConsumed: undefined }), {}];
  for (const [field, values] of Object.entries({
    iss: ['', null, 4, 'x'.repeat(513)], jti: ['', null, {}, 'x'.repeat(513)],
    exp: [undefined, '1800000300', NaN, Infinity, NOW / 1000, 8640000000000], sub: ['other-app'],
  })) for (const value of values) { const item = request(); item.app.token[field] = value; invalid.push(item); }
  for (const item of invalid) {
    const f = fixture();
    await assert.rejects(f.invoke(item), (e) => e.details?.reason === 'APP_CHECK_REQUIRED');
    assert.equal(f.records.size, 0);
  }
});

test('datastore uncertainty cannot authorize work or disclose raw provider errors', async () => {
  for (const code of [4, 7, 14, 'unavailable', undefined]) {
    const logs = [];
    const admin = { firestore: () => ({ doc: () => ({ create: async () => {
      throw Object.assign(new Error('private provider detail'), { code });
    } }) }) };
    await assert.rejects(assertCallableAppCheckFresh(request(), options, { admin, now: NOW,
      log: (...args) => logs.push(args) }), (e) => e.code === 'unavailable'
      && e.details.reason === 'APP_CHECK_VERIFICATION_UNAVAILABLE' && !e.message.includes('private'));
    assert.deepEqual(logs, [['app_check_rejected', { reason: 'APP_CHECK_VERIFICATION_UNAVAILABLE' }]]);
  }
});

test('all repository duplicate-create error representations reject replay', async () => {
  for (const code of [6, '6', 'already-exists']) {
    const admin = { firestore: () => ({ doc: () => ({ create: async () => {
      throw Object.assign(new Error('Exists'), { code });
    } }) }) };
    await assert.rejects(assertCallableAppCheckFresh(request(), options,
      { admin, now: NOW, log: () => {} }), replay);
  }
});

test('unenforced emulator and ordinary reusable calls preserve their previous behavior', async () => {
  const f = fixture();
  await f.invoke({ app: { appId: 'debug', alreadyConsumed: false } }, { ...options, enforceAppCheck: false });
  await f.invoke({}, { ...options, consumeAppCheckToken: false });
  await assert.rejects(f.invoke(request({ alreadyConsumed: true }), { ...options, enforceAppCheck: false }), replay);
  assert.equal(f.records.size, 0);
});

test('ledger expiry has a TTL policy without an unnecessary field index', () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../firestore.indexes.json')));
  assert.deepEqual(config.fieldOverrides.filter((f) => f.collectionGroup === 'appCheckConsumedTokens'),
    [{ collectionGroup: 'appCheckConsumedTokens', fieldPath: 'expireAt', ttl: true, indexes: [] }]);
});
