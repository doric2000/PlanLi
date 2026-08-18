const test = require('node:test');
const assert = require('node:assert/strict');

const { parseArgs } = require('./backfillAccountModeration');

test('account moderation backfill is bounded and dry-run by default', () => {
  assert.deepEqual(parseArgs([]), { apply: false, after: null, limit: 100 });
  assert.deepEqual(parseArgs(['--apply', '--after', 'user-2', '--limit', '50']), {
    apply: true, after: 'user-2', limit: 50,
  });
  assert.equal(parseArgs(['--limit', '999']).limit, 100);
});
