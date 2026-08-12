const test = require('node:test');
const assert = require('node:assert/strict');

const {
  missingDestinationEntries,
  parseOptions,
} = require('./repairMissingDestinationImages');

function document(id, data) {
  return { id, data: () => data };
}

test('missing destination repair is dry-run by default and accepts explicit targets', () => {
  const options = parseOptions(['--city', 'city-a', '--city', 'city-b', '--limit', '2']);
  assert.equal(options.apply, false);
  assert.deepEqual([...options.cityIds], ['city-a', 'city-b']);
  assert.equal(options.limit, 2);
  assert.equal(parseOptions(['--apply']).apply, true);
});

test('missing destination repair selects only active targeted cities without thumbnails', () => {
  const snapshot = { docs: [
    document('city-a', { status: 'active' }),
    document('city-b', { status: 'active', destinationImage: { urls: { thumb: 'https://image' } } }),
    document('city-c', { status: 'inactive' }),
  ] };
  assert.deepEqual(
    missingDestinationEntries(snapshot, new Set(['city-a', 'city-b'])).map((entry) => entry.id),
    ['city-a']
  );
});

test('missing destination repair rejects unsafe limits', () => {
  assert.throws(() => parseOptions(['--limit', '0']), /between 1 and 100/);
  assert.throws(() => parseOptions(['--limit', '101']), /between 1 and 100/);
});
