const MANAGED_MEDIA_ROOTS = ['media/'];

function isManagedMediaPath(value) {
  return (
    typeof value === 'string' &&
    MANAGED_MEDIA_ROOTS.some((root) => value.startsWith(root))
  );
}

function collectManagedMediaPaths(data) {
  const paths = new Set();
  const addPath = (value) => {
    if (isManagedMediaPath(value)) {
      paths.add(value);
    }
  };
  const addAsset = (asset) => {
    if (!asset || typeof asset !== 'object') return;
    addPath(asset.path);
    addPath(asset.large?.path);
    addPath(asset.feed?.path);
    addPath(asset.thumb?.path);
  };

  addAsset(data?.photoMedia);
  if (Array.isArray(data?.media)) data.media.forEach(addAsset);

  return paths;
}

/**
 * Migration descriptors deliberately retain the original object under source.path.
 * These paths are protected from cleanup without making source objects candidates
 * for deletion on later document changes.
 */
function collectRetainedSourcePaths() {
  return new Set();
}

function buildAllowedMediaPrefixes(collectionName, documentId, data) {
  if (collectionName === 'users') {
    return [`media/${documentId}`];
  }

  const ownerUid = data?.ownerId;
  if (!ownerUid || typeof ownerUid !== 'string') return [];
  return [`media/${ownerUid}`];
}

function isWithinAllowedPrefix(objectPath, allowedPrefixes) {
  if (!Array.isArray(allowedPrefixes) || allowedPrefixes.length === 0) {
    return false;
  }

  return allowedPrefixes.some(
    (prefix) => objectPath === prefix || objectPath.startsWith(`${prefix}/`)
  );
}

function isMissingStorageObject(error) {
  if (Array.isArray(error)) {
    return error.length > 0 && error.every(isMissingStorageObject);
  }
  if (!error || typeof error !== 'object') return false;
  if ([error.code, error.statusCode, error.response?.statusCode, error.response?.status]
    .some((code) => Number(code) === 404)) return true;
  if (Array.isArray(error.errors) && error.errors.length) {
    return error.errors.every((entry) => entry?.reason === 'notFound' || Number(entry?.code) === 404);
  }
  return false;
}

async function removeManagedMediaPaths(admin, paths, { bucketName } = {}) {
  if (!paths.size) return;
  const bucket = admin.storage().bucket(bucketName);
  await Promise.all(
    Array.from(paths).map(async (objectPath) => {
      try {
        await bucket.file(objectPath).delete({ ignoreNotFound: true });
      } catch (error) {
        if (isMissingStorageObject(error)) return;
        console.warn(`Failed to clean storage object ${objectPath}:`, error?.message || error);
        // Let the Firestore trigger retry transient Storage failures.
        throw error;
      }
    })
  );
}

async function cleanupRemovedMedia(
  admin,
  before,
  after,
  { allowedPrefixes = [], bucketName } = {}
) {
  const beforePaths = collectManagedMediaPaths(before);
  const afterPaths = collectManagedMediaPaths(after);
  const retainedSourcePaths = collectRetainedSourcePaths(after);
  const removed = new Set(
    Array.from(beforePaths).filter(
      (objectPath) =>
        !afterPaths.has(objectPath) &&
        !retainedSourcePaths.has(objectPath) &&
        isWithinAllowedPrefix(objectPath, allowedPrefixes)
    )
  );
  await removeManagedMediaPaths(admin, removed, { bucketName });
}

module.exports = {
  buildAllowedMediaPrefixes,
  cleanupRemovedMedia,
  collectManagedMediaPaths,
  collectRetainedSourcePaths,
  isWithinAllowedPrefix,
  isMissingStorageObject,
  removeManagedMediaPaths,
};
