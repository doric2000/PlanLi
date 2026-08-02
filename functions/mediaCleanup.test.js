const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildAllowedMediaPrefixes,
  cleanupRemovedMedia,
  collectManagedMediaPaths,
} = require('./mediaCleanup');

const asset = (uid, id) => ({
  assetId: id,
  large: { path: `media/${uid}/${id}/large.webp` },
  feed: { path: `media/${uid}/${id}/feed.webp` },
  thumb: { path: `media/${uid}/${id}/thumb.webp` },
});

test('collectManagedMediaPaths reads canonical document media', () => {
  const paths = collectManagedMediaPaths({
    photoMedia: asset('u1', 'avatar'),
    media: [asset('u1', 'cover')],
    unrelated: { path: 'documents/not-media.txt' },
  });

  assert.equal(paths.size, 6);
  assert(paths.has('media/u1/avatar/feed.webp'));
  assert.equal(paths.has('documents/not-media.txt'), false);
});

test('cleanup deletes removed canonical variants only inside the owner prefix', async () => {
  const deletedPaths = [];
  let selectedBucket = null;
  const admin = {
    storage: () => ({
      bucket: (bucketName) => {
        selectedBucket = bucketName;
        return {
          file: (objectPath) => ({
            delete: async () => deletedPaths.push(objectPath),
          }),
        };
      },
    }),
  };
  const before = {
    ownerId: 'u1',
    media: [asset('u1', 'old'), asset('other', 'foreign')],
  };
  const after = {
    ownerId: 'u1',
    media: [asset('u1', 'new')],
  };

  await cleanupRemovedMedia(admin, before, after, {
    allowedPrefixes: buildAllowedMediaPrefixes(
      'recommendations',
      'rec-1',
      before
    ),
    bucketName: 'media-eu',
  });

  assert.equal(selectedBucket, 'media-eu');
  assert.deepEqual(deletedPaths.sort(), [
    'media/u1/old/feed.webp',
    'media/u1/old/large.webp',
    'media/u1/old/thumb.webp',
  ]);
});

test('cleanup surfaces transient Storage failures for trigger retry', async () => {
  const storageError = Object.assign(new Error('temporary failure'), {
    code: 503,
  });
  const admin = {
    storage: () => ({
      bucket: () => ({
        file: () => ({
          delete: async () => {
            throw storageError;
          },
        }),
      }),
    }),
  };
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    await assert.rejects(
      cleanupRemovedMedia(
        admin,
        { photoMedia: asset('u1', 'old') },
        null,
        {
          allowedPrefixes: buildAllowedMediaPrefixes('users', 'u1'),
          bucketName: 'media-eu',
        }
      ),
      storageError
    );
  } finally {
    console.warn = originalWarn;
  }
});
