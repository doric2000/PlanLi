const test = require('node:test');
const assert = require('node:assert/strict');

const { removedCanonicalMediaAssets, setMediaAvailability } = require('./mediaModeration');

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
