const { collectCanonicalMediaAssets, FINAL_PATH_PATTERN } = require('./mediaProcessor');

const ACTIVE_CACHE_CONTROL = 'public,max-age=300,must-revalidate';
const HELD_CACHE_CONTROL = 'private,max-age=0,no-store';
const METADATA_UPDATE_ATTEMPTS = 3;
const METADATA_RETRY_DELAYS_MS = [25, 75];

function isNotFound(error) {
  return error?.code === 404 || error?.code === '404';
}

function isMetagenerationConflict(error) {
  const status = error?.code ?? error?.response?.statusCode;
  return status === 412 || status === '412'
    || (Array.isArray(error?.errors) && error.errors.some((entry) => (
      entry?.reason === 'conditionNotMet' || entry?.reason === 'preconditionFailed'
    )));
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function updateVariant(file, available, knownMetadata = null) {
  let metadata = knownMetadata;
  for (let attempt = 0; attempt < METADATA_UPDATE_ATTEMPTS; attempt += 1) {
    if (!metadata) {
      try {
        [metadata] = await file.getMetadata();
      } catch (error) {
        if (isNotFound(error)) return;
        throw error;
      }
    }
    if (!metadata) return;
    const custom = metadata.metadata || {};
    const publicTokens = custom.firebaseStorageDownloadTokens || null;
    const preservedTokens = custom.planliOriginalDownloadTokens || null;
    try {
      await file.setMetadata({
        cacheControl: available ? ACTIVE_CACHE_CONTROL : HELD_CACHE_CONTROL,
        metadata: {
          ...custom,
          firebaseStorageDownloadTokens: available ? preservedTokens || publicTokens : null,
          planliOriginalDownloadTokens: available ? null : preservedTokens || publicTokens,
          availability: available ? 'active' : 'held',
        },
      }, metadata.metageneration ? {
        ifMetagenerationMatch: Number(metadata.metageneration),
      } : undefined);
      return;
    } catch (error) {
      if (!isMetagenerationConflict(error) || attempt === METADATA_UPDATE_ATTEMPTS - 1) {
        throw error;
      }
      metadata = null;
      await wait(METADATA_RETRY_DELAYS_MS[attempt] || METADATA_RETRY_DELAYS_MS.at(-1));
    }
  }
}

async function setMediaAvailability({
  admin,
  data,
  mediaBucket,
  available,
  reason = null,
}) {
  if (!mediaBucket) return { assets: 0, variants: 0 };
  const assets = collectCanonicalMediaAssets(data);
  if (!assets.length) return { assets: 0, variants: 0 };
  const bucket = admin.storage().bucket(mediaBucket);
  const db = admin.firestore();
  let processedAssets = 0;
  let variants = 0;
  for (const asset of assets) {
    const assetId = asset.assetId.toLowerCase();
    let ownerUid = null;
    const paths = ['large', 'feed', 'thumb'].flatMap((variant) => {
      const path = asset?.[variant]?.path;
      const match = typeof path === 'string' ? path.match(FINAL_PATH_PATTERN) : null;
      if (!match || match[2].toLowerCase() !== assetId || match[3].toLowerCase() !== variant) {
        return [];
      }
      if (ownerUid && ownerUid !== match[1]) return [];
      ownerUid = match[1];
      return [path];
    });
    if (!paths.length || !ownerUid) continue;
    processedAssets += 1;
    await Promise.all(paths.map(async (path) => {
      await updateVariant(bucket.file(path), available);
      variants += 1;
    }));
    await db.doc(`system/media/assets/${assetId}`).set({
      assetId,
      ownerUid,
      status: available ? 'active' : 'held',
      reason: available ? null : reason,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  return { assets: processedAssets, variants };
}

function removedCanonicalMediaAssets(before, after) {
  const descriptor = (asset) => JSON.stringify({
    assetId: String(asset?.assetId || '').toLowerCase(),
    paths: ['large', 'feed', 'thumb'].map((variant) => asset?.[variant]?.path || null),
  });
  const afterDescriptors = new Set(collectCanonicalMediaAssets(after).map(descriptor));
  return collectCanonicalMediaAssets(before).filter(
    (asset) => !afterDescriptors.has(descriptor(asset))
  );
}

module.exports = {
  ACTIVE_CACHE_CONTROL,
  HELD_CACHE_CONTROL,
  removedCanonicalMediaAssets,
  setFileAvailability: updateVariant,
  setMediaAvailability,
};
