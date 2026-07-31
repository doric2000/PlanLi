const test = require('node:test');
const assert = require('node:assert/strict');

const {
  canonicalAssetComplete,
  deterministicAssetId,
  parseArgs,
  parseStorageUrl,
} = require('./migrateCanonicalMedia');

test('canonical migration is dry-run by default and accepts explicit buckets', () => {
  const options = parseArgs([
    '--source-bucket',
    'gs://planli-us',
    '--target-bucket',
    'planli-eu',
    '--limit',
    '25',
  ]);
  assert.equal(options.apply, false);
  assert.equal(options.sourceBucket, 'planli-us');
  assert.equal(options.targetBucket, 'planli-eu');
  assert.equal(options.limit, 25);
});

test('deterministic asset IDs are stable UUIDs', () => {
  const source = { bucket: 'old', objectPath: 'images/u1/photo.jpg' };
  const first = deterministicAssetId(
    source,
    'u1',
    'recommendation',
    'recommendations/r1/0'
  );
  const second = deterministicAssetId(
    source,
    'u1',
    'recommendation',
    'recommendations/r1/0'
  );
  assert.equal(first, second);
  assert.match(
    first,
    /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  );
});

test('storage URLs resolve bucket and decoded object path', () => {
  assert.deepEqual(
    parseStorageUrl(
      'https://firebasestorage.googleapis.com/v0/b/old-bucket/o/images%2Fu1%2Fa.jpg?alt=media'
    ),
    { bucket: 'old-bucket', objectPath: 'images/u1/a.jpg' }
  );
});

test('canonical asset check rejects mixed or wrong-region paths', () => {
  const assetId = '123e4567-e89b-52d3-a456-426614174000';
  const asset = {
    assetId,
    large: {
      path: `media/u1/${assetId}/large.webp`,
      url: 'https://firebasestorage.googleapis.com/v0/b/planli-eu/o/large',
    },
    feed: {
      path: `media/u1/${assetId}/feed.webp`,
      url: 'https://firebasestorage.googleapis.com/v0/b/planli-eu/o/feed',
    },
    thumb: {
      path: `media/u1/${assetId}/thumb.webp`,
      url: 'https://firebasestorage.googleapis.com/v0/b/planli-eu/o/thumb',
    },
  };
  assert.equal(canonicalAssetComplete(asset, 'u1', 'planli-eu'), true);
  assert.equal(canonicalAssetComplete(asset, 'u2', 'planli-eu'), false);
  assert.equal(canonicalAssetComplete(asset, 'u1', 'planli-us'), false);
});

