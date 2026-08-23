const crypto = require('crypto');
const sharp = require('sharp');
const { HttpsError } = require('firebase-functions/v2/https');

const CACHE_CONTROL = 'public,max-age=300,must-revalidate';
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_SOURCE_PIXELS = 40 * 1000 * 1000;
const MEDIA_MINUTE_MAXIMUM = 6;
const MEDIA_DAY_MAXIMUM = 40;
const MEDIA_DAY_BYTES_MAXIMUM = 250 * 1024 * 1024;
const STAGING_PATH_PATTERN =
  /^media-staging\/([^/]+)\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.jpg$/i;
const FINAL_PATH_PATTERN =
  /^media\/([^/]+)\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/(large|feed|thumb)\.webp$/i;

const MEDIA_PRESETS = Object.freeze({
  recommendation: Object.freeze({
    square: true,
    variants: Object.freeze({
      large: Object.freeze({ width: 1600, height: 1600, quality: 90 }),
      feed: Object.freeze({ width: 1280, height: 1280, quality: 86 }),
      thumb: Object.freeze({ width: 384, height: 384, quality: 78 }),
    }),
  }),
  route: Object.freeze({
    square: false,
    variants: Object.freeze({
      large: Object.freeze({ longEdge: 2048, quality: 90 }),
      feed: Object.freeze({ longEdge: 1280, quality: 86 }),
      thumb: Object.freeze({ longEdge: 480, quality: 78 }),
    }),
  }),
  avatar: Object.freeze({
    square: true,
    variants: Object.freeze({
      large: Object.freeze({ width: 768, height: 768, quality: 90 }),
      feed: Object.freeze({ width: 384, height: 384, quality: 86 }),
      thumb: Object.freeze({ width: 192, height: 192, quality: 80 }),
    }),
  }),
});

function assert(condition, code, message) {
  if (!condition) throw new HttpsError(code, message);
}

function normalizeBucketName(value) {
  return String(value || '').trim().replace(/^gs:\/\//, '').replace(/\/+$/, '');
}

function getMediaBucket(admin, configuredBucket) {
  const bucketName = normalizeBucketName(configuredBucket);
  assert(
    bucketName,
    'failed-precondition',
    'MEDIA_STORAGE_BUCKET is not configured.'
  );
  return admin.storage().bucket(bucketName);
}

function buildDownloadUrl(bucketName, objectPath, token) {
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(
    bucketName
  )}/o/${encodeURIComponent(objectPath)}?alt=media&token=${encodeURIComponent(
    token
  )}`;
}

async function buildVariantPipeline(sourceBuffer, kind, variant) {
  const preset = MEDIA_PRESETS[kind];
  const selected = preset?.variants?.[variant];
  assert(preset && selected, 'invalid-argument', 'Unsupported media kind or variant.');

  const source = sharp(sourceBuffer, {
    failOn: 'warning',
    limitInputPixels: MAX_SOURCE_PIXELS,
  });
  const metadata = await source.metadata();
  const swapsAxes =
    Number.isInteger(metadata.orientation) &&
    metadata.orientation >= 5 &&
    metadata.orientation <= 8;
  const sourceWidth = swapsAxes ? metadata.height : metadata.width;
  const sourceHeight = swapsAxes ? metadata.width : metadata.height;
  const pipeline = source
    .rotate()
    .toColorspace('srgb');

  if (preset.square) {
    const edge = Math.max(
      1,
      Math.min(
        selected.width,
        selected.height,
        sourceWidth || selected.width,
        sourceHeight || selected.height
      )
    );
    return pipeline.resize(edge, edge, {
      fit: 'cover',
      position: 'centre',
    });
  }

  return pipeline.resize(selected.longEdge, selected.longEdge, {
    fit: 'inside',
    withoutEnlargement: true,
  });
}

async function encodeVariant(sourceBuffer, kind, variant) {
  const selected = MEDIA_PRESETS[kind].variants[variant];
  const pipeline = await buildVariantPipeline(
    sourceBuffer,
    kind,
    variant
  );
  const { data, info } = await pipeline
    .webp({
      quality: selected.quality,
      smartSubsample: true,
      effort: 5,
    })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: data,
    width: info.width,
    height: info.height,
    bytes: data.length,
  };
}

async function createPlaceholder(sourceBuffer) {
  const { data, info } = await sharp(sourceBuffer, {
    failOn: 'warning',
    limitInputPixels: MAX_SOURCE_PIXELS,
  })
    .rotate()
    .resize(100, 100, { fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const stats = await sharp(sourceBuffer, {
    failOn: 'warning',
    limitInputPixels: MAX_SOURCE_PIXELS,
  })
    .rotate()
    .resize(1, 1, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer();
  const { rgbaToThumbHash } = await import('thumbhash');
  const thumbHash = rgbaToThumbHash(info.width, info.height, data);
  const [red = 238, green = 238, blue = 238] = stats;

  return {
    thumbhash: Buffer.from(thumbHash).toString('base64'),
    color: `#${[red, green, blue]
      .map((channel) => channel.toString(16).padStart(2, '0'))
      .join('')}`,
  };
}

async function writeVariant({
  bucket,
  uid,
  assetId,
  sourcePath,
  kind,
  variant,
  encoded,
}) {
  const objectPath = `media/${uid}/${assetId}/${variant}.webp`;
  const token = crypto.randomUUID();
  await bucket.file(objectPath).save(encoded.buffer, {
    resumable: false,
    validation: 'crc32c',
    preconditionOpts: { ifGenerationMatch: 0 },
    metadata: {
      contentType: 'image/webp',
      cacheControl: CACHE_CONTROL,
      metadata: {
        firebaseStorageDownloadTokens: token,
        ownerUid: uid,
        assetId,
        variant,
        kind,
        sourcePath,
        state: 'prepared',
        width: String(encoded.width),
        height: String(encoded.height),
      },
    },
  });

  return {
    path: objectPath,
    url: buildDownloadUrl(bucket.name, objectPath, token),
    width: encoded.width,
    height: encoded.height,
    bytes: encoded.bytes,
    contentType: 'image/webp',
  };
}

async function removeFiles(files) {
  await Promise.allSettled(
    files.map((file) => file.delete({ ignoreNotFound: true }))
  );
}

async function consumeMediaProcessingBudget({ admin, uid, sourceBytes, nowMs = Date.now() }) {
  const db = admin.firestore();
  const ref = db.doc(`users/${uid}/serverState/mediaProcessingBudget`);
  const minuteWindow = Math.floor(nowMs / 60_000);
  const dayWindow = Math.floor(nowMs / 86_400_000);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const previous = snapshot.exists ? snapshot.data() || {} : {};
    const minuteCount = previous.minuteWindow === minuteWindow
      ? Number(previous.minuteCount || 0)
      : 0;
    const dayCount = previous.dayWindow === dayWindow ? Number(previous.dayCount || 0) : 0;
    const dayBytes = previous.dayWindow === dayWindow ? Number(previous.dayBytes || 0) : 0;
    assert(minuteCount < MEDIA_MINUTE_MAXIMUM, 'resource-exhausted', 'Too many images are being processed. Try again shortly.');
    assert(dayCount < MEDIA_DAY_MAXIMUM, 'resource-exhausted', 'The daily image-processing limit was reached.');
    assert(dayBytes + sourceBytes <= MEDIA_DAY_BYTES_MAXIMUM, 'resource-exhausted', 'The daily image-processing size limit was reached.');
    transaction.set(ref, {
      minuteWindow,
      minuteCount: minuteCount + 1,
      dayWindow,
      dayCount: dayCount + 1,
      dayBytes: dayBytes + sourceBytes,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: false });
  });
}

async function prepareMedia({
  admin,
  auth,
  data,
  mediaBucket,
  nowMs = Date.now(),
}) {
  const preparationStartedAt = Date.now();
  assert(auth?.uid, 'unauthenticated', 'You must be signed in.');
  const kind = String(data?.kind || '');
  assert(MEDIA_PRESETS[kind], 'invalid-argument', 'Unsupported media kind.');
  const stagingPath = String(data?.stagingPath || '');
  const match = stagingPath.match(STAGING_PATH_PATTERN);
  assert(
    match && match[1] === auth.uid,
    'permission-denied',
    'Staging media is outside the caller folder.'
  );

  const bucket = getMediaBucket(admin, mediaBucket);
  const stagingFile = bucket.file(stagingPath);
  let metadata;
  try {
    [metadata] = await stagingFile.getMetadata();
  } catch {
    throw new HttpsError('failed-precondition', 'Staging image was not found.');
  }

  const sourceBytes = Number(metadata.size || 0);
  assert(
    metadata.contentType === 'image/jpeg',
    'invalid-argument',
    'Staging media must be JPEG.'
  );
  assert(
    metadata.metadata?.ownerUid === auth.uid &&
      metadata.metadata?.variant === 'staging',
    'permission-denied',
    'Staging media metadata is invalid.'
  );
  assert(
    Number.isFinite(sourceBytes) &&
      sourceBytes > 0 &&
      sourceBytes <= MAX_SOURCE_BYTES,
    'invalid-argument',
    'Staging image is too large.'
  );

  await consumeMediaProcessingBudget({ admin, uid: auth.uid, sourceBytes, nowMs });

  const [sourceBuffer] = await stagingFile.download();
  let sourceInfo;
  try {
    sourceInfo = await sharp(sourceBuffer, {
      failOn: 'warning',
      limitInputPixels: MAX_SOURCE_PIXELS,
    }).metadata();
  } catch {
    throw new HttpsError('invalid-argument', 'Staging image is invalid.');
  }
  assert(
    sourceInfo.width &&
      sourceInfo.height &&
      sourceInfo.width * sourceInfo.height <= MAX_SOURCE_PIXELS,
    'invalid-argument',
    'Staging image dimensions are too large.'
  );

  const assetId = crypto.randomUUID();
  const variants = ['large', 'feed', 'thumb'];
  const candidateFiles = variants.map((variant) =>
    bucket.file(`media/${auth.uid}/${assetId}/${variant}.webp`)
  );
  const descriptors = {};
  try {
    const placeholder = await createPlaceholder(sourceBuffer);
    const encodedVariants = {};
    for (const variant of variants) {
      // Sequential processing keeps peak memory bounded.
      // eslint-disable-next-line no-await-in-loop
      encodedVariants[variant] = await encodeVariant(sourceBuffer, kind, variant);
    }
    const writtenVariants = await Promise.all(variants.map((variant) => writeVariant({
        bucket,
        uid: auth.uid,
        assetId,
        sourcePath: stagingPath,
        kind,
        variant,
        encoded: encodedVariants[variant],
      })));
    variants.forEach((variant, index) => {
      descriptors[variant] = writtenVariants[index];
    });

    await stagingFile.delete({ ignoreNotFound: true });
    console.info('media_prepare_timing', {
      kind,
      sourceBytes,
      durationMs: Date.now() - preparationStartedAt,
    });
    return {
      assetId,
      aspectRatio:
        descriptors.large.width / Math.max(1, descriptors.large.height),
      placeholder,
      large: descriptors.large,
      feed: descriptors.feed,
      thumb: descriptors.thumb,
    };
  } catch (error) {
    await removeFiles(candidateFiles);
    if (error instanceof HttpsError) throw error;
    console.error('Media preparation failed.', {
      kind,
      sourceBytes,
      durationMs: Date.now() - preparationStartedAt,
      code: String(error?.code || 'unknown'),
    });
    throw new HttpsError('internal', 'Could not prepare this image.');
  }
}

function collectCanonicalMediaAssets(data) {
  const assets = [];
  const add = (asset) => {
    if (
      asset &&
      typeof asset === 'object' &&
      typeof asset.assetId === 'string'
    ) {
      assets.push(asset);
    }
  };
  if (Array.isArray(data?.media)) data.media.forEach(add);
  add(data?.photoMedia);
  return assets;
}

async function markMediaClaimed(admin, data, mediaBucket) {
  const bucket = getMediaBucket(admin, mediaBucket);
  const assets = collectCanonicalMediaAssets(data);
  await Promise.all(
    assets.flatMap((asset) =>
      ['large', 'feed', 'thumb'].map(async (variant) => {
        const path = asset?.[variant]?.path;
        if (!path || !FINAL_PATH_PATTERN.test(path)) return;
        const file = bucket.file(path);
        try {
          const [metadata] = await file.getMetadata();
          await file.setMetadata({
            metadata: {
              ...(metadata.metadata || {}),
              state: 'claimed',
            },
          });
        } catch (error) {
          if (error?.code !== 404 && error?.code !== '404') throw error;
        }
      })
    )
  );
}

async function cleanupPreparedMedia({
  admin,
  mediaBucket,
  olderThanMs = 24 * 60 * 60 * 1000,
  now = Date.now(),
}) {
  const bucket = getMediaBucket(admin, mediaBucket);
  const [files] = await bucket.getFiles({ prefix: 'media/' });
  const expiredCandidates = files.filter((file) => {
    const state = file.metadata?.metadata?.state;
    const createdAt = Date.parse(
      file.metadata?.timeCreated || file.metadata?.updated || ''
    );
    return (
      state === 'prepared' &&
      Number.isFinite(createdAt) &&
      now - createdAt >= olderThanMs
    );
  });
  const candidateAssetKeys = Array.from(new Set(expiredCandidates.map((file) => {
    const match = String(file.name || '').match(/^media\/([^/]+)\/([^/]+)\/(?:large|feed|thumb)\.webp$/);
    return match ? `${match[1]}/${match[2]}` : null;
  }).filter(Boolean)));
  const referencedAssetKeys = new Set();
  if (candidateAssetKeys.length && typeof admin.firestore === 'function') {
    for (let offset = 0; offset < candidateAssetKeys.length; offset += 30) {
      const assetKeys = candidateAssetKeys.slice(offset, offset + 30);
      // Draft stop documents keep these server-derived, owner-qualified keys so prepared media
      // survives the 24-hour orphan cleanup while the private draft exists.
      // eslint-disable-next-line no-await-in-loop
      const snapshot = await admin.firestore()
        .collectionGroup('stops')
        .where('mediaCleanupKeys', 'array-contains-any', assetKeys)
        .get();
      snapshot.docs.forEach((document) => {
        (document.data()?.mediaCleanupKeys || []).forEach((assetKey) => {
          if (assetKeys.includes(assetKey)) referencedAssetKeys.add(assetKey);
        });
      });
    }
  }
  const expired = expiredCandidates.filter((file) => {
    const match = String(file.name || '').match(/^media\/([^/]+)\/([^/]+)\/(?:large|feed|thumb)\.webp$/);
    return !match || !referencedAssetKeys.has(`${match[1]}/${match[2]}`);
  });
  await removeFiles(expired);
  return {
    inspected: files.length,
    removed: expired.length,
    protectedDraftAssets: referencedAssetKeys.size,
  };
}

module.exports = {
  CACHE_CONTROL,
  FINAL_PATH_PATTERN,
  MAX_SOURCE_BYTES,
  MAX_SOURCE_PIXELS,
  MEDIA_DAY_BYTES_MAXIMUM,
  MEDIA_DAY_MAXIMUM,
  MEDIA_MINUTE_MAXIMUM,
  MEDIA_PRESETS,
  STAGING_PATH_PATTERN,
  buildDownloadUrl,
  cleanupPreparedMedia,
  collectCanonicalMediaAssets,
  consumeMediaProcessingBudget,
  createPlaceholder,
  encodeVariant,
  getMediaBucket,
  markMediaClaimed,
  normalizeBucketName,
  prepareMedia,
};
