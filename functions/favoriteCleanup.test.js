const test = require('node:test');
const assert = require('node:assert/strict');

const {
  FAVORITE_TYPES,
  buildDeletedFavoriteQuery,
  deleteFavoritesForItem,
} = require('./favoriteCleanup');

function createQueryRecorder() {
  const filters = [];
  let selectedLimit = null;
  const query = {
    where(field, operator, value) {
      filters.push([field, operator, value]);
      return this;
    },
    limit(value) {
      selectedLimit = value;
      return this;
    },
  };
  return {
    firestore: {
      collectionGroup(name) {
        assert.equal(name, 'favorites');
        return query;
      },
    },
    filters,
    getLimit: () => selectedLimit,
  };
}

function createPagedFirestore(pageSizes) {
  const pages = [...pageSizes];
  const deletedRefs = [];
  let commits = 0;
  const query = {
    where() {
      return this;
    },
    limit() {
      return this;
    },
    async get() {
      const size = pages.shift() || 0;
      const docs = Array.from({ length: size }, (_, index) => ({
        ref: { path: `users/u-${pages.length}/favorites/f-${index}` },
      }));
      return { docs, empty: size === 0, size };
    },
  };
  return {
    firestore: {
      collectionGroup: () => query,
      batch: () => ({
        delete: (ref) => deletedRefs.push(ref.path),
        commit: async () => {
          commits += 1;
        },
      }),
    },
    deletedRefs,
    getCommits: () => commits,
  };
}

test('favorite cleanup query scopes ordinary content by type and id', () => {
  const recorder = createQueryRecorder();
  buildDeletedFavoriteQuery(
    recorder.firestore,
    {
      type: FAVORITE_TYPES.recommendation,
      itemId: 'rec-1',
    },
    25
  );

  assert.deepEqual(recorder.filters, [
    ['type', '==', 'recommendations'],
    ['id', '==', 'rec-1'],
  ]);
  assert.equal(recorder.getLimit(), 25);
});

test('city cleanup also scopes by country to avoid same-name collisions', () => {
  const recorder = createQueryRecorder();
  buildDeletedFavoriteQuery(recorder.firestore, {
    type: FAVORITE_TYPES.city,
    itemId: 'Springfield',
    countryId: 'US',
  });

  assert.deepEqual(recorder.filters, [
    ['type', '==', 'cities'],
    ['id', '==', 'Springfield'],
    ['countryId', '==', 'US'],
  ]);
});

test('cleanup deletes popular content in bounded batches and is idempotent', async () => {
  const paged = createPagedFirestore([400, 17, 0]);
  const result = await deleteFavoritesForItem({
    firestore: paged.firestore,
    type: FAVORITE_TYPES.route,
    itemId: 'route-1',
  });

  assert.deepEqual(result, { deleted: 417, batches: 2 });
  assert.equal(paged.deletedRefs.length, 417);
  assert.equal(paged.getCommits(), 2);

  const repeat = createPagedFirestore([0]);
  assert.deepEqual(
    await deleteFavoritesForItem({
      firestore: repeat.firestore,
      type: FAVORITE_TYPES.route,
      itemId: 'route-1',
    }),
    { deleted: 0, batches: 0 }
  );
});

test('cleanup rejects unsupported or incomplete targets', () => {
  const recorder = createQueryRecorder();
  assert.throws(
    () =>
      buildDeletedFavoriteQuery(recorder.firestore, {
        type: 'future-type',
        itemId: 'item-1',
      }),
    /Unsupported/
  );
  assert.throws(
    () =>
      buildDeletedFavoriteQuery(recorder.firestore, {
        type: FAVORITE_TYPES.city,
        itemId: 'Ariel',
      }),
    /countryId/
  );
});
