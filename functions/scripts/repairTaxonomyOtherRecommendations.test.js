const test = require('node:test');
const assert = require('node:assert/strict');

const {
  canonicalMediaDescriptor,
  fingerprint,
  parseArgs,
} = require('./repairTaxonomyOtherRecommendations');

test('repair command is dry-run by default and requires explicit apply inputs', () => {
  assert.deepEqual(parseArgs([]), {
    apply: false, confirmation: null, expectedFingerprint: null,
  });
  assert.deepEqual(parseArgs([
    '--apply', '--confirm', 'ACTIVATE_TAXONOMY_OTHER', '--fingerprint', 'abc',
  ]), {
    apply: true, confirmation: 'ACTIVATE_TAXONOMY_OTHER', expectedFingerprint: 'abc',
  });
});

test('repair accepts only canonical owner media descriptors', () => {
  const ownerId = 'owner-1';
  const assetId = 'bd3315ba-9ef9-4f93-95e0-1c426ef6015b';
  const asset = {
    assetId,
    large: { path: `media/${ownerId}/${assetId}/large.webp` },
    feed: { path: `media/${ownerId}/${assetId}/feed.webp` },
    thumb: { path: `media/${ownerId}/${assetId}/thumb.webp` },
  };
  assert.deepEqual(canonicalMediaDescriptor(asset, ownerId), {
    assetId,
    paths: [asset.large.path, asset.feed.path, asset.thumb.path],
  });
  assert.equal(canonicalMediaDescriptor({ ...asset, thumb: { path: 'foreign/thumb.webp' } }, ownerId), null);
});

test('repair fingerprint changes when the validated candidate set changes', () => {
  const first = [{ path: 'recommendations/one', updateTime: 'one', valid: true, failures: [] }];
  const second = [{ path: 'recommendations/one', updateTime: 'two', valid: true, failures: [] }];
  assert.notEqual(fingerprint(first), fingerprint(second));
  assert.equal(fingerprint(first), fingerprint(first));
});
