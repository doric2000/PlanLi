const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CONTAINING_PLACES_PRO_MONTHLY_LIMIT,
  DESTINATION_AUTOCOMPLETE_TYPES,
  consumeContainingPlacesProBudget,
  monthKey,
  provisionalDestinationKind,
  provisionalRegistryId,
} = require('./destinationResolutionPolicy');

test('provisional registry identities are stable and country scoped', () => {
  const first = provisionalRegistryId('IL', 'place-one');
  assert.equal(first, provisionalRegistryId('il', 'place-one'));
  assert.notEqual(first, provisionalRegistryId('IT', 'place-one'));
  assert.match(first, /^il-provisional-[a-z0-9_-]+$/);
});

test('provisional destination kind follows explicit area types', () => {
  assert.equal(provisionalDestinationKind(['island', 'natural_feature']), 'island');
  assert.equal(provisionalDestinationKind(['archipelago', 'natural_feature']), 'island');
  assert.equal(provisionalDestinationKind(['administrative_area_level_1']), 'province');
  assert.equal(provisionalDestinationKind(['natural_feature']), 'natural_feature');
  assert.equal(provisionalDestinationKind(['national_park', 'park']), 'natural_feature');
  assert.equal(provisionalDestinationKind(['colloquial_area']), 'tourism_region');
  assert.equal(provisionalDestinationKind(['locality', 'political']), 'city_hub');
});

test('destination search includes provider-backed islands, archipelagos, regions, and natural sites', () => {
  ['locality', 'island', 'archipelago', 'colloquial_area', 'natural_feature', 'national_park']
    .forEach((type) => assert.equal(DESTINATION_AUTOCOMPLETE_TYPES.has(type), true, type));
});

test('monthly Pro budget keys are stable UTC values', () => {
  assert.equal(monthKey(new Date('2026-08-31T23:59:59Z')), '202608');
  assert.equal(monthKey(new Date('2026-09-01T00:00:00Z')), '202609');
});

test('containing places Pro usage stops at the monthly safety cap', async () => {
  let usage = { count: CONTAINING_PLACES_PRO_MONTHLY_LIMIT - 1 };
  const ref = { path: 'system/runtime/providerUsage/containingPlacesPro_202608' };
  const db = {
    doc: () => ref,
    runTransaction: async (callback) => callback({
      get: async () => ({ exists: true, data: () => usage }),
      set: (_target, patch) => { usage = { ...usage, ...patch }; },
    }),
  };
  const firestore = Object.assign(() => db, {
    FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' },
  });
  const admin = { firestore };
  const now = new Date('2026-08-27T12:00:00Z');

  assert.equal(await consumeContainingPlacesProBudget(admin, now), true);
  assert.equal(usage.count, CONTAINING_PLACES_PRO_MONTHLY_LIMIT);
  assert.equal(await consumeContainingPlacesProBudget(admin, now), false);
  assert.equal(usage.count, CONTAINING_PLACES_PRO_MONTHLY_LIMIT);
});
