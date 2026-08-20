const test = require('node:test');
const assert = require('node:assert/strict');
const { plannedHebrewRepair } = require('./repairDestinationHebrewNames');

function document(data, path = 'countries/AL/destinations/vlore') {
  return { data: () => data, ref: { path } };
}

test('Hebrew repair is idempotent for already localized destinations', () => {
  assert.equal(plannedHebrewRepair(document({
    googleCache: { names: { he: 'ולורה', en: 'Vlorë' }, countryCode: 'AL' },
  })), null);
});

test('Hebrew repair plans the vetted Vlorë override without provider work', () => {
  const plan = plannedHebrewRepair(document({
    googleCache: { names: { he: 'Vlorë', en: 'Vlorë' }, countryCode: 'AL' },
  }));
  assert.equal(plan.name, 'ולורה');
  assert.equal(plan.source, 'override');
  assert.equal(plan.state, 'repair');
});
