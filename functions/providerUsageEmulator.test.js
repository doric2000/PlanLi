const test = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { reserveProviderUsage } = require('./providerUsageService');
const { COLLECTION, billingMonth } = require('./providerUsagePolicy');

test('independent Firestore clients share an atomic limit and client access is denied',
  { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async (t) => {
    assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^127\.0\.0\.1:\d+$/);
    const projectId = 'demo-planli-provider-usage';
    const apps = ['one', 'two'].map((name) => initializeApp({ projectId }, `usage-${name}`));
    t.after(() => Promise.all(apps.map(deleteApp)));
    const dbs = apps.map((app) => getFirestore(app));
    const now = Date.parse('2026-09-20T14:00:00Z');
    const path = `${COLLECTION}/${billingMonth(now).period}_autocomplete`;
    await dbs[0].doc(path).set({ schemaVersion: 1, projectId, period: '2026-09', sku: 'autocomplete',
      approvalSha256: 'a'.repeat(64), baselineUsed: 97, reserved: 0, limit: 100 });
    const outcomes = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => reserveProviderUsage({
      url: 'https://places.googleapis.com/v1/places:autocomplete', options: { method: 'POST' },
      projectId, db: dbs[i % 2], now, log: () => {},
    })));
    assert.equal(outcomes.filter((result) => result.status === 'fulfilled').length, 3);
    assert.equal((await dbs[0].doc(path).get()).data().reserved, 3);
    const endpoint = `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${projectId}/databases/(default)/documents/${path}`;
    const token = ['eyJhbGciOiJub25lIn0', Buffer.from(JSON.stringify({ sub: 'synthetic-user', user_id: 'synthetic-user',
      aud: projectId, iss: `https://securetoken.google.com/${projectId}`, iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600, firebase: { sign_in_provider: 'password' } })).toString('base64url'), ''].join('.');
    for (const headers of [{}, { Authorization: `Bearer ${token}` }]) {
      assert.equal((await fetch(endpoint, { headers })).status, 403);
      assert.equal((await fetch(endpoint, { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { reserved: { integerValue: '0' } } }) })).status, 403);
    }
  });

test('allocation apply is atomic, reusable and never resets live reservations',
  { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async (t) => {
    assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^127\.0\.0\.1:\d+$/);
    const { execute, CONFIRM } = require('../scripts/providerUsageAllocation');
    const { SKU_ALLOWANCES } = require('./providerUsagePolicy');
    const { PRICE_CEILINGS } = require('../scripts/providerUsageBudget');
    const app = initializeApp({ projectId: 'demo-planli-provider-usage' }, 'usage-allocation');
    t.after(() => deleteApp(app));
    const db = getFirestore(app);
    const manifest = { schemaVersion: 1, projectId: 'planli-f0b12', period: '2026-10',
      billingAccount: 'billingAccounts/SYNTHETIC', evidenceSha256: 'b'.repeat(64),
      observedAt: '2026-09-30T08:00:00Z', rolloutDeadline: '2026-09-30T20:00:00Z', accountingMode: 'free-plus-paid-ils',
      freeUsage: { period: '2026-10', billingAccount: 'billingAccounts/SYNTHETIC',
        observedAt: '2026-09-30T08:00:00Z', evidenceSha256: 'e'.repeat(64), sharedUsageForecastAcknowledged: true },
      budget: { totalMicros: 75000000, otherServicesReserveMicros: 46000000, otherServicesForecastMicros: 45240000,
        forecastEvidenceSha256: 'c'.repeat(64), priceEvidenceSha256: 'd'.repeat(64), pricesCheckedAt: '2026-09-30T07:00:00Z' },
      skus: Object.fromEntries(Object.keys(SKU_ALLOWANCES).map((sku) => [sku,
        { projectUsedUpperBound: 30, reportingAndRolloutReserve: 20,
          limit: sku === 'autocomplete' ? 10850 : 100, unitPriceMicros: PRICE_CEILINGS[sku],
          assignedFreeUnits: Math.floor(SKU_ALLOWANCES[sku] * .9), otherProjectsUsageUpperBound: 0,
          sharedUsageReserve: Math.floor(SKU_ALLOWANCES[sku] * .1) }])) };
    const preview = await execute({ db, manifest });
    assert.equal(preview.actions.filter((row) => row.action === 'create').length, 7);
    const apply = (plan) => execute({ db, manifest, apply: true, confirm: CONFIRM,
      manifestHash: plan.manifestSha256, stateHash: plan.stateSha256, now: Date.parse('2026-09-30T12:00:00Z') });
    assert.equal((await apply(preview)).readBackVerified, true);
    const ref = db.doc(`${COLLECTION}/2026-10_autocomplete`);
    await ref.update({ reserved: 42 });
    const resumed = await execute({ db, manifest });
    assert.equal(resumed.actions.every((row) => row.action === 'reuse'), true);
    await apply(resumed);
    assert.equal((await ref.get()).data().reserved, 42);
    await assert.rejects(apply(preview), /hashes/);
    await ref.update({ limit: 1 });
    await assert.rejects(execute({ db, manifest }), /never reset/);
    assert.equal((await ref.get()).data().limit, 1);
  });
