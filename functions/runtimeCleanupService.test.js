const test = require('node:test');
const assert = require('node:assert/strict');

const { RUNTIME_COLLECTIONS, cleanupExpiredCollection } = require('./runtimeCleanupService');

test('runtime cleanup covers public/provider limiters and private place sessions', () => {
  assert.deepEqual(RUNTIME_COLLECTIONS, [
    'system/runtime/publicRateLimits',
    'system/runtime/providerRateLimits',
    'system/runtime/providerGlobalLimits',
    'system/runtime/placeSearchSessions',
    'system/runtime/resolvedPlaceTokens',
  ]);
});

test('place sessions and resolved tokens use their actual expiresAt field', async () => {
  for (const path of [
    'system/runtime/placeSearchSessions',
    'system/runtime/resolvedPlaceTokens',
  ]) {
    let field;
    const query = {
      where: (value) => { field = value; return query; },
      limit: () => query,
      get: async () => ({ empty: true, size: 0, docs: [] }),
    };
    await cleanupExpiredCollection({ collection: () => query }, path, new Date(0), 1);
    assert.equal(field, 'expiresAt');
  }
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
