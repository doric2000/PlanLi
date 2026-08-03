const test = require('node:test');
const assert = require('node:assert/strict');
const admin = require('firebase-admin');
const {
  isMalformedTimestamp,
  parseArgs,
  repairDocumentData,
} = require('./repairMalformedTimestamps');

test('timestamp repair is dry-run unless apply is explicit', () => {
  assert.equal(parseArgs([]).apply, false);
  assert.equal(parseArgs(['--apply']).apply, true);
});

test('only the exact recoverable legacy timestamp shape is accepted', () => {
  assert.equal(isMalformedTimestamp({ _seconds: 123, _nanoseconds: 456 }), true);
  assert.equal(isMalformedTimestamp({ _seconds: 123 }), false);
  assert.equal(isMalformedTimestamp({ _seconds: 123, _nanoseconds: -1 }), false);
  assert.equal(isMalformedTimestamp({ _seconds: 123, _nanoseconds: 0, other: true }), false);
});

test('document repair restores timestamps without changing unrelated values', () => {
  const originalTimestamp = new admin.firestore.Timestamp(999, 0);
  const input = {
    createdAt: { _seconds: 123, _nanoseconds: 456 },
    nested: {
      updatedAt: { _seconds: 789, _nanoseconds: 0 },
      label: 'unchanged',
    },
    originalTimestamp,
  };

  const result = repairDocumentData(input);

  assert.equal(result.repaired, 2);
  assert.deepEqual(Object.keys(result.updates).sort(), ['createdAt', 'nested']);
  assert.ok(result.updates.createdAt instanceof admin.firestore.Timestamp);
  assert.equal(result.updates.createdAt.seconds, 123);
  assert.equal(result.updates.createdAt.nanoseconds, 456);
  assert.equal(result.updates.nested.label, 'unchanged');
  assert.equal(result.updates.nested.updatedAt.seconds, 789);
  assert.equal(input.originalTimestamp, originalTimestamp);
});
