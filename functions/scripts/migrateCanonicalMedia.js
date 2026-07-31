/* eslint-disable no-await-in-loop, no-console */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const {
  CACHE_CONTROL,
  buildDownloadUrl,
  createPlaceholder,
  encodeVariant,
  normalizeBucketName,
} = require('../mediaProcessor');

const PAGE_SIZE = 20;
const DEFAULT_STATE_DIR = path.join(
  __dirname,
  '..',
  '.canonical-media-migration'
);
const LEGACY_FIELDS = {
  users: [
    'photoURL',
    'photoPath',
    'photoMeta',
    'photoMedia',
    'photoMediaVersion',
  ],
  recommendations: [
    'images',
    'image',
    'imageAsset',
    'imageAssets',
    'media',
    'mediaVersion',
  ],
  routes: [
    'image',
    'imageAsset',
    'images',
    'imageAssets',
    'media',
    'mediaVersion',
    'tripDaysData',
  ],
};

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : null;
}

function parseArgs(argv) {
  const parsedLimit = Number.parseInt(valueAfter(argv, '--limit'), 10);
  const stateDir = valueAfter(argv, '--state-dir');
  return {
    apply: argv.includes('--apply'),
    resume: argv.includes('--resume'),
    limit:
      Number.isFinite(parsedLimit) && parsedLimit > 0
        ? parsedLimit
        : Number.POSITIVE_INFINITY,
    sourceBucket: normalizeBucketName(
      valueAfter(argv, '--source-bucket') ||
        process.env.SOURCE_MEDIA_BUCKET ||
        process.env.FIREBASE_STORAGE_BUCKET
    ),
    targetBucket: normalizeBucketName(
      valueAfter(argv, '--target-bucket') ||
        process.env.MEDIA_STORAGE_BUCKET
    ),
    stateDir: stateDir ? path.resolve(stateDir) : DEFAULT_STATE_DIR,
    rollbackPath: valueAfter(argv, '--rollback'),
  };
}

function initAdmin() {
  const keyPath = path.join(__dirname, '..', 'serviceAccountKey.json');
  const options = {};
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    options.credential = admin.credential.applicationDefault();
  } else if (fs.existsSync(keyPath)) {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    options.credential = admin.credential.cert(require(keyPath));
  } else {
    throw new Error(
      'Missing credentials. Set GOOGLE_APPLICATION_CREDENTIALS or add functions/serviceAccountKey.json.'
    );
  }
  if (!admin.apps.length) admin.initializeApp(options);
}

function parseStorageUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  if (value.startsWith('gs://')) {
    const remainder = value.slice(5);
    const slash = remainder.indexOf('/');
    if (slash < 1) return null;
    return {
      bucket: remainder.slice(0, slash),
      objectPath: decodeURIComponent(remainder.slice(slash + 1)),
    };
  }
  try {
    const parsed = new URL(value);
    if (parsed.hostname === 'firebasestorage.googleapis.com') {
      const match = parsed.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
      return match
        ? {
            bucket: decodeURIComponent(match[1]),
            objectPath: decodeURIComponent(match[2]),
          }
        : null;
    }
    if (parsed.hostname === 'storage.googleapis.com') {
      const [, bucket, ...parts] = parsed.pathname.split('/');
      return bucket && parts.length
        ? { bucket, objectPath: decodeURIComponent(parts.join('/')) }
        : null;
    }
  } catch {
    return null;
  }
  return null;
}

function deterministicAssetId(source, ownerUid, kind, scope) {
  const hex = crypto
    .createHash('sha256')
    .update(
      `${source.bucket}/${source.objectPath}:${ownerUid}:${kind}:${scope}`
    )
    .digest('hex')
    .slice(0, 32)
    .split('');
  hex[12] = '5';
  hex[16] = ['8', '9', 'a', 'b'][Number.parseInt(hex[16], 16) % 4];
  const joined = hex.join('');
  return `${joined.slice(0, 8)}-${joined.slice(8, 12)}-${joined.slice(
    12,
    16
  )}-${joined.slice(16, 20)}-${joined.slice(20)}`;
}

async function objectExists(bucketName, objectPath) {
  if (!bucketName || !objectPath) return false;
  const [exists] = await admin
    .storage()
    .bucket(bucketName)
    .file(objectPath)
    .exists();
  return exists;
}

function canonicalAssetComplete(asset, ownerUid, targetBucket) {
  if (
    !asset?.assetId ||
    !asset?.large?.path ||
    !asset?.feed?.path ||
    !asset?.thumb?.path
  ) {
    return false;
  }
  const base = `media/${ownerUid}/${asset.assetId}`;
  const urls = [asset.large?.url, asset.feed?.url, asset.thumb?.url];
  return (
    asset.large.path === `${base}/large.webp` &&
    asset.feed.path === `${base}/feed.webp` &&
    asset.thumb.path === `${base}/thumb.webp` &&
    urls.every(
      (url) =>
        typeof url === 'string' &&
        (!targetBucket || url.includes(`/b/${targetBucket}/`))
    )
  );
}

async function resolveSource({
  asset,
  fallbackUrl,
  sourceBucket,
}) {
  const candidates = [];
  const add = (bucket, objectPath, reason) => {
    if (bucket && objectPath) candidates.push({ bucket, objectPath, reason });
  };

  add(
    asset?.source?.bucket || sourceBucket,
    asset?.source?.path,
    'retained-source'
  );

  for (const descriptor of [asset?.large, asset?.full, asset?.feed, asset?.display]) {
    if (!descriptor?.path) continue;
    const bucketName = descriptor.bucket || sourceBucket;
    if (await objectExists(bucketName, descriptor.path)) {
      const [metadata] = await admin
        .storage()
        .bucket(bucketName)
        .file(descriptor.path)
        .getMetadata();
      add(
        metadata?.metadata?.sourceBucket || sourceBucket,
        metadata?.metadata?.sourcePath,
        'metadata-source'
      );
      add(bucketName, descriptor.path, 'best-existing-variant');
    }
  }

  const parsedFallback = parseStorageUrl(fallbackUrl);
  if (parsedFallback) {
    add(
      parsedFallback.bucket,
      parsedFallback.objectPath,
      'legacy-url'
    );
  }

  for (const candidate of candidates) {
    if (await objectExists(candidate.bucket, candidate.objectPath)) {
      return candidate;
    }
  }
  return null;
}

async function descriptorForExisting(file, objectPath, variant, dryRun) {
  if (dryRun) return null;
  const [exists] = await file.exists();
  if (!exists) return null;
  const [metadata] = await file.getMetadata();
  const token = String(
    metadata?.metadata?.firebaseStorageDownloadTokens || ''
  )
    .split(',')
    .find(Boolean);
  if (!token) return null;
  return {
    path: objectPath,
    url: buildDownloadUrl(file.bucket.name, objectPath, token),
    width: Number(metadata?.metadata?.width) || null,
    height: Number(metadata?.metadata?.height) || null,
    bytes: Number(metadata.size) || null,
    contentType: 'image/webp',
    variant,
  };
}

async function writeVariant({
  targetBucket,
  objectPath,
  encoded,
  ownerUid,
  assetId,
  kind,
  source,
  variant,
  apply,
}) {
  const file = targetBucket.file(objectPath);
  const existing = await descriptorForExisting(
    file,
    objectPath,
    variant,
    !apply
  );
  if (existing) {
    delete existing.variant;
    return existing;
  }

  const token = crypto.randomUUID();
  if (apply) {
    await file.save(encoded.buffer, {
      resumable: false,
      validation: 'crc32c',
      metadata: {
        contentType: 'image/webp',
        cacheControl: CACHE_CONTROL,
        metadata: {
          firebaseStorageDownloadTokens: token,
          ownerUid,
          assetId,
          kind,
          variant,
          state: 'claimed',
          sourceBucket: source.bucket,
          sourcePath: source.objectPath,
          width: String(encoded.width),
          height: String(encoded.height),
        },
      },
    });
  }
  return {
    path: objectPath,
    url: apply
      ? buildDownloadUrl(targetBucket.name, objectPath, token)
      : `dry-run://${targetBucket.name}/${objectPath}`,
    width: encoded.width,
    height: encoded.height,
    bytes: encoded.bytes,
    contentType: 'image/webp',
  };
}

function createMigrator(options, summary) {
  const cache = new Map();
  return async ({ asset, fallbackUrl, ownerUid, kind, scope }) => {
    if (canonicalAssetComplete(asset, ownerUid, options.targetBucket)) {
      return asset;
    }
    const source = await resolveSource({
      asset,
      fallbackUrl,
      sourceBucket: options.sourceBucket,
    });
    if (!source) {
      throw new Error(`No recoverable source for ${scope}.`);
    }

    const cacheKey = `${source.bucket}/${source.objectPath}:${ownerUid}:${kind}:${scope}`;
    if (!cache.has(cacheKey)) {
      cache.set(
        cacheKey,
        (async () => {
          const [sourceBuffer] = await admin
            .storage()
            .bucket(source.bucket)
            .file(source.objectPath)
            .download();
          const assetId = deterministicAssetId(
            source,
            ownerUid,
            kind,
            scope
          );
          const targetBucket = admin.storage().bucket(options.targetBucket);
          const basePath = `media/${ownerUid}/${assetId}`;
          const descriptors = {};
          for (const variant of ['large', 'feed', 'thumb']) {
            const encoded = await encodeVariant(sourceBuffer, kind, variant);
            descriptors[variant] = await writeVariant({
              targetBucket,
              objectPath: `${basePath}/${variant}.webp`,
              encoded,
              ownerUid,
              assetId,
              kind,
              source,
              variant,
              apply: options.apply,
            });
            summary.outputBytes += encoded.bytes;
          }
          const placeholder = await createPlaceholder(sourceBuffer);
          summary.assets += 1;
          summary.sourceBytes += sourceBuffer.length;
          if (source.reason === 'best-existing-variant') {
            summary.derivedSources += 1;
          }
          return {
            assetId,
            aspectRatio:
              descriptors.large.width /
              Math.max(1, descriptors.large.height),
            placeholder,
            large: descriptors.large,
            feed: descriptors.feed,
            thumb: descriptors.thumb,
          };
        })()
      );
    }
    return cache.get(cacheKey);
  };
}

function firestoreDelete() {
  return admin.firestore.FieldValue.delete();
}

function legacyAssetAt(data, index = 0) {
  const assets = Array.isArray(data?.imageAssets) ? data.imageAssets : [];
  if (assets[index]) return assets[index];
  if (index === 0 && data?.imageAsset) return data.imageAsset;
  return null;
}

function legacyUrlAt(data, index = 0) {
  const images = Array.isArray(data?.images) ? data.images : [];
  return images[index] || (index === 0 ? data?.image || null : null);
}

async function migrateUser(snapshot, migrate) {
  const data = snapshot.data() || {};
  let photoMedia = data.photoMedia || null;
  if (!canonicalAssetComplete(photoMedia, snapshot.id)) {
    const fallbackUrl = data.photoURL || data.photoMeta?.full?.url;
    if (fallbackUrl || data.photoMeta) {
      photoMedia = await migrate({
        asset: data.photoMeta,
        fallbackUrl,
        ownerUid: snapshot.id,
        kind: 'avatar',
        scope: `users/${snapshot.id}/photo`,
      });
    }
  }
  return {
    update: {
      photoMedia,
      photoURL: photoMedia?.feed?.url || null,
      photoPath: firestoreDelete(),
      photoMeta: firestoreDelete(),
      photoMediaVersion: firestoreDelete(),
    },
    authPhotoURL: photoMedia?.feed?.url || null,
  };
}

async function migrateRecommendation(snapshot, migrate) {
  const data = snapshot.data() || {};
  const ownerUid = data.userId;
  if (!ownerUid) throw new Error(`Recommendation ${snapshot.id} has no userId.`);
  const canonical = Array.isArray(data.media) ? data.media : [];
  const legacyCount = Math.max(
    Array.isArray(data.images) ? data.images.length : 0,
    Array.isArray(data.imageAssets) ? data.imageAssets.length : 0,
    data.image || data.imageAsset ? 1 : 0
  );
  const count = Math.max(canonical.length, legacyCount);
  const media = [];
  for (let index = 0; index < count; index += 1) {
    const existing = canonical[index];
    media.push(
      canonicalAssetComplete(existing, ownerUid)
        ? existing
        : await migrate({
            asset: existing || legacyAssetAt(data, index),
            fallbackUrl:
              existing?.large?.url || legacyUrlAt(data, index),
            ownerUid,
            kind: 'recommendation',
            scope: `recommendations/${snapshot.id}/${index}`,
          })
    );
  }
  return {
    update: {
      media,
      images: firestoreDelete(),
      image: firestoreDelete(),
      imageAsset: firestoreDelete(),
      imageAssets: firestoreDelete(),
      mediaVersion: firestoreDelete(),
    },
  };
}

async function migrateRoute(snapshot, migrate) {
  const data = snapshot.data() || {};
  const ownerUid = data.userId;
  if (!ownerUid) throw new Error(`Route ${snapshot.id} has no userId.`);
  const media = [];
  const canonical = Array.isArray(data.media) ? data.media : [];
  const legacyCount = Math.max(
    Array.isArray(data.images) ? data.images.length : 0,
    Array.isArray(data.imageAssets) ? data.imageAssets.length : 0,
    data.image || data.imageAsset ? 1 : 0
  );
  const count = Math.max(canonical.length, legacyCount);
  for (let index = 0; index < count; index += 1) {
    const existing = canonical[index];
    media.push(
      canonicalAssetComplete(existing, ownerUid)
        ? existing
        : await migrate({
            asset: existing || legacyAssetAt(data, index),
            fallbackUrl:
              existing?.large?.url || legacyUrlAt(data, index),
            ownerUid,
            kind: 'route',
            scope: `routes/${snapshot.id}/media/${index}`,
          })
    );
  }

  const tripDaysData = [];
  for (let dayIndex = 0; dayIndex < (data.tripDaysData || []).length; dayIndex += 1) {
    const day = { ...(data.tripDaysData[dayIndex] || {}) };
    if (!canonicalAssetComplete(day.media, ownerUid) && (day.image || day.imageAsset)) {
      day.media = await migrate({
        asset: day.imageAsset,
        fallbackUrl: day.image,
        ownerUid,
        kind: 'route',
        scope: `routes/${snapshot.id}/days/${dayIndex}`,
      });
    }
    delete day.image;
    delete day.imageAsset;
    const stops = [];
    for (let stopIndex = 0; stopIndex < (day.stops || []).length; stopIndex += 1) {
      const stop = { ...(day.stops[stopIndex] || {}) };
      if (!canonicalAssetComplete(stop.media, ownerUid) && (stop.image || stop.imageAsset)) {
        stop.media = await migrate({
          asset: stop.imageAsset,
          fallbackUrl: stop.image,
          ownerUid,
          kind: 'route',
          scope: `routes/${snapshot.id}/days/${dayIndex}/stops/${stopIndex}`,
        });
      }
      delete stop.image;
      delete stop.imageAsset;
      stops.push(stop);
    }
    day.stops = stops;
    tripDaysData.push(day);
  }

  return {
    update: {
      media,
      tripDaysData,
      images: firestoreDelete(),
      image: firestoreDelete(),
      imageAsset: firestoreDelete(),
      imageAssets: firestoreDelete(),
      mediaVersion: firestoreDelete(),
    },
  };
}

function encodeAudit(value) {
  if (value instanceof admin.firestore.Timestamp) {
    return {
      __type: 'timestamp',
      seconds: value.seconds,
      nanoseconds: value.nanoseconds,
    };
  }
  if (value instanceof admin.firestore.GeoPoint) {
    return {
      __type: 'geopoint',
      latitude: value.latitude,
      longitude: value.longitude,
    };
  }
  if (Array.isArray(value)) return value.map(encodeAudit);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        encodeAudit(nested),
      ])
    );
  }
  return value;
}

function decodeAudit(value) {
  if (Array.isArray(value)) return value.map(decodeAudit);
  if (value?.__type === 'timestamp') {
    return new admin.firestore.Timestamp(value.seconds, value.nanoseconds);
  }
  if (value?.__type === 'geopoint') {
    return new admin.firestore.GeoPoint(value.latitude, value.longitude);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        decodeAudit(nested),
      ])
    );
  }
  return value;
}

function ensureStateDir(stateDir) {
  fs.mkdirSync(stateDir, { recursive: true });
}

function readState(stateDir) {
  const statePath = path.join(stateDir, 'state.json');
  return fs.existsSync(statePath)
    ? JSON.parse(fs.readFileSync(statePath, 'utf8'))
    : { collections: {} };
}

function writeState(stateDir, state) {
  ensureStateDir(stateDir);
  const statePath = path.join(stateDir, 'state.json');
  const temporaryPath = `${statePath}.${process.pid}.tmp`;
  const backupPath = `${statePath}.bak`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`);
  if (fs.existsSync(backupPath)) fs.rmSync(backupPath);
  if (fs.existsSync(statePath)) fs.renameSync(statePath, backupPath);
  try {
    fs.renameSync(temporaryPath, statePath);
    if (fs.existsSync(backupPath)) fs.rmSync(backupPath);
  } catch (error) {
    if (!fs.existsSync(statePath) && fs.existsSync(backupPath)) {
      fs.renameSync(backupPath, statePath);
    }
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath);
    throw error;
  }
}

function auditFields(data, collectionName) {
  return Object.fromEntries(
    LEGACY_FIELDS[collectionName].map((field) => [
      field,
      Object.prototype.hasOwnProperty.call(data, field)
        ? { exists: true, value: encodeAudit(data[field]) }
        : { exists: false },
    ])
  );
}

async function processCollection({
  collectionName,
  handler,
  migrate,
  options,
  summary,
  state,
  auditPath,
}) {
  let cursor = options.resume
    ? state.collections?.[collectionName]?.lastId || null
    : null;
  let done =
    options.resume && state.collections?.[collectionName]?.done === true;
  while (!done && summary.documents < options.limit) {
    const limit = Math.min(PAGE_SIZE, options.limit - summary.documents);
    let query = admin
      .firestore()
      .collection(collectionName)
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(limit);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    if (page.empty) {
      done = true;
      break;
    }
    for (const snapshot of page.docs) {
      const result = await handler(snapshot, migrate);
      summary.documents += 1;
      summary.updated += 1;
      if (options.apply) {
        ensureStateDir(options.stateDir);
        fs.appendFileSync(
          auditPath,
          `${JSON.stringify({
            collection: collectionName,
            id: snapshot.id,
            before: auditFields(snapshot.data(), collectionName),
          })}\n`
        );
        await snapshot.ref.update(result.update, {
          lastUpdateTime: snapshot.updateTime,
        });
        if (collectionName === 'users') {
          try {
            await admin.auth().updateUser(snapshot.id, {
              photoURL: result.authPhotoURL,
            });
          } catch (error) {
            if (error?.code !== 'auth/user-not-found') throw error;
          }
        }
      }
      cursor = snapshot.id;
      if (options.apply) {
        state.collections[collectionName] = { lastId: cursor, done: false };
        writeState(options.stateDir, state);
      }
      if (summary.documents >= options.limit) break;
    }
    done = page.size < limit;
  }
  if (options.apply && done) {
    state.collections[collectionName] = { lastId: cursor, done: true };
    writeState(options.stateDir, state);
  }
}

async function rollback(auditPath) {
  const entries = fs
    .readFileSync(path.resolve(auditPath), 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map(JSON.parse)
    .reverse();
  for (const entry of entries) {
    const update = {};
    for (const [field, stored] of Object.entries(entry.before || {})) {
      update[field] = stored.exists
        ? decodeAudit(stored.value)
        : firestoreDelete();
    }
    await admin
      .firestore()
      .doc(`${entry.collection}/${entry.id}`)
      .update(update);
    if (
      entry.collection === 'users' &&
      entry.before?.photoURL?.exists
    ) {
      try {
        await admin.auth().updateUser(entry.id, {
          photoURL: entry.before.photoURL.value || null,
        });
      } catch (error) {
        if (error?.code !== 'auth/user-not-found') throw error;
      }
    }
  }
  return entries.length;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  initAdmin();
  if (options.rollbackPath) {
    if (!options.apply) {
      throw new Error('Rollback requires --apply.');
    }
    console.log(
      JSON.stringify({
        mode: 'rollback',
        restored: await rollback(options.rollbackPath),
      })
    );
    return;
  }
  if (!options.sourceBucket || !options.targetBucket) {
    throw new Error(
      'Provide --source-bucket and --target-bucket (or SOURCE_MEDIA_BUCKET and MEDIA_STORAGE_BUCKET).'
    );
  }
  if (options.sourceBucket === options.targetBucket) {
    throw new Error('Source and target media buckets must be different.');
  }

  const state = options.resume
    ? readState(options.stateDir)
    : { collections: {} };
  const auditPath =
    state.auditPath ||
    path.join(
      options.stateDir,
      `rollback-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`
    );
  if (options.apply && !state.auditPath) {
    state.auditPath = auditPath;
    writeState(options.stateDir, state);
  }
  const summary = {
    mode: options.apply ? 'apply' : 'dry-run',
    sourceBucket: options.sourceBucket,
    targetBucket: options.targetBucket,
    documents: 0,
    updated: 0,
    assets: 0,
    derivedSources: 0,
    sourceBytes: 0,
    outputBytes: 0,
    auditPath: options.apply ? auditPath : null,
  };
  const migrate = createMigrator(options, summary);
  for (const [collectionName, handler] of [
    ['users', migrateUser],
    ['recommendations', migrateRecommendation],
    ['routes', migrateRoute],
  ]) {
    if (summary.documents >= options.limit) break;
    await processCollection({
      collectionName,
      handler,
      migrate,
      options,
      summary,
      state,
      auditPath,
    });
  }
  console.log(
    JSON.stringify(
      {
        ...summary,
        sourceMiB: Number((summary.sourceBytes / 1024 / 1024).toFixed(2)),
        outputMiB: Number((summary.outputBytes / 1024 / 1024).toFixed(2)),
        estimatedSavingMiB: Number(
          (
            (summary.sourceBytes - summary.outputBytes) /
            1024 /
            1024
          ).toFixed(2)
        ),
      },
      null,
      2
    )
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  canonicalAssetComplete,
  deterministicAssetId,
  migrateRecommendation,
  migrateRoute,
  migrateUser,
  parseArgs,
  parseStorageUrl,
  resolveSource,
  rollback,
};
