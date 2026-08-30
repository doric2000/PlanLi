const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');

const {
  CACHE_CONTROL,
  MAX_SOURCE_DIMENSION,
  assertJpegSourceInfo,
  cleanupPreparedMedia,
  collectCanonicalMediaAssets,
  consumeMediaProcessingBudget,
  createPlaceholder,
  encodeVariant,
  MEDIA_MINUTE_MAXIMUM,
  prepareMedia,
} = require('./mediaProcessor');

test('decoded JPEG validation rejects extreme single dimensions', () => {
  assert.doesNotThrow(() => assertJpegSourceInfo({
    format: 'jpeg', width: 4096, height: 4096,
  }));
  assert.throws(
    () => assertJpegSourceInfo({
      format: 'jpeg', width: MAX_SOURCE_DIMENSION + 1, height: 1,
    }),
    (error) => error.code === 'invalid-argument' && /dimensions/.test(error.message)
  );
  assert.throws(
    () => assertJpegSourceInfo({ format: 'png', width: 100, height: 100 }),
    (error) => error.code === 'invalid-argument' && /JPEG/.test(error.message)
  );
});

test('canonical media uses a bounded cache so moderation takedowns can converge', () => {
  assert.equal(CACHE_CONTROL, 'public,max-age=300,must-revalidate');
});

test('media callable scales parallel images on demand with a bounded deadline', () => {
  const source = require('node:fs').readFileSync(require.resolve('./index'), 'utf8');
  const start = source.indexOf('exports.prepareMedia = callable(');
  const end = source.indexOf('exports.syncCountryMetadataScheduled', start);
  const declaration = source.slice(start, end);
  assert.match(declaration, /memory:\s*'1GiB'/);
  assert.match(declaration, /concurrency:\s*1/);
  assert.match(declaration, /minInstances:\s*0/);
  assert.match(declaration, /maxInstances:\s*5/);
  assert.match(declaration, /timeoutSeconds:\s*60/);
});

test('media processing enforces aggregate per-user job and byte budgets', async () => {
  let stored = null;
  const db = {
    doc: () => ({}),
    runTransaction: async (handler) => handler({
      get: async () => ({ exists: Boolean(stored), data: () => stored }),
      set: (_ref, value) => { stored = value; },
    }),
  };
  const admin = {
    firestore: Object.assign(() => db, { FieldValue: { serverTimestamp: () => 'time' } }),
  };
  assert.equal(MEDIA_MINUTE_MAXIMUM, 40);
  for (let count = 0; count < MEDIA_MINUTE_MAXIMUM; count += 1) {
    await consumeMediaProcessingBudget({ admin, uid: 'user-1', sourceBytes: 1, nowMs: 1_000 });
  }
  await assert.rejects(
    consumeMediaProcessingBudget({ admin, uid: 'user-1', sourceBytes: 1, nowMs: 1_000 }),
    (error) => error?.code === 'resource-exhausted'
  );
});

test('prepareMedia rejects non-JPEG bytes even when Storage metadata claims JPEG', async () => {
  const source = await sharp({
    create: {
      width: 64,
      height: 64,
      channels: 3,
      background: { r: 20, g: 80, b: 180 },
    },
  }).png().toBuffer();
  const stagingFile = {
    getMetadata: async () => [{
      size: String(source.length),
      contentType: 'image/jpeg',
      metadata: { ownerUid: 'user-1', variant: 'staging' },
    }],
    download: async () => [source],
  };
  const db = {
    doc: () => ({}),
    runTransaction: async (handler) => handler({
      get: async () => ({ exists: false, data: () => ({}) }),
      set: () => {},
    }),
  };
  const admin = {
    firestore: Object.assign(() => db, { FieldValue: { serverTimestamp: () => 'time' } }),
    storage: () => ({ bucket: () => ({ file: () => stagingFile }) }),
  };

  await assert.rejects(prepareMedia({
    admin,
    auth: { uid: 'user-1' },
    data: {
      kind: 'recommendation',
      stagingPath: 'media-staging/user-1/123e4567-e89b-42d3-a456-426614174000.jpg',
    },
    mediaBucket: 'planli-f0b12-media-eu',
  }), (error) => error.code === 'invalid-argument' && /bytes must be JPEG/.test(error.message));
});

test('recommendation variants are WebP, square and never upscale', async () => {
  const source = await sharp({
    create: {
      width: 320,
      height: 240,
      channels: 3,
      background: { r: 20, g: 80, b: 180 },
    },
  })
    .jpeg({ quality: 100 })
    .toBuffer();

  const large = await encodeVariant(source, 'recommendation', 'large');
  const feed = await encodeVariant(source, 'recommendation', 'feed');
  const thumb = await encodeVariant(source, 'recommendation', 'thumb');

  assert.deepEqual([large.width, large.height], [240, 240]);
  assert.deepEqual([feed.width, feed.height], [240, 240]);
  assert.deepEqual([thumb.width, thumb.height], [240, 240]);
  assert.equal((await sharp(large.buffer).metadata()).format, 'webp');
});

test('route variants retain aspect ratio and use the configured long edges', async () => {
  const source = await sharp({
    create: {
      width: 3000,
      height: 2000,
      channels: 3,
      background: { r: 120, g: 80, b: 30 },
    },
  })
    .jpeg({ quality: 100 })
    .toBuffer();

  const large = await encodeVariant(source, 'route', 'large');
  const feed = await encodeVariant(source, 'route', 'feed');
  const thumb = await encodeVariant(source, 'route', 'thumb');
  assert.deepEqual([large.width, large.height], [2048, 1365]);
  assert.deepEqual([feed.width, feed.height], [1280, 853]);
  assert.deepEqual([thumb.width, thumb.height], [480, 320]);
});

test('placeholder contains a valid ThumbHash payload and dominant color', async () => {
  const source = await sharp({
    create: {
      width: 20,
      height: 10,
      channels: 3,
      background: { r: 17, g: 34, b: 51 },
    },
  })
    .jpeg()
    .toBuffer();
  const placeholder = await createPlaceholder(source);
  assert(Buffer.from(placeholder.thumbhash, 'base64').length > 5);
  assert.match(placeholder.color, /^#[0-9a-f]{6}$/i);
});

test('canonical asset collection includes profile and top-level media', () => {
  const media = (assetId) => ({ assetId });
  assert.deepEqual(
    collectCanonicalMediaAssets({
      photoMedia: media('avatar'),
      media: [media('cover')],
    }).map((asset) => asset.assetId),
    ['cover', 'avatar']
  );
});

test('prepared cleanup removes only expired unclaimed objects', async () => {
  const removed = [];
  const now = Date.now();
  const files = [
    {
      metadata: {
        metadata: { state: 'prepared' },
        timeCreated: new Date(now - 25 * 60 * 60 * 1000).toISOString(),
      },
      delete: async () => removed.push('expired'),
    },
    {
      metadata: {
        metadata: { state: 'claimed' },
        timeCreated: new Date(now - 30 * 60 * 60 * 1000).toISOString(),
      },
      delete: async () => removed.push('claimed'),
    },
    {
      metadata: {
        metadata: { state: 'prepared' },
        timeCreated: new Date(now - 60 * 60 * 1000).toISOString(),
      },
      delete: async () => removed.push('fresh'),
    },
  ];
  const admin = {
    storage: () => ({
      bucket: () => ({
        getFiles: async () => [files],
      }),
    }),
  };
  const result = await cleanupPreparedMedia({
    admin,
    mediaBucket: 'media-eu',
    now,
  });
  assert.deepEqual(result, { inspected: 3, removed: 1, protectedDraftAssets: 0 });
  assert.deepEqual(removed, ['expired']);
});

test('prepared cleanup protects media referenced by a route draft stop', async () => {
  const removed = [];
  const now = Date.now();
  const file = (assetId, variant) => ({
    name: `media/owner/${assetId}/${variant}.webp`,
    metadata: {
      metadata: { state: 'prepared' },
      timeCreated: new Date(now - 25 * 60 * 60 * 1000).toISOString(),
    },
    delete: async () => removed.push(`${assetId}:${variant}`),
  });
  const files = [file('kept', 'large'), file('kept', 'feed'), file('orphan', 'large')];
  const admin = {
    storage: () => ({ bucket: () => ({ getFiles: async () => [files] }) }),
    firestore: () => ({
      collectionGroup: () => ({
        where: () => ({
          get: async () => ({ docs: [{ data: () => ({ mediaCleanupKeys: ['owner/kept'] }) }] }),
        }),
      }),
    }),
  };
  const result = await cleanupPreparedMedia({ admin, mediaBucket: 'media-eu', now });
  assert.deepEqual(removed, ['orphan:large']);
  assert.equal(result.protectedDraftAssets, 1);
});
