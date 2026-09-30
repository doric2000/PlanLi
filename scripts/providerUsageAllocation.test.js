const test = require('node:test');
const assert = require('node:assert/strict');
const { allocationRecords, summarize, execute, digest, CONFIRM } = require('./providerUsageAllocation');
const { SKU_ALLOWANCES } = require('../functions/providerUsagePolicy');
const { PRICE_CEILINGS } = require('./providerUsageBudget');
const manifest = () => ({ schemaVersion: 1, projectId: 'planli-f0b12', period: '2026-09',
  billingAccount: 'billingAccounts/SYNTHETIC', evidenceSha256: 'a'.repeat(64), observedAt: '2026-09-30T08:00:00Z',
  rolloutDeadline: '2026-09-30T20:00:00Z', accountingMode: 'full-price-ils',
  budget: { totalMicros: 75000000, otherServicesReserveMicros: 46000000, otherServicesForecastMicros: 45240000,
    forecastEvidenceSha256: 'b'.repeat(64), priceEvidenceSha256: 'c'.repeat(64), pricesCheckedAt: '2026-09-30T07:00:00Z' },
  skus: Object.fromEntries(Object.keys(SKU_ALLOWANCES).map((sku) => [sku,
    { projectUsedUpperBound: 30, reportingAndRolloutReserve: 20, limit: 100, unitPriceMicros: PRICE_CEILINGS[sku] }])) });

test('allocation subtracts historical use and rollout gap at full prices within ILS 75', () => {
  const rows = allocationRecords(manifest());
  assert.equal(rows[0].baselineUsed, 50);
  assert.equal(rows[0].limit, 100);
  const unsafe = manifest(); unsafe.skus.autocomplete.limit = 9000;
  assert.throws(() => allocationRecords(unsafe), /exceed/);
  delete unsafe.skus.geocoding;
  assert.throws(() => allocationRecords(unsafe), /every/);
});
test('reuse preserves reservations and refuses replacement or corrupt counters', () => {
  const expected = allocationRecords(manifest())[0];
  assert.equal(summarize([{ expected, current: { ...expected, reserved: 42 } }])[0].reserved, 42);
  assert.throws(() => summarize([{ expected, current: { ...expected, approvalSha256: 'b'.repeat(64) } }]), /never reset/);
  assert.throws(() => summarize([{ expected, current: { ...expected, reserved: -1 } }]), /never reset/);
});
test('dry-run performs no writes; apply gates evidence, state and expiration', async () => {
  let writes = 0;
  const m = manifest();
  const db = { doc: (path) => path, getAll: async (...refs) => refs.map(() => ({ data: () => undefined })),
    runTransaction: async () => { writes++; } };
  const preview = await execute({ db, manifest: m });
  assert.equal(writes, 0);
  await assert.rejects(execute({ db, manifest: m, apply: true }), /hashes/);
  await assert.rejects(execute({ db, manifest: m, apply: true, manifestHash: digest(m), stateHash: preview.stateSha256,
    confirm: CONFIRM, now: Date.parse('2026-10-02') }), /expired/);
  assert.equal(writes, 0);
});

test('budget refuses understated prices, stale evidence, insufficient reserve and hidden prior usage', () => {
  for (const alter of [
    m => { m.skus.autocomplete.unitPriceMicros = 1; },
    m => { m.budget.pricesCheckedAt = '2026-09-29T07:00:00Z'; },
    m => { m.budget.otherServicesReserveMicros = 0; },
    m => { m.budget.totalMicros = 100000000; },
    m => { m.skus.detailsAtmosphere.projectUsedUpperBound = 1000; },
  ]) { const m = manifest(); alter(m); assert.throws(() => allocationRecords(m)); }
});
