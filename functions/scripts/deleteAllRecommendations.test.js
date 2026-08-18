const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CONFIRMATION,
  collectLegacyRecommendationObjects,
  fingerprintEntries,
  parseArgs,
} = require('./deleteAllRecommendations');

test('recommendation deletion is dry-run by default and apply requires explicit inputs', () => {
  assert.deepEqual(parseArgs([]), {
    apply: false,
    confirmation: null,
    expectedFingerprint: null,
    mediaBucket: 'planli-f0b12-media-eu',
  });
  assert.deepEqual(parseArgs([
    '--apply', '--confirm', CONFIRMATION, '--fingerprint', 'abc',
  ]), {
    apply: true,
    confirmation: CONFIRMATION,
    expectedFingerprint: 'abc',
    mediaBucket: 'planli-f0b12-media-eu',
  });
});

test('legacy cleanup accepts only the recommendation own Firebase Storage prefix', () => {
  const data = {
    images: [
      'https://firebasestorage.googleapis.com/v0/b/old-bucket/o/recommendations%2Frec-1%2Fphoto.jpg?alt=media',
      'https://firebasestorage.googleapis.com/v0/b/old-bucket/o/recommendations%2Fother%2Fphoto.jpg?alt=media',
      'https://example.com/photo.jpg',
    ],
  };
  assert.deepEqual(collectLegacyRecommendationObjects(data, 'rec-1'), [{
    bucket: 'old-bucket', objectPath: 'recommendations/rec-1/photo.jpg',
  }]);
});

test('recommendation fingerprint changes with IDs or update times', () => {
  const first = fingerprintEntries([{ id: 'rec-1', updateTime: 'one' }]);
  assert.equal(first, fingerprintEntries([{ id: 'rec-1', updateTime: 'one' }]));
  assert.notEqual(first, fingerprintEntries([{ id: 'rec-1', updateTime: 'two' }]));
});
