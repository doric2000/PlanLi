const test = require('node:test');
const assert = require('node:assert/strict');

const {
  cleanOptionalBio,
  cleanOptionalName,
  completeAccountSetup,
  registerUser,
  updateProfile,
} = require('./profileService');

function createRegistrationAdmin(initialData = null, { serializeTransactions = false } = {}) {
  let stored = initialData ? { ...initialData } : null;
  const writes = [];
  const snapshot = () => ({ exists: Boolean(stored), data: () => stored });
  const ref = {
    path: 'users/user-1',
    get: async () => snapshot(),
    set: async (fields, options) => {
      writes.push({ fields, options });
      stored = options?.merge ? { ...(stored || {}), ...fields } : { ...fields };
    },
  };
  const executeTransaction = async (handler) => handler({
    get: async () => snapshot(),
    set: (_target, fields, options) => {
      writes.push({ fields, options });
      stored = options?.merge ? { ...(stored || {}), ...fields } : { ...fields };
    },
  });
  let transactionQueue = Promise.resolve();
  const db = {
    doc: () => ref,
    runTransaction: (handler) => {
      if (!serializeTransactions) return executeTransaction(handler);
      const result = transactionQueue.then(() => executeTransaction(handler));
      transactionQueue = result.then(() => undefined, () => undefined);
      return result;
    },
  };
  return {
    admin: {
      firestore: Object.assign(() => db, {
        FieldValue: { serverTimestamp: () => 'timestamp', delete: () => 'delete' },
      }),
      auth: () => ({ updateUser: async () => {} }),
    },
    getStored: () => stored,
    writes,
  };
}

test('complete account setup records server-owned profile and legal versions', async () => {
  const fixture = createRegistrationAdmin({
    uid: 'user-1',
    smartProfile: { setupRequired: true },
  });
  const result = await completeAccountSetup({
    admin: fixture.admin,
    auth: { uid: 'user-1', token: { email: 'private@example.com', email_verified: true } },
    data: { displayName: 'Dana Cohen', acceptedLegal: true },
  });
  const stored = fixture.getStored();
  assert.equal(stored.displayName, 'Dana Cohen');
  assert.deepEqual(stored.onboarding, {
    profileDetailsVersion: 1,
    profileDetailsCompletedAt: 'timestamp',
  });
  assert.deepEqual(stored.legal, {
    termsVersion: '2026-08-15-community-safety',
    privacyVersion: '2026-08-16-diagnostics',
    acceptedAt: 'timestamp',
  });
  assert.equal(result.profileDetailsVersion, 1);
});

test('an unverified password account can persist setup but remains blocked by the active policy', async () => {
  const fixture = createRegistrationAdmin({ uid: 'user-1', smartProfile: { setupRequired: true } });
  await completeAccountSetup({
    admin: fixture.admin,
    auth: {
      uid: 'user-1',
      token: { email: 'private@example.com', email_verified: false, firebase: { sign_in_provider: 'password' } },
    },
    data: { displayName: 'Dana Cohen', acceptedLegal: true },
  });
  assert.equal(fixture.writes.length, 1);
  assert.equal(fixture.getStored().legal.privacyVersion, '2026-08-16-diagnostics');
});

test('profile bio accepts a short two-line string and removes control characters', () => {
  assert.equal(cleanOptionalBio('  מטייל/ת 🌍\r\n  עם קפה  '), 'מטייל/ת 🌍\nעם קפה');
});

test('profile bio can be cleared with an empty string', () => {
  assert.equal(cleanOptionalBio('   '), '');
});

test('profile names normalize spacing and enforce six words and 60 characters', () => {
  assert.equal(cleanOptionalName('  Dana   Cohen  '), 'Dana Cohen');
  assert.throws(() => cleanOptionalName('one two three four five six seven'), /six words/);
  assert.throws(() => cleanOptionalName('א'.repeat(61)), /invalid/);
});

test('a verified user can change the display name only once', async () => {
  const fixture = createRegistrationAdmin({
    uid: 'user-1',
    displayName: 'Old Name',
  });
  const request = {
    admin: fixture.admin,
    auth: { uid: 'user-1', token: { email_verified: true } },
    data: { displayName: 'New Name' },
  };

  await updateProfile(request);
  assert.equal(fixture.getStored().displayName, 'New Name');
  assert.equal(fixture.getStored().profileManagement.displayNameChangedAt, 'timestamp');
  await assert.rejects(
    updateProfile({ ...request, data: { displayName: 'Third Name' } }),
    (error) => error?.details?.reason === 'DISPLAY_NAME_CHANGE_ALREADY_USED'
  );
});

test('an unverified email user cannot change the display name', async () => {
  const fixture = createRegistrationAdmin({ uid: 'user-1', displayName: 'Old Name' });
  await assert.rejects(
    updateProfile({
      admin: fixture.admin,
      auth: { uid: 'user-1', token: { email_verified: false } },
      data: { displayName: 'New Name' },
    }),
    (error) => error?.details?.reason === 'EMAIL_VERIFICATION_REQUIRED'
  );
  assert.equal(fixture.getStored().displayName, 'Old Name');
});

test('travel preferences require verified email and current legal consent', async () => {
  const completeProfile = {
    uid: 'user-1',
    displayName: 'Dana Cohen',
    onboarding: { profileDetailsVersion: 1, profileDetailsCompletedAt: 'timestamp' },
    legal: {
      termsVersion: '2026-08-15-community-safety',
      privacyVersion: '2026-08-16-diagnostics',
      acceptedAt: 'timestamp',
    },
    smartProfile: { setupRequired: true },
  };
  const smartProfile = {
    interests: ['food', 'nature_scenery', 'hiking'],
    budget: 'balanced',
    travelParties: ['couple'],
  };

  const unverified = createRegistrationAdmin(completeProfile);
  await assert.rejects(
    updateProfile({
      admin: unverified.admin,
      auth: {
        uid: 'user-1',
        token: { email_verified: false, firebase: { sign_in_provider: 'password' } },
      },
      data: { smartProfile, completeSmartProfile: true, taxonomyVersion: 5 },
    }),
    (error) => error?.details?.reason === 'EMAIL_VERIFICATION_REQUIRED'
  );

  const missingLegal = createRegistrationAdmin({ ...completeProfile, legal: {} });
  await assert.rejects(
    updateProfile({
      admin: missingLegal.admin,
      auth: {
        uid: 'user-1',
        token: { email_verified: true, firebase: { sign_in_provider: 'password' } },
      },
      data: { smartProfile, completeSmartProfile: true, taxonomyVersion: 5 },
    }),
    (error) => error?.details?.reason === 'LEGAL_CONSENT_REQUIRED'
  );
});

test('smart budget writes require taxonomy v5 while unrelated profile writes do not', async () => {
  const admin = {
    firestore: Object.assign(() => ({
      doc: () => ({ get: async () => ({ exists: true, data: () => ({}) }) }),
    }), { FieldValue: { serverTimestamp: () => 'timestamp', delete: () => 'delete' } }),
  };
  await assert.rejects(updateProfile({
    admin,
    auth: { uid: 'user-1', token: {} },
    data: { taxonomyVersion: 4, smartProfile: { budget: 'economy' } },
  }), /Update PlanLi/);
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

test('registerUser creates the canonical private profile once', async () => {
  const fixture = createRegistrationAdmin();
  const result = await registerUser({
    admin: fixture.admin,
    auth: { uid: 'user-1', token: { email: 'private@example.com', name: 'Provider Name' } },
    data: { displayName: 'New Traveler', photoURL: 'https://lh3.googleusercontent.com/avatar.jpg' },
  });

  assert.deepEqual(result, {
    uid: 'user-1',
    created: true,
    displayName: 'New Traveler',
    photoURL: 'https://lh3.googleusercontent.com/avatar.jpg',
    setupRequired: true,
  });
  assert.deepEqual(fixture.getStored().smartProfile, { setupRequired: true });
  assert.equal(fixture.writes.length, 1);
});

test('registerUser retries do not overwrite edited profile fields or write timestamps', async () => {
  const fixture = createRegistrationAdmin({
    uid: 'user-1',
    email: 'private@example.com',
    displayName: 'Edited Name',
    photoURL: null,
    bio: 'Edited bio',
    smartProfile: { setupRequired: false, completedAt: 'complete' },
    moderation: { status: 'active' },
  });
  const result = await registerUser({
    admin: fixture.admin,
    auth: { uid: 'user-1', token: { email: 'provider@example.com' } },
    data: { displayName: 'Provider Name', photoURL: 'https://images.example/provider.jpg' },
  });

  assert.equal(fixture.writes.length, 0);
  assert.equal(fixture.getStored().displayName, 'Edited Name');
  assert.equal(fixture.getStored().photoURL, null);
  assert.equal(fixture.getStored().bio, 'Edited bio');
  assert.deepEqual(result, {
    uid: 'user-1',
    created: false,
    displayName: 'Edited Name',
    photoURL: null,
    setupRequired: false,
  });
});

test('registerUser only backfills missing canonical fields in a partial profile', async () => {
  const fixture = createRegistrationAdmin({ bio: 'Keep me' });
  const result = await registerUser({
    admin: fixture.admin,
    auth: { uid: 'user-1', token: { email: 'private@example.com' } },
    data: {},
  });

  assert.equal(fixture.writes.length, 1);
  assert.equal(fixture.getStored().bio, 'Keep me');
  assert.equal(fixture.getStored().displayName, 'מטייל/ת PlanLi');
  assert.deepEqual(fixture.getStored().smartProfile, { setupRequired: true });
  assert.equal(result.created, false);
  assert.equal(result.setupRequired, true);
});

test('registerUser repairs a missing setup flag without replacing saved preference fields', async () => {
  const fixture = createRegistrationAdmin({
    uid: 'user-1',
    smartProfile: { interests: ['nature'] },
  });
  const result = await registerUser({
    admin: fixture.admin,
    auth: { uid: 'user-1', token: { email: 'private@example.com' } },
    data: {},
  });

  assert.equal(fixture.writes.length, 1);
  assert.deepEqual(fixture.getStored().smartProfile, {
    interests: ['nature'],
    setupRequired: true,
  });
  assert.equal(result.setupRequired, true);
});

test('parallel registerUser calls create one profile and return a stable result', async () => {
  const fixture = createRegistrationAdmin(null, { serializeTransactions: true });
  const request = {
    admin: fixture.admin,
    auth: { uid: 'user-1', token: { email: 'private@example.com' } },
    data: { displayName: 'Traveler' },
  };

  const results = await Promise.all([
    registerUser(request),
    registerUser(request),
  ]);

  assert.equal(fixture.writes.length, 1);
  assert.deepEqual(results.map((result) => result.created).sort(), [false, true]);
  assert.ok(results.every((result) => result.displayName === 'Traveler'));
  assert.ok(results.every((result) => result.setupRequired === true));
});
