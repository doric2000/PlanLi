const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');

const {
  CACHE_CONTROL,
  cleanupPreparedMedia,
  collectCanonicalMediaAssets,
  consumeMediaProcessingBudget,
  createPlaceholder,
  encodeVariant,
} = require('./mediaProcessor');

test('canonical media uses a bounded cache so moderation takedowns can converge', () => {
  assert.equal(CACHE_CONTROL, 'public,max-age=300,must-revalidate');
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
  for (let count = 0; count < 6; count += 1) {
    await consumeMediaProcessingBudget({ admin, uid: 'user-1', sourceBytes: 1, nowMs: 1_000 });
  }
  await assert.rejects(
    consumeMediaProcessingBudget({ admin, uid: 'user-1', sourceBytes: 1, nowMs: 1_000 }),
    (error) => error?.code === 'resource-exhausted'
  );
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
  assert.deepEqual(result, { inspected: 3, removed: 1 });
  assert.deepEqual(removed, ['expired']);
});
