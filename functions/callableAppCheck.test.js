const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { assertCallableAppCheckFresh } = require('./callableAppCheck');

function boundary(options = {}, onCallFactory = (effective, handler) => ({ effective, handler })) {
  const source = fs.readFileSync(require.resolve('./index'), 'utf8');
  const wrapper = source.slice(source.indexOf('function callable('), source.indexOf('\nasync function consumePublicRequest'));
  const calls = { authorize: 0, normalize: 0, handler: 0, logs: [] };
  const context = {
    CALLABLE_OPTIONS: { enforceAppCheck: true }, admin: {},
    onCall: onCallFactory,
    assertCallableAppCheckFresh: (request, effective) =>
      assertCallableAppCheckFresh(request, effective, (...args) => calls.logs.push(args)),
    normalizeCallableInput: (data) => { calls.normalize++; return data; },
    authorizeRequest: async ({ auth }) => {
      calls.authorize++;
      if (!auth) throw new Error('AUTH_REQUIRED');
      return { uid: auth.uid };
    },
  };
  vm.createContext(context);
  vm.runInContext(wrapper, context);
  const fn = context.callable({ access: 'active', ...options }, async (request, access) => {
    calls.handler++;
    return { data: request.data, uid: access.uid };
  });
  return typeof fn === 'function' ? { handler: fn, calls } : { ...fn, calls };
}

test('consumed tokens cannot reach normalization, auth reads or business writes', async () => {
  const { handler, calls } = boundary({ consumeAppCheckToken: true });
  await assert.rejects(handler({ app: { alreadyConsumed: true }, auth: { uid: 'test' }, data: {} }),
    (error) => error.code === 'permission-denied' && error.details.reason === 'APP_CHECK_REPLAYED');
  assert.deepEqual(calls, { authorize: 0, normalize: 0, handler: 0,
    logs: [['app_check_rejected', { reason: 'APP_CHECK_REPLAYED' }]] });
});

test('a fresh limited-use token preserves authorized handler results', async () => {
  const { handler, calls } = boundary({ consumeAppCheckToken: true });
  const result = await handler({ app: { alreadyConsumed: false }, auth: { uid: 'test' }, data: { value: 1 } });
  assert.equal(result.uid, 'test');
  assert.equal(result.data.value, 1);
  assert.equal(calls.authorize, 1);
  assert.equal(calls.handler, 1);
  assert.equal(calls.logs.length, 0);
});

test('valid App Check does not bypass authentication', async () => {
  const { handler, calls } = boundary({ consumeAppCheckToken: true });
  await assert.rejects(handler({ app: { alreadyConsumed: false }, data: {} }), /AUTH_REQUIRED/);
  assert.equal(calls.handler, 0);
});

test('ordinary reusable tokens and unenforced rollout behavior are unchanged', async () => {
  for (const options of [{}, { consumeAppCheckToken: false }]) {
    const { handler, calls } = boundary(options);
    await handler({ auth: { uid: 'test' }, data: {} });
    assert.equal(calls.handler, 1);
    assert.equal(calls.logs.length, 0);
  }
});

test('consumed SDK context cannot be overridden by attacker payload fields', async () => {
  const { handler, calls } = boundary({ consumeAppCheckToken: true });
  await assert.rejects(handler({ app: { alreadyConsumed: true }, auth: { uid: 'test' },
    data: { app: { alreadyConsumed: false }, alreadyConsumed: false } }),
  (error) => error.details.reason === 'APP_CHECK_REPLAYED');
  assert.equal(calls.handler, 0);
});

test('real callable HTTP boundary rejects missing, forged, expired and replayed tokens', async (t) => {
  const { initializeApp, deleteApp } = require('firebase-admin/app');
  const { getAuth } = require('firebase-admin/auth');
  const { getAppCheck } = require('firebase-admin/app-check');
  const { onCall } = require('firebase-functions/v2/https');
  const express = require('express');
  const app = initializeApp({ projectId: 'demo-planli-appcheck-boundary' });
  t.after(() => deleteApp(app));
  t.mock.method(getAuth(app), 'verifyIdToken', async () => ({ uid: 'test-user' }));
  const consumed = new Set();
  t.mock.method(getAppCheck(app), 'verifyToken', async (token, options) => {
    if (token === 'forged' || token === 'expired') throw new Error('Synthetic token verification failure');
    const alreadyConsumed = consumed.has(token);
    if (options?.consume) consumed.add(token);
    return { appId: 'test-app', alreadyConsumed };
  });
  const { handler, calls } = boundary({ consumeAppCheckToken: true, cors: false }, onCall);
  const serverApp = express();
  serverApp.use(express.json());
  serverApp.post('/', handler);
  const server = await new Promise((resolve) => { const instance = serverApp.listen(0, '127.0.0.1', () => resolve(instance)); });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const invoke = async (token) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-auth',
        ...(token ? { 'X-Firebase-AppCheck': token } : {}) }, body: JSON.stringify({ data: {} }) });
    return { status: response.status, body: await response.json() };
  };
  for (const token of [undefined, 'forged', 'expired']) {
    const result = await invoke(token);
    assert.equal(result.status, 401);
    assert.equal(calls.handler, 0);
    assert.equal(calls.authorize, 0);
  }
  assert.equal((await invoke('fresh-token')).status, 200);
  assert.equal(calls.handler, 1);
  const replay = await invoke('fresh-token');
  assert.equal(replay.status, 403);
  assert.equal(replay.body.error.details.reason, 'APP_CHECK_REPLAYED');
  assert.equal(calls.handler, 1);
  assert.equal(calls.authorize, 1);
  assert.equal((await invoke('different-fresh-token')).status, 200);
  assert.equal(calls.handler, 2);
});
