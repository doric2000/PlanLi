const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseArgs,
  runBackfill,
  searchProjectionChange,
  splitCursor,
  unitsForPhase,
} = require('./backfillModerationConsole');

test('moderation console backfill is dry-run and resumable by default', () => {
  assert.deepEqual(parseArgs([]), { apply: false, after: '', phase: 'all', limit: 200 });
  assert.deepEqual(splitCursor('search_comments:routes/r-1/comments/c-1'), {
    unitId: 'search_comments', documentId: 'routes/r-1/comments/c-1',
  });
  assert.ok(unitsForPhase('held').every((unit) => unit.kind === 'held'));
  assert.equal(parseArgs(['--apply', '--phase', 'search', '--limit', '25']).apply, true);
});

test('search backfill deletes projections from inactive route revisions', async () => {
  let projectionExists = true;
  const db = {
    doc(path) {
      if (path === 'routes/route-1') {
        return { get: async () => ({ exists: true, data: () => ({ activeRevisionId: 'rev-2' }) }) };
      }
      return { path, get: async () => ({ exists: projectionExists, data: () => ({}) }) };
    },
  };
  const entry = {
    ref: { path: 'routes/route-1/revisions/rev-1/days/day-1/stops/stop-1' },
    data: () => ({ place: { name: 'Old place' } }),
  };
  const change = await searchProjectionChange(db, entry);
  assert.equal(change.delete, true);
  assert.match(change.ref.path, /^system\/moderation\/search\//u);
  projectionExists = false;
  assert.equal(await searchProjectionChange(db, entry), null);
});

test('repeated search apply and dry-run do not rewrite equivalent projections', async () => {
  const source = {
    id: 'rec-1',
    ref: { path: 'recommendations/rec-1' },
    data: () => ({
      title: 'טיול בחיפה',
      ownerId: 'owner-1',
      status: 'active',
      updatedAt: 'source-time',
    }),
  };
  let projection = null;
  let writeCount = 0;
  const query = {
    orderBy: () => query,
    limit: () => query,
    startAfter: () => query,
    get: async () => ({ size: 1, docs: [source] }),
  };
  const db = {
    collection: () => query,
    doc(path) {
      return {
        path,
        get: async () => ({ exists: Boolean(projection), data: () => projection }),
      };
    },
    batch() {
      let pending = null;
      return {
        delete: () => assert.fail('an active source must not delete its projection'),
        set: (_ref, value) => { pending = value; },
        commit: async () => {
          projection = { ...pending, updatedAt: 'persisted-time' };
          writeCount += 1;
        },
      };
    },
  };

  const first = await runBackfill({ apply: true, phase: 'search', limit: 1, db });
  const dryRun = await runBackfill({ apply: false, phase: 'search', limit: 1, db });
  const secondApply = await runBackfill({ apply: true, phase: 'search', limit: 1, db });

  assert.equal(first.changed, 1);
  assert.equal(first.written, 1);
  assert.deepEqual({ changed: dryRun.changed, written: dryRun.written }, { changed: 0, written: 0 });
  assert.deepEqual({ changed: secondApply.changed, written: secondApply.written }, { changed: 0, written: 0 });
  assert.equal(writeCount, 1);
});
