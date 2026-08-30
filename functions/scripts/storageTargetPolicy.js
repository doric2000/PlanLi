const ACTIVE_MEDIA_BUCKET = 'planli-f0b12-media-eu';
const ROLLBACK_MEDIA_BUCKET = 'planli-f0b12.firebasestorage.app';

function normalizeBucket(value) {
  return String(value || '').trim().replace(/^gs:\/\//u, '').replace(/\/$/u, '');
}

function assertActiveMediaBucket(value) {
  const bucket = normalizeBucket(value);
  if (bucket !== ACTIVE_MEDIA_BUCKET) {
    throw new Error(`Only the active PlanLi media bucket ${ACTIVE_MEDIA_BUCKET} is allowed.`);
  }
  return bucket;
}

function assertStorageMigrationPair(sourceValue, targetValue) {
  const source = normalizeBucket(sourceValue);
  const target = normalizeBucket(targetValue);
  if (source !== ROLLBACK_MEDIA_BUCKET || target !== ACTIVE_MEDIA_BUCKET) {
    throw new Error(
      `Storage migration is restricted to ${ROLLBACK_MEDIA_BUCKET} -> ${ACTIVE_MEDIA_BUCKET}.`
    );
  }
  return { source, target };
}

function isApprovedPlanLiMediaBucket(value) {
  const bucket = normalizeBucket(value);
  return bucket === ACTIVE_MEDIA_BUCKET || bucket === ROLLBACK_MEDIA_BUCKET;
}

module.exports = {
  ACTIVE_MEDIA_BUCKET,
  ROLLBACK_MEDIA_BUCKET,
  assertActiveMediaBucket,
  assertStorageMigrationPair,
  isApprovedPlanLiMediaBucket,
  normalizeBucket,
};
