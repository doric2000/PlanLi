#!/usr/bin/env node
'use strict';
const { SKU_ALLOWANCES, SKU_LIMIT_CEILINGS } = require('../functions/providerUsagePolicy');
const { PRICE_CEILINGS, proposeLimits } = require('./providerUsageBudget');

// Public catalog rates in ILS, checked 2026-09-30 for the SKUs actually billed
// to eur3/europe-west1. No free tier/CPU credits are subtracted in this model.
const RATES = Object.freeze({
  read: 0.000001782, write: 0.000005348, cpuSecond: 0.000071308,
  gibSecond: 0.000007427, invocation: 0.000001188, imageGib: 0.356543999,
  storageGibMonth: 0.059423999, classA: 0.000014855, classB: 0.000001188,
});
function forecast({ users = 200, days = 31, imagesPerUserDay = 40, imageKiB = 200,
  readsPerUserDay = 200, writesPerUserDay = 10, callsPerUserDay = 40,
  cpuSecondsPerCall = 0.35, memoryGib = 0.5, newStoredGib = 15,
  publicationsPerDay = 10, photosPerPublication = 3, mediaCpuSeconds = 3,
  fixedAndOtherIls = 10, uncertainty = 0.2, allocation = null, assignedFreeUnits = null } = {}) {
  const inputs = { users, days, imagesPerUserDay, imageKiB, readsPerUserDay, writesPerUserDay,
    callsPerUserDay, cpuSecondsPerCall, memoryGib, newStoredGib, publicationsPerDay, photosPerPublication,
    mediaCpuSeconds, fixedAndOtherIls, uncertainty };
  if (Object.values(inputs).some((n) => !Number.isFinite(n) || n < 0) || days > 31) throw new Error('Invalid forecast assumptions.');
  const userDays = users * days;
  const ceilings = SKU_LIMIT_CEILINGS;
  const capacity = allocation || Object.fromEntries(Object.keys(ceilings).map((sku) => [sku, 0]));
  if (Object.keys(capacity).sort().join(',') !== Object.keys(ceilings).sort().join(',')
    || Object.keys(ceilings).some((sku) => !Number.isSafeInteger(capacity[sku]) || capacity[sku] < 0 || capacity[sku] > ceilings[sku])) {
    throw new Error('Invalid allocated remaining capacity.');
  }
  if (assignedFreeUnits && (Object.keys(assignedFreeUnits).sort().join(',') !== Object.keys(ceilings).sort().join(',')
    || Object.keys(ceilings).some(sku => !Number.isSafeInteger(assignedFreeUnits[sku])
      || assignedFreeUnits[sku] < 0 || assignedFreeUnits[sku] > Math.floor(SKU_ALLOWANCES[sku] * 0.9)))) {
    throw new Error('Invalid assigned free allowance.');
  }
  // Bound the incremental meter cost, allowing five transaction reads per
  // admitted SKU. Repeated denied attempts are NOT bounded by these ceilings.
  const reservations = Object.values(capacity).reduce((a, b) => a + b, 0);
  const imageGib = userDays * imagesPerUserDay * imageKiB / 1048576;
  const calls = userDays * callsPerUserDay;
  const publications = publicationsPerDay * days;
  const photos = publications * photosPerPublication;
  const costs = {
    firestore: userDays * (readsPerUserDay * RATES.read + writesPerUserDay * RATES.write),
    providerCounter: reservations * (5 * RATES.read + RATES.write),
    functions: calls * (RATES.invocation + cpuSecondsPerCall * (RATES.cpuSecond + memoryGib * RATES.gibSecond)),
    imageTransfer: imageGib * RATES.imageGib,
    imageReads: userDays * imagesPerUserDay * RATES.classB,
    newStorage: newStoredGib * RATES.storageGibMonth,
    publishing: publications * 20 * RATES.write + photos * (4 * RATES.classA + RATES.invocation
      + mediaCpuSeconds * (RATES.cpuSecond + memoryGib * RATES.gibSecond)),
    fixedAndOther: fixedAndOtherIls,
  };
  const modeledIls = Object.values(costs).reduce((a, b) => a + b, 0);
  const otherServicesIls = modeledIls * (1 + uncertainty);
  const mapsUpperBoundIls = Object.entries(capacity).reduce((sum, [sku, count]) => sum
    + Math.max(0, count - (assignedFreeUnits?.[sku] || 0)) * PRICE_CEILINGS[sku], 0) / 1000000;
  const totalIls = otherServicesIls + mapsUpperBoundIls;
  return { assumptions: inputs, ratesAsOf: '2026-09-30', ratesCurrency: 'ILS',
    allocationProvided: Boolean(allocation), accountingMode: assignedFreeUnits ? 'free-plus-paid-ils' : 'full-price-ils',
    imageGib, costs, otherServicesIls, mapsUpperBoundIls, totalIls, budgetIls: 75,
    budgetPass: totalIls <= 75, launchApproved: false,
    capacity: { autocompleteAttempts: capacity.autocomplete,
      bilingualProSessionsAtMost: Math.floor(Math.min(capacity.detailsAtmosphere, capacity.detailsPro) / 2),
      selectionEssentialsAttempts: capacity.detailsEssentials, reverseGeocodeAttempts: capacity.geocoding,
      routeChunks: capacity.routesEssentials },
  };
}
function freeAwareScenario(assumptions = {}) {
  const allocation = { ...SKU_LIMIT_CEILINGS, detailsAtmosphere: 1030 };
  const assignedFreeUnits = Object.fromEntries(Object.entries(SKU_ALLOWANCES).map(([sku, n]) => [sku, Math.floor(n * 0.9)]));
  const estimate = forecast({ ...assumptions, allocation, assignedFreeUnits });
  const otherServicesReserveIls = Math.ceil(estimate.otherServicesIls);
  return { allocation, assignedFreeUnits, otherServicesReserveIls,
    combinedReservedIls: otherServicesReserveIls + estimate.mapsUpperBoundIls, estimate,
    assumptionsVerified: false };
}
function sharedBudgetScenario(assumptions = {}) {
  // Reserve a whole ILS above the modeled non-Maps cost; this also covers the
  // small additional counter cost. Verify again with the proposed allocation.
  let reserveMicros = Math.min(75000000, Math.ceil(forecast(assumptions).otherServicesIls) * 1000000);
  let plan = proposeLimits({ otherServicesReserveMicros: reserveMicros });
  let estimate = forecast({ ...assumptions, allocation: plan.limits });
  if (estimate.otherServicesIls * 1000000 > reserveMicros) {
    reserveMicros = Math.min(75000000, Math.ceil(estimate.otherServicesIls) * 1000000);
    plan = proposeLimits({ otherServicesReserveMicros: reserveMicros });
    estimate = forecast({ ...assumptions, allocation: plan.limits });
  }
  return { otherServicesReserveIls: reserveMicros / 1000000, plan, estimate };
}
if (require.main === module) console.log(JSON.stringify({
  notice: 'Forecasts, not measured behavior or allocation approval. Free-aware scenario assumes 90% account free headroom. Full-price scenario is a stress case. No live allocation has been created.',
  browsing: forecast(),
  photoHeavy: forecast({ imagesPerUserDay: 200, imageKiB: 600, readsPerUserDay: 800, callsPerUserDay: 80 }),
  sharedBudget: sharedBudgetScenario(),
  freeAware: freeAwareScenario(),
}, null, 2));
module.exports = { forecast, sharedBudgetScenario, freeAwareScenario, RATES };
