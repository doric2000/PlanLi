const test = require('node:test');
const assert = require('node:assert/strict');
const { forecast, sharedBudgetScenario, freeAwareScenario } = require('./providerUsageForecast');
const { SKU_ALLOWANCES } = require('../functions/providerUsagePolicy');
test('unknown allocation gives zero Maps capacity and never implies launch approval', () => {
  const result = forecast();
  assert.equal(result.allocationProvided, false);
  assert.equal(result.capacity.bilingualProSessionsAtMost, 0);
  assert.equal(result.launchApproved, false);
  assert(result.budgetPass);
});
test('photo-heavy 200-user scenario exceeds budget; counter and bilingual requests are included', () => {
  assert(forecast({ imagesPerUserDay: 200, imageKiB: 600 }).totalIls > 75);
  const allocation = Object.fromEntries(Object.entries(SKU_ALLOWANCES).map(([sku, n]) => [sku, Math.floor(n * 0.9)]));
  const result = forecast({ allocation });
  assert.equal(result.capacity.bilingualProSessionsAtMost, 450);
  assert(result.costs.providerCounter > 0);
  assert(result.mapsUpperBoundIls > 0);
  assert.equal(result.budgetPass, false); // Free-tier ceilings are not free capacity.
  assert.throws(() => forecast({ users: NaN }), /Invalid/);
});

test('Maps can exceed ILS 15 while the complete modeled budget stays within ILS 75', () => {
  const result = sharedBudgetScenario();
  assert(result.estimate.mapsUpperBoundIls > 15);
  assert(result.estimate.totalIls <= 75);
  assert(result.estimate.otherServicesIls <= result.otherServicesReserveIls);
  const heavy = sharedBudgetScenario({ imagesPerUserDay: 200, imageKiB: 600 });
  assert.equal(heavy.estimate.mapsUpperBoundIls, 0);
  assert.equal(heavy.estimate.budgetPass, false);
});

test('free-aware forecast includes every counter reservation and does not reuse the smaller stress-case Cloud reserve', () => {
  const result = freeAwareScenario();
  assert.equal(result.allocation.autocomplete, 350 * 31);
  assert.equal(result.allocation.detailsAtmosphere, 1030);
  assert.equal(result.otherServicesReserveIls, 47);
  assert.equal(result.estimate.mapsUpperBoundIls, 27.73454);
  assert.equal(result.combinedReservedIls, 74.73454);
  assert(result.estimate.costs.providerCounter > sharedBudgetScenario().estimate.costs.providerCounter);
  assert(result.estimate.otherServicesIls <= result.otherServicesReserveIls);
  assert.equal(result.assumptionsVerified, false);
  assert.throws(() => forecast({ assignedFreeUnits: { autocomplete: 10000 } }), /free allowance/);
});
