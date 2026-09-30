const test = require('node:test');
const assert = require('node:assert/strict');
const { proposeLimits, PRICE_CEILINGS, allocationBudget } = require('./providerUsageBudget');
const { SKU_ALLOWANCES, SKU_LIMIT_CEILINGS, validUsageRecord } = require('../functions/providerUsagePolicy');

function freeManifest() {
  return { period: '2026-09', billingAccount: 'billingAccounts/SYNTHETIC',
    observedAt: '2026-09-30T08:00:00Z', rolloutDeadline: '2026-09-30T20:00:00Z',
    accountingMode: 'free-plus-paid-ils',
    freeUsage: { period: '2026-09', billingAccount: 'billingAccounts/SYNTHETIC',
      observedAt: '2026-09-30T07:30:00Z', evidenceSha256: 'a'.repeat(64), sharedUsageForecastAcknowledged: true },
    budget: { totalMicros: 75000000, otherServicesReserveMicros: 47000000, otherServicesForecastMicros: 46100000,
      forecastEvidenceSha256: 'b'.repeat(64), priceEvidenceSha256: 'c'.repeat(64), pricesCheckedAt: '2026-09-30T07:00:00Z' },
    skus: Object.fromEntries(Object.entries(SKU_ALLOWANCES).map(([sku, n]) => [sku, {
      limit: sku === 'detailsAtmosphere' ? 1030 : SKU_LIMIT_CEILINGS[sku],
      projectUsedUpperBound: 30, reportingAndRolloutReserve: 20, unitPriceMicros: PRICE_CEILINGS[sku],
      assignedFreeUnits: Math.floor(n * .9), otherProjectsUsageUpperBound: 10, sharedUsageReserve: Math.floor(n * .1) - 10,
    }])) };
}

test('free-aware allocation prices only overage and shares one monetary budget across SKUs', () => {
  const manifest = freeManifest();
  const result = allocationBudget(manifest);
  assert.equal(result.mapsUpperBoundMicros, 27734540);
  assert.equal(result.mapsAvailableMicros, 28000000);
  manifest.skus.detailsAtmosphere.limit = 1040;
  assert.throws(() => allocationBudget(manifest), /exceed/);
});

test('shared allowance cannot be duplicated, silently guessed, or evidenced for another account/month', () => {
  for (const alter of [
    m => { delete m.freeUsage; },
    m => { m.freeUsage.period = '2026-10'; },
    m => { m.freeUsage.billingAccount = 'billingAccounts/OTHER'; },
    m => { m.freeUsage.observedAt = '2026-09-29T01:00:00Z'; },
    m => { m.freeUsage.observedAt = '2026-09-30T09:00:00Z'; },
    m => { m.freeUsage.sharedUsageForecastAcknowledged = false; },
    m => { m.skus.autocomplete.otherProjectsUsageUpperBound = 1100; },
    m => { delete m.skus.autocomplete.assignedFreeUnits; },
    m => { m.skus.autocomplete.sharedUsageReserve = -1; },
    m => { m.skus.autocomplete.assignedFreeUnits = 10000; },
  ]) { const m = freeManifest(); alter(m); assert.throws(() => allocationBudget(m)); }
});

test('historical use cannot be hidden by reducing the new ceiling below the free allocation', () => {
  const m = freeManifest();
  m.skus.detailsAtmosphere.limit = 10;
  m.skus.detailsAtmosphere.projectUsedUpperBound = 2000;
  assert.throws(() => allocationBudget(m), /exceed/);
});

test('runtime accepts reviewed paid ceilings and still rejects malformed or excessive counters', () => {
  const expected = { sku: 'autocomplete', period: '2026-09', projectId: 'planli-f0b12' };
  const row = { ...expected, schemaVersion: 1, approvalSha256: 'a'.repeat(64), baselineUsed: 20, reserved: 30, limit: 10850 };
  assert(validUsageRecord(row, expected));
  assert.equal(validUsageRecord({ ...row, limit: 10851 }, expected), false);
  assert.equal(validUsageRecord({ ...row, reserved: Number.MAX_SAFE_INTEGER }, expected), false);
});

test('planning subtracts already-used units and keeps total priced limits inside the remaining budget', () => {
  const baseline = Object.fromEntries(Object.keys(PRICE_CEILINGS).map(sku => [sku, 20]));
  const result = proposeLimits({ otherServicesReserveMicros: 46000000, baseline });
  assert(result.mapsUpperBoundMicros <= 29000000);
  for (const sku of Object.keys(PRICE_CEILINGS)) assert(result.limits[sku] >= 20);
  assert(result.blocks < proposeLimits({ otherServicesReserveMicros: 46000000 }).blocks);
});

test('an already-exceeded budget grants no new capacity, and a lower cloud forecast can leave Maps more than half', () => {
  const full = proposeLimits({ otherServicesReserveMicros: 74000000, baseline: { detailsAtmosphere: 50 } });
  assert.equal(full.budgetAlreadyExceeded, true);
  assert.equal(full.blocks, 0);
  const smallerCloud = proposeLimits({ otherServicesReserveMicros: 20000000 });
  assert(smallerCloud.mapsUpperBoundMicros > 37500000);
  assert(smallerCloud.mapsUpperBoundMicros <= 55000000);
  assert.throws(() => proposeLimits({ otherServicesReserveMicros: -1 }));
});
