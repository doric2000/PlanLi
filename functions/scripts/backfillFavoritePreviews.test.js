const test = require('node:test');
const assert = require('node:assert/strict');

const {
  inspectRecommendationFavorites,
  parseArgs,
  resolveRecommendationTarget,
} = require('./backfillFavoritePreviews');

test('favorite preview backfill is dry-run unless --apply is explicit', () => {
  assert.deepEqual(parseArgs([]), {
    apply: false,
    limit: Number.POSITIVE_INFINITY,
  });
  assert.deepEqual(parseArgs(['--apply', '--limit', '30']), {
    apply: true,
    limit: 30,
  });
});

test('recommendation favorites resolve canonical and legacy shapes', () => {
  assert.deepEqual(resolveRecommendationTarget({
    type: 'recommendation',
    target: { type: 'recommendation', id: 'one', path: 'recommendations/one' },
  }), {
    status: 'known',
    target: { type: 'recommendation', id: 'one', path: 'recommendations/one' },
  });
  assert.equal(resolveRecommendationTarget({ type: 'city', id: 'city' }), null);
  assert.equal(resolveRecommendationTarget({ type: 'recommendations' }).status, 'malformed');
});

test('backfill reports missing sources and only writes in apply mode', async () => {
  const writes = [];
  const documents = new Map([
    ['recommendations/live', {
      exists: true,
      data: () => ({
        title: 'Food market',
        categoryId: 'food',
        category: 'אוכל',
        updatedAt: 'updated',
      }),
    }],
  ]);
  const firestore = {
    doc: (path) => ({ path }),
    getAll: async (...refs) => refs.map((ref) => {
      const document = documents.get(ref.path);
      return { ref, exists: document?.exists || false, data: document?.data || (() => ({})) };
    }),
    batch: () => ({
      update: (ref, data) => writes.push({ path: ref.path, data }),
      commit: async () => {},
    }),
  };
  const records = [
    {
      ref: { path: 'users/u1/favorites/live' },
      data: { type: 'recommendation', target: { type: 'recommendation', id: 'live' } },
    },
    {
      ref: { path: 'users/u1/favorites/missing' },
      data: { type: 'recommendations', id: 'missing' },
    },
  ];
  const log = { warn: () => {} };

  const dryRun = await inspectRecommendationFavorites({ firestore, records, log });
  assert.equal(dryRun.ready, 1);
  assert.equal(dryRun.missing, 1);
  assert.equal(dryRun.updated, 0);
  assert.deepEqual(writes, []);

  const applied = await inspectRecommendationFavorites({ firestore, records, apply: true, log });
  assert.equal(applied.updated, 1);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].data.preview.categoryId, 'food');
  assert.equal(writes[0].data.preview.category, 'אוכל');
});
