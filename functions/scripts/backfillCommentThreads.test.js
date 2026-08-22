const test = require('node:test');
const assert = require('node:assert/strict');

const { canonicalRootPatch, parseArgs } = require('./backfillCommentThreads');

test('comment thread migration is dry-run unless apply is explicit', () => {
  assert.deepEqual(parseArgs([]), { apply: false, limit: Number.POSITIVE_INFINITY });
  assert.deepEqual(parseArgs(['--apply', '--limit', '25']), { apply: true, limit: 25 });
});

test('legacy comments become canonical roots while canonical threads are skipped', () => {
  const legacy = { id: 'comment-1', data: () => ({ status: 'active' }) };
  const patch = canonicalRootPatch(legacy);
  assert.deepEqual({ ...patch, threadMigratedAt: undefined }, {
    threadType: 'root',
    threadRootId: 'comment-1',
    replyToCommentId: null,
    replyCount: 0,
    threadMigratedAt: undefined,
  });
  assert.ok(patch.threadMigratedAt);
  const canonical = {
    id: 'comment-1',
    data: () => ({
      threadType: 'root',
      threadRootId: 'comment-1',
      replyToCommentId: null,
      replyCount: 0,
    }),
  };
  assert.equal(canonicalRootPatch(canonical), null);
  const canonicalReply = {
    id: 'reply-1',
    data: () => ({
      threadType: 'reply',
      threadRootId: 'comment-1',
      replyToCommentId: 'comment-1',
      replyCount: 0,
    }),
  };
  assert.equal(canonicalRootPatch(canonicalReply), null);
});
