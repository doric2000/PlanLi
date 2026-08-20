const test = require('node:test');
const assert = require('node:assert/strict');
const { plannedHebrewRepair, run } = require('./repairDestinationHebrewNames');

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

test('repair dry-run previews canonical and linked updates without starting a job', async () => {
  const destination = document({
    status: 'active',
    googleCache: { names: { he: 'Sa Pa', en: 'Sa Pa' }, countryCode: 'VN' },
  }, 'countries/VN/destinations/sa-pa');
  const countQuery = (count) => ({
    where: () => countQuery(count),
    count: () => ({ get: async () => ({ data: () => ({ count }) }) }),
  });
  const db = {
    collectionGroup: () => ({
      where: () => ({ get: async () => ({ size: 1, docs: [destination] }) }),
    }),
    collection: (name) => countQuery(name === 'recommendations' ? 1 : name === 'routes' ? 2 : 0),
  };
  let starts = 0;
  const result = await run({
    apply: false,
    adminImpl: { firestore: () => db },
    initialize: () => {},
    startRename: async () => { starts += 1; },
  });
  assert.equal(result.mode, 'dry-run');
  assert.equal(result.repairCount, 1);
  assert.deepEqual(result.plannedUpdates[0], {
    countryId: 'VN', cityId: 'sa-pa', nameHe: 'סאפה', source: 'override',
    linked: { recommendations: 1, routes: 2, trips: 0 },
  });
  assert.equal(starts, 0);
});
