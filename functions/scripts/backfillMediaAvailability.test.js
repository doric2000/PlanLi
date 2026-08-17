const test = require('node:test');
const assert = require('node:assert/strict');

const { parseArgs } = require('./backfillMediaAvailability');

test('media availability backfill is scoped, bounded, and dry-run by default', () => {
  assert.deepEqual(parseArgs(['--collection', 'recommendations']), {
    apply: false,
    after: null,
    bucket: 'planli-f0b12-media-eu',
    collection: 'recommendations',
    limit: 100,
  });
  assert.throws(() => parseArgs(['--collection', 'system']), /collection/);
  assert.equal(parseArgs(['--collection', 'users', '--limit', '999']).limit, 100);
});
