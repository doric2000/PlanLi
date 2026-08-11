const test = require('node:test');
const assert = require('node:assert/strict');

const { RUNTIME_COLLECTIONS, cleanupExpiredCollection } = require('./runtimeCleanupService');

test('runtime cleanup covers public/provider limiters and private place sessions', () => {
  assert.deepEqual(RUNTIME_COLLECTIONS, [
    'system/runtime/publicRateLimits',
    'system/runtime/providerRateLimits',
    'system/runtime/placeSearchSessions',
  ]);
});

test('expired runtime cleanup deletes only the bounded query result', async () => {
  const deleted = [];
  const documents = [{ ref: { path: 'runtime/one' } }, { ref: { path: 'runtime/two' } }];
  const query = {
    where: () => query,
    limit: (value) => {
      assert.equal(value, 2);
      return query;
    },
    get: async () => ({ empty: false, size: documents.length, docs: documents }),
  };
  const db = {
    collection: (path) => {
      assert.equal(path, 'system/runtime/providerRateLimits');
      return query;
    },
    batch: () => ({
      delete: (ref) => deleted.push(ref.path),
      commit: async () => {},
    }),
  };
  const count = await cleanupExpiredCollection(
    db,
    'system/runtime/providerRateLimits',
    new Date(0),
    2
  );
  assert.equal(count, 2);
  assert.deepEqual(deleted, ['runtime/one', 'runtime/two']);
});
