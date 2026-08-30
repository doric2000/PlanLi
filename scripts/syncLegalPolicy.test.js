const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeNewlines } = require('./syncLegalPolicy');

test('legal policy drift checks ignore Windows and Unix line-ending differences', () => {
  assert.equal(
    normalizeNewlines('first\r\nsecond\r\n'),
    normalizeNewlines('first\nsecond\n')
  );
});

test('legal policy drift checks still detect real content changes', () => {
  assert.notEqual(
    normalizeNewlines('terms-v1\r\n'),
    normalizeNewlines('terms-v2\n')
  );
});
