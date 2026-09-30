const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { assertCallableAppCheckFresh } = require('./callableAppCheck');

test('Firestore create guarantees one admission across independent clients and keeps the ledger private',
  { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async (t) => {
    assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^127\.0\.0\.1:\d+$/);
    const projectId = 'demo-planli-appcheck-ledger';
    const apps = ['one', 'two'].map((name) => initializeApp({ projectId }, `ledger-${name}`));
    t.after(() => Promise.all(apps.map(deleteApp)));
    const dbs = apps.map((app) => getFirestore(app));
    const request = { app: { appId: 'synthetic', alreadyConsumed: false,
      token: { iss: 'synthetic-issuer', sub: 'synthetic', jti: crypto.randomUUID(),
        exp: Math.floor(Date.now() / 1000) + 300 } } };
    const options = { enforceAppCheck: true, consumeAppCheckToken: true };
    const dependencies = dbs.map((db) => ({ admin: { firestore: () => db }, log: () => {} }));
    const outcomes = await Promise.allSettled(Array.from({ length: 20 }, (_, index) =>
      assertCallableAppCheckFresh(request, options, dependencies[index % 2])));
    assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 1);
    for (const r of outcomes.filter((r) => r.status === 'rejected')) {
      assert.equal(r.reason.details.reason, 'APP_CHECK_REPLAYED');
    }
    const records = await dbs[0].collection('system/runtime/appCheckConsumedTokens').get();
    assert.equal(records.size, 1);
    const [record] = records.docs;
    assert.deepEqual(Object.keys(record.data()), ['expireAt']);
    assert.equal(record.data().expireAt.toMillis(), request.app.token.exp * 1000 + 300000);
    const clientRead = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${projectId}/databases/(default)/documents/${record.ref.path}`);
    assert.equal(clientRead.status, 403);
    request.app.alreadyConsumed = true;
    request.app.token.jti = crypto.randomUUID();
    await assert.rejects(assertCallableAppCheckFresh(request, options, dependencies[0]),
      (e) => e.details.reason === 'APP_CHECK_REPLAYED');
    request.app.alreadyConsumed = false;
    await assert.rejects(assertCallableAppCheckFresh(request, options, dependencies[1]),
      (e) => e.details.reason === 'APP_CHECK_REPLAYED');
  });
