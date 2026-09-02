const test = require('node:test');
const assert = require('node:assert/strict');

const {
  removedCanonicalMediaAssets,
  setFileAvailability,
  setMediaAvailability,
} = require('./mediaModeration');

function fixture() {
  let metadata = {
    cacheControl: 'public,max-age=31536000,immutable',
    metadata: { firebaseStorageDownloadTokens: 'public-token', ownerUid: 'owner-1' },
  };
  const registryWrites = [];
  const file = {
    getMetadata: async () => [metadata],
    setMetadata: async (patch) => { metadata = patch; },
  };
  const admin = {
    firestore: Object.assign(() => ({
      doc: (path) => ({
        set: async (value, options) => registryWrites.push({ path, value, options }),
      }),
    }), { FieldValue: { serverTimestamp: () => 'time' } }),
    storage: () => ({ bucket: () => ({ file: () => file }) }),
  };
  return { admin, getMetadata: () => metadata, registryWrites };
}

const content = {
  media: [{
    assetId: '123e4567-e89b-42d3-a456-426614174000',
    large: { path: 'media/owner-1/123e4567-e89b-42d3-a456-426614174000/large.webp' },
    feed: { path: 'media/owner-1/123e4567-e89b-42d3-a456-426614174000/feed.webp' },
    thumb: { path: 'media/owner-1/123e4567-e89b-42d3-a456-426614174000/thumb.webp' },
  }],
};

test('holding media revokes download tokens and marks the asset unavailable', async () => {
  const state = fixture();
  await setMediaAvailability({
    admin: state.admin,
    data: content,
    mediaBucket: 'media-eu',
    available: false,
    reason: 'moderation_hold',
  });
  assert.equal(state.getMetadata().metadata.firebaseStorageDownloadTokens, null);
  assert.equal(state.getMetadata().metadata.planliOriginalDownloadTokens, 'public-token');
  assert.equal(state.getMetadata().cacheControl, 'private,max-age=0,no-store');
  assert(state.registryWrites.every((entry) => entry.value.status === 'held'));
});

test('metadata precondition conflicts are retried with fresh metadata', async () => {
  let current = {
    metageneration: 7,
    metadata: { firebaseStorageDownloadTokens: 'public-token' },
  };
  let writes = 0;
  const file = {
    getMetadata: async () => [current],
    setMetadata: async (patch, options) => {
      writes += 1;
      assert.equal(options.ifMetagenerationMatch, writes === 1 ? 7 : 8);
      if (writes === 1) {
        current = { ...current, metageneration: 8 };
        const error = new Error('metadata was edited during the operation');
        error.code = 412;
        throw error;
      }
      current = { ...patch, metageneration: 9 };
    },
  };

  await setFileAvailability(file, false);

  assert.equal(writes, 2);
  assert.equal(current.metadata.availability, 'held');
  assert.equal(current.metadata.planliOriginalDownloadTokens, 'public-token');
});

test('a persistent metadata conflict converges with an unguarded final write', async () => {
  let current = {
    metageneration: 11,
    metadata: { firebaseStorageDownloadTokens: 'public-token' },
  };
  let guardedWrites = 0;
  let fallbackWrites = 0;
  const file = {
    getMetadata: async () => [current],
    setMetadata: async (patch, options) => {
      if (options?.ifMetagenerationMatch) {
        guardedWrites += 1;
        current = { ...current, metageneration: current.metageneration + 1 };
        const error = new Error('metadata was edited during the operation');
        error.code = 412;
        throw error;
      }
      fallbackWrites += 1;
      current = { ...patch, metageneration: current.metageneration + 1 };
    },
  };

  await setFileAvailability(file, true);

  assert.equal(guardedWrites, 3);
  assert.equal(fallbackWrites, 1);
  assert.equal(current.metadata.availability, 'active');
  assert.equal(current.metadata.firebaseStorageDownloadTokens, 'public-token');
});

test('restoring media restores its original token and bounded public caching', async () => {
  const state = fixture();
  await setMediaAvailability({ admin: state.admin, data: content, mediaBucket: 'media-eu', available: false });
  await setMediaAvailability({ admin: state.admin, data: content, mediaBucket: 'media-eu', available: true });
  assert.equal(state.getMetadata().metadata.firebaseStorageDownloadTokens, 'public-token');
  assert.equal(state.getMetadata().metadata.planliOriginalDownloadTokens, null);
  assert.equal(state.getMetadata().cacheControl, 'public,max-age=300,must-revalidate');
  assert.equal(state.registryWrites.at(-1).value.status, 'active');
});

test('invalid or mismatched canonical paths cannot create an availability registry entry', async () => {
  const state = fixture();
  const result = await setMediaAvailability({
    admin: state.admin,
    data: {
      media: [{
        assetId: '123e4567-e89b-42d3-a456-426614174000',
        large: { path: 'media/owner-1/not-the-asset/large.webp' },
      }],
    },
    mediaBucket: 'media-eu',
    available: true,
  });
  assert.deepEqual(result, { assets: 0, variants: 0 });
  assert.equal(state.registryWrites.length, 0);
});

test('removed media descriptors are detected without treating retained assets as removed', () => {
  const retained = content.media[0];
  const removed = {
    ...retained,
    assetId: '123e4567-e89b-42d3-a456-426614174001',
    large: { path: 'media/owner-1/123e4567-e89b-42d3-a456-426614174001/large.webp' },
    feed: { path: 'media/owner-1/123e4567-e89b-42d3-a456-426614174001/feed.webp' },
    thumb: { path: 'media/owner-1/123e4567-e89b-42d3-a456-426614174001/thumb.webp' },
  };
  assert.deepEqual(
    removedCanonicalMediaAssets({ media: [retained, removed] }, { media: [retained] }),
    [removed]
  );
});
