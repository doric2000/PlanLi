const test = require('node:test');
const assert = require('node:assert/strict');
const {
  manifestEntry,
  parseArgs,
  rewriteBucketReferences,
  sameChecksum,
} = require('./migrateStorageToEurope');

test('storage migration is dry-run by default and has explicit regional buckets', () => {
  const options = parseArgs([]);
  assert.equal(options.apply, false);
  assert.equal(options.createTarget, false);
  assert.equal(options.restoreSource, false);
  assert.equal(options.source, 'planli-f0b12.firebasestorage.app');
  assert.equal(options.target, 'planli-f0b12-media-eu');
});

test('rollback source restoration requires an explicit flag', () => {
  const options = parseArgs(['--restore-source', '--apply', '--resume']);
  assert.equal(options.restoreSource, true);
  assert.equal(options.apply, true);
  assert.equal(options.resume, true);
});

test('Firestore bucket URL rewriting preserves document structure', () => {
  const result = rewriteBucketReferences({
    media: [{ url: 'https://firebasestorage.googleapis.com/v0/b/planli-us/o/a.jpg' }],
    untouched: 'hello',
  }, 'planli-us', 'planli-eu');
  assert.equal(result.changed, true);
  assert.equal(result.value.media[0].url.includes('/b/planli-eu/'), true);
  assert.equal(result.value.untouched, 'hello');
});

test('storage checksum requires size and a matching strong checksum', () => {
  assert.equal(sameChecksum(
    { size: '10', crc32c: 'abc' },
    { size: '10', crc32c: 'abc' }
  ), true);
  assert.equal(sameChecksum(
    { size: '10', crc32c: 'abc' },
    { size: '11', crc32c: 'abc' }
  ), false);
});

test('manifest retains media metadata needed by Firebase downloads', () => {
  const entry = manifestEntry({
    name: 'media/u/a/feed.webp',
    metadata: {
      size: '42',
      crc32c: 'crc',
      contentType: 'image/webp',
      metadata: { firebaseStorageDownloadTokens: 'token', ownerUid: 'u' },
    },
  });
  assert.equal(entry.name, 'media/u/a/feed.webp');
  assert.equal(entry.customMetadata.firebaseStorageDownloadTokens, 'token');
  assert.equal(entry.customMetadata.ownerUid, 'u');
});
