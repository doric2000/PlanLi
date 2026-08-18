const test = require('node:test');
const assert = require('node:assert/strict');

const { parseArgs } = require('./quarantineLegacyMedia');
const fs = require('node:fs');
const path = require('node:path');

test('legacy media quarantine is allowlisted, bounded, and dry-run by default', () => {
  assert.deepEqual(parseArgs(['--prefix', 'recommendations']), {
    all: false,
    apply: false,
    bucket: 'planli-f0b12-media-eu',
    limit: 100,
    pageToken: null,
    prefix: 'recommendations',
  });
  assert.equal(parseArgs(['--prefix', 'routes', '--limit', '999']).limit, 100);
  assert.equal(parseArgs(['--prefix', 'optimized', '--all']).all, true);
  assert.equal(parseArgs(['--prefix', 'trips', '--apply']).apply, true);
  assert.throws(() => parseArgs(['--prefix', 'media']), /prefix/);
});

test('legacy media quarantine dry-run reuses listing metadata', () => {
  const source = fs.readFileSync(path.join(__dirname, 'quarantineLegacyMedia.js'), 'utf8');
  assert.match(source, /const metadata = file\.metadata \|\| \{\}/);
  assert.doesNotMatch(source, /file\.getMetadata\(/);
  assert.match(source, /setFileAvailability\(file, false, metadata\)/);
});
