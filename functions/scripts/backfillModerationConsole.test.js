const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseArgs,
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
  const db = {
    doc(path) {
      if (path === 'routes/route-1') {
        return { get: async () => ({ data: () => ({ activeRevisionId: 'rev-2' }) }) };
      }
      return { path };
    },
  };
  const entry = {
    ref: { path: 'routes/route-1/revisions/rev-1/days/day-1/stops/stop-1' },
    data: () => ({ place: { name: 'Old place' } }),
  };
  const change = await searchProjectionChange(db, entry);
  assert.equal(change.delete, true);
  assert.match(change.ref.path, /^system\/moderation\/search\//u);
});
