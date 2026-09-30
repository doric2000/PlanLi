'use strict';

const { SKU_ALLOWANCES, SKU_LIMIT_CEILINGS } = require('../functions/providerUsagePolicy');
const TOTAL_BUDGET_MICROS = 75000000; // ILS, before tax and external subscriptions.
// Highest paid tier from the ILS Cloud Billing Catalog, 2026-09-30,
// rounded UP to micro-shekels with a 10% pricing/FX buffer, AFTER free allocation.
const PRICE_CEILINGS = Object.freeze({
  autocomplete: 9250, detailsEssentials: 16342, detailsPro: 55562,
  detailsAtmosphere: 81708, geocoding: 16342, routesEssentials: 16342, routesPro: 32684,
});
const PRICE_AS_OF = '2026-09-30T07:00:00Z';
const integer = (n) => Number.isSafeInteger(n) && n >= 0;

function allocationBudget(manifest) {
  const budget = manifest.budget;
  const freeAware = manifest.accountingMode === 'free-plus-paid-ils';
  if ((!freeAware && manifest.accountingMode !== 'full-price-ils') || !budget
    || budget.totalMicros !== TOTAL_BUDGET_MICROS
    || !integer(budget.otherServicesReserveMicros) || budget.otherServicesReserveMicros === 0
    || !integer(budget.otherServicesForecastMicros)
    || budget.otherServicesReserveMicros < budget.otherServicesForecastMicros
    || budget.otherServicesReserveMicros > TOTAL_BUDGET_MICROS
    || !/^[a-f0-9]{64}$/.test(budget.forecastEvidenceSha256 || '')
    || !/^[a-f0-9]{64}$/.test(budget.priceEvidenceSha256 || '')
    || !Number.isFinite(Date.parse(budget.pricesCheckedAt))
    || Date.parse(budget.pricesCheckedAt) < Date.parse(PRICE_AS_OF)
    || Date.parse(budget.pricesCheckedAt) > Date.parse(manifest.observedAt)
    || Date.parse(manifest.rolloutDeadline) - Date.parse(budget.pricesCheckedAt) > 86400000) {
    throw new Error('Allocation needs a current price review and a reserved Cloud forecast within ILS 75.');
  }
  if (freeAware) {
    const evidence = manifest.freeUsage;
    if (!evidence || evidence.period !== manifest.period || evidence.billingAccount !== manifest.billingAccount
      || !/^[a-f0-9]{64}$/.test(evidence.evidenceSha256 || '')
      || !Number.isFinite(Date.parse(evidence.observedAt))
      || Date.parse(evidence.observedAt) > Date.parse(manifest.observedAt)
      || Date.parse(manifest.rolloutDeadline) - Date.parse(evidence.observedAt) > 86400000
      || evidence.sharedUsageForecastAcknowledged !== true) {
      throw new Error('Free allocation needs fresh account evidence and an explicit shared-usage forecast.');
    }
  }
  let mapsMicros = 0;
  for (const sku of Object.keys(SKU_ALLOWANCES)) {
    const row = manifest.skus?.[sku];
    if (!row || !integer(row.limit) || row.limit > SKU_LIMIT_CEILINGS[sku]
      || !integer(row.projectUsedUpperBound) || !integer(row.reportingAndRolloutReserve)
      || !integer(row.unitPriceMicros) || row.unitPriceMicros < PRICE_CEILINGS[sku]) {
      throw new Error(`Unsafe allocation: ${sku}.`);
    }
    const freeUnits = freeAware ? row.assignedFreeUnits : 0;
    if (freeAware && (!integer(freeUnits) || freeUnits > Math.floor(SKU_ALLOWANCES[sku] * 0.9)
      || !integer(row.otherProjectsUsageUpperBound) || !integer(row.sharedUsageReserve)
      || !integer(freeUnits + row.otherProjectsUsageUpperBound + row.sharedUsageReserve)
      || freeUnits + row.otherProjectsUsageUpperBound + row.sharedUsageReserve > SKU_ALLOWANCES[sku])) {
      throw new Error(`Shared free allocation exceeds evidenced headroom: ${sku}.`);
    }
    const baseline = row.projectUsedUpperBound + row.reportingAndRolloutReserve;
    const upper = Math.max(0, Math.max(baseline, row.limit) - freeUnits) * row.unitPriceMicros;
    if (!integer(baseline) || !integer(upper) || !integer(mapsMicros + upper)) throw new Error('Unsafe monetary total.');
    mapsMicros += upper;
  }
  if (mapsMicros + budget.otherServicesReserveMicros > TOTAL_BUDGET_MICROS) {
    throw new Error('Maps limits plus the Cloud reserve exceed ILS 75.');
  }
  return { accountingMode: manifest.accountingMode, sharedFreeUsageIsForecast: freeAware,
    totalMicros: TOTAL_BUDGET_MICROS, otherServicesReserveMicros: budget.otherServicesReserveMicros,
    mapsAvailableMicros: TOTAL_BUDGET_MICROS - budget.otherServicesReserveMicros, mapsUpperBoundMicros: mapsMicros };
}

// A transparent synthetic workload mix, not measured production demand.
// Operators can choose another mix; the allocation validator enforces the sum.
function proposeLimits({ otherServicesReserveMicros, baseline = {}, mix = {
  autocomplete: 8, detailsEssentials: 2, detailsPro: 2, detailsAtmosphere: 2,
  geocoding: 1, routesEssentials: 2, routesPro: 1,
} }) {
  if (!integer(otherServicesReserveMicros) || otherServicesReserveMicros > TOTAL_BUDGET_MICROS) throw new Error('Invalid reserve.');
  let priorCost = 0, mixCost = 0;
  for (const sku of Object.keys(PRICE_CEILINGS)) {
    if (!integer(baseline[sku] ?? 0) || !integer(mix[sku])) throw new Error('Invalid planning input.');
    priorCost += (baseline[sku] || 0) * PRICE_CEILINGS[sku];
    mixCost += mix[sku] * PRICE_CEILINGS[sku];
  }
  if (!integer(priorCost) || !integer(mixCost) || mixCost === 0) throw new Error('Invalid planning cost.');
  const blocks = Math.max(0, Math.floor((TOTAL_BUDGET_MICROS - otherServicesReserveMicros - priorCost) / mixCost));
  const limits = Object.fromEntries(Object.keys(PRICE_CEILINGS).map((sku) => [sku,
    Math.min(Math.floor(SKU_ALLOWANCES[sku] * 0.9), (baseline[sku] || 0) + blocks * mix[sku])]));
  return { blocks, limits, baselineCostMicros: priorCost, budgetAlreadyExceeded: priorCost + otherServicesReserveMicros > TOTAL_BUDGET_MICROS,
    mapsAvailableMicros: TOTAL_BUDGET_MICROS - otherServicesReserveMicros,
    mapsUpperBoundMicros: Object.entries(limits).reduce((sum, [sku, n]) => sum + Math.max(n, baseline[sku] || 0) * PRICE_CEILINGS[sku], 0) };
}

module.exports = { TOTAL_BUDGET_MICROS, PRICE_CEILINGS, PRICE_AS_OF, allocationBudget, proposeLimits };
