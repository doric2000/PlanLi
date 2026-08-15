const test = require('node:test');
const assert = require('node:assert/strict');
const { parseArgs } = require('./backfillCommentStatus');

test('comment status migration is dry-run unless apply is explicit', () => {
  assert.deepEqual(parseArgs([]), { apply: false, limit: Number.POSITIVE_INFINITY });
  assert.deepEqual(parseArgs(['--apply', '--limit', '25']), { apply: true, limit: 25 });
});
