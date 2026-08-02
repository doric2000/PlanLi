const test = require('node:test');
const assert = require('node:assert/strict');

const {
  inspectFavoriteRecords,
  parseArgs,
  resolveFavoriteSourcePath,
} = require('./cleanupOrphanFavorites');

test('orphan favorite cleanup is dry-run unless --apply is explicit', () => {
  assert.deepEqual(parseArgs([]), {
    apply: false,
    limit: Number.POSITIVE_INFINITY,
  });
  assert.deepEqual(parseArgs(['--apply', '--limit', '25']), {
    apply: true,
    limit: 25,
  });
});

test('favorite types resolve to their authoritative document paths', () => {
  assert.deepEqual(
    resolveFavoriteSourcePath({ type: 'recommendations', id: 'rec-1' }),
    { status: 'known', path: 'recommendations/rec-1' }
  );
  assert.deepEqual(
    resolveFavoriteSourcePath({ type: 'routes', id: 'route-1' }),
    { status: 'known', path: 'routes/route-1' }
  );
  assert.deepEqual(
    resolveFavoriteSourcePath({
      type: 'cities',
      id: 'Springfield',
      countryId: 'US',
    }),
    { status: 'known', path: 'countries/US/cities/Springfield' }
  );
  assert.deepEqual(
    resolveFavoriteSourcePath({
      type: 'cities',
      id: 'Mykonos ',
      countryId: 'GR',
    }),
    { status: 'known', path: 'countries/GR/cities/Mykonos ' }
  );
  assert.equal(
    resolveFavoriteSourcePath({ type: 'future', id: 'item-1' }).status,
    'unknown'
  );
  assert.equal(
    resolveFavoriteSourcePath({ type: 'cities', id: 'Ariel' }).status,
    'malformed'
  );
});

test('inspection deletes only known favorites whose source is missing', async () => {
  const deleted = [];
  const existingPaths = new Set(['recommendations/live']);
  const firestore = {
    doc: (path) => ({ path }),
    getAll: async (...refs) =>
      refs.map((ref) => ({
        ref,
        exists: existingPaths.has(ref.path),
      })),
    batch: () => ({
      delete: (ref) => deleted.push(ref.path),
      commit: async () => {},
    }),
  };
  const records = [
    {
      ref: { path: 'users/u1/favorites/live' },
      data: { type: 'recommendations', id: 'live' },
    },
    {
      ref: { path: 'users/u2/favorites/gone' },
      data: { type: 'routes', id: 'gone' },
    },
    {
      ref: { path: 'users/u3/favorites/future' },
      data: { type: 'future', id: 'future' },
    },
  ];
  const log = { log: () => {}, warn: () => {} };

  const dryRun = await inspectFavoriteRecords({
    firestore,
    records,
    apply: false,
    log,
  });
  assert.deepEqual(dryRun, {
    scanned: 3,
    known: 2,
    malformed: 0,
    unknown: 1,
    orphaned: 1,
    deleted: 0,
  });
  assert.deepEqual(deleted, []);

  const applied = await inspectFavoriteRecords({
    firestore,
    records,
    apply: true,
    log,
  });
  assert.equal(applied.deleted, 1);
  assert.deepEqual(deleted, ['users/u2/favorites/gone']);
});
