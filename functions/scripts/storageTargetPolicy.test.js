const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ACTIVE_MEDIA_BUCKET,
  ROLLBACK_MEDIA_BUCKET,
  assertActiveMediaBucket,
  assertStorageMigrationPair,
  isApprovedPlanLiMediaBucket,
} = require('./storageTargetPolicy');

test('destructive media tooling accepts only PlanLi exact buckets', () => {
  assert.equal(assertActiveMediaBucket(`gs://${ACTIVE_MEDIA_BUCKET}/`), ACTIVE_MEDIA_BUCKET);
  assert.deepEqual(
    assertStorageMigrationPair(ROLLBACK_MEDIA_BUCKET, ACTIVE_MEDIA_BUCKET),
    { source: ROLLBACK_MEDIA_BUCKET, target: ACTIVE_MEDIA_BUCKET }
  );
  assert.equal(isApprovedPlanLiMediaBucket(ROLLBACK_MEDIA_BUCKET), true);
  assert.equal(isApprovedPlanLiMediaBucket(ACTIVE_MEDIA_BUCKET), true);
  assert.equal(isApprovedPlanLiMediaBucket('attacker-controlled-bucket'), false);
  assert.throws(() => assertActiveMediaBucket('attacker-controlled-bucket'), /active PlanLi media bucket/);
  assert.throws(
    () => assertStorageMigrationPair(ROLLBACK_MEDIA_BUCKET, 'attacker-controlled-bucket'),
    /restricted/
  );
});
