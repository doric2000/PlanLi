const test = require('node:test');
const assert = require('node:assert/strict');

const { cleanOptionalBio, updateProfile } = require('./profileService');

test('profile bio accepts a short two-line string and removes control characters', () => {
  assert.equal(cleanOptionalBio('  מטייל/ת 🌍\r\n  עם קפה  '), 'מטייל/ת 🌍\nעם קפה');
});

test('profile bio can be cleared with an empty string', () => {
  assert.equal(cleanOptionalBio('   '), '');
});

test('profile bio rejects more than two lines and more than 160 unicode characters', () => {
  assert.throws(() => cleanOptionalBio('א\nב\nג'), /two lines/);
  assert.throws(() => cleanOptionalBio('🌍'.repeat(161)), /160/);
});

test('saving an empty bio removes it from the private profile document', async () => {
  const writes = [];
  const deleted = Symbol('delete-field');
  const admin = {
    firestore: Object.assign(
      () => ({
        doc: () => ({
          get: async () => ({ exists: true, data: () => ({ bio: 'old bio' }) }),
          set: async (fields) => writes.push(fields),
        }),
      }),
      { FieldValue: { serverTimestamp: () => 'timestamp', delete: () => deleted } }
    ),
    auth: () => ({ updateUser: async () => {} }),
  };

  await updateProfile({
    admin,
    auth: { uid: 'user-1', token: { email: 'private@example.com' } },
    data: { bio: '' },
  });

  assert.equal(writes[0].bio, deleted);
});

test('profile updates can retain the already trusted photo media', async () => {
  const assetId = '423e4567-e89b-42d3-a456-426614174000';
  const photoMedia = {
    assetId,
    large: { path: `media/user-1/${assetId}/large.webp`, url: 'https://trusted/large' },
    feed: { path: `media/user-1/${assetId}/feed.webp`, url: 'https://trusted/feed' },
    thumb: { path: `media/user-1/${assetId}/thumb.webp`, url: 'https://trusted/thumb' },
  };
  const writes = [];
  const admin = {
    firestore: Object.assign(
      () => ({
        doc: () => ({
          get: async () => ({ exists: true, data: () => ({ photoMedia }) }),
          set: async (fields) => writes.push(fields),
        }),
      }),
      {
        FieldValue: {
          serverTimestamp: () => 'timestamp',
          delete: () => 'delete-field',
        },
      }
    ),
    auth: () => ({ updateUser: async () => {} }),
    storage: () => {
      throw new Error('retained media must not be revalidated as a new upload');
    },
  };

  await updateProfile({
    admin,
    auth: { uid: 'user-1', token: { email: 'private@example.com' } },
    mediaBucket: 'test.appspot.com',
    data: {
      photoMedia: {
        ...photoMedia,
        feed: { ...photoMedia.feed, url: 'https://untrusted/client-value' },
      },
    },
  });

  assert.deepEqual(writes[0].photoMedia, photoMedia);
  assert.equal(writes[0].photoURL, 'https://trusted/feed');
});
