const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assertDestinationFavoriteMutationAllowed,
  buildFavoritePreview,
  canonicalCommentThread,
  handleCommentThreadDeletionJobWrite,
  setReaction,
} = require('./socialService');

function socialFixture(initialDocuments = {}) {
  const documents = new Map(Object.entries(initialDocuments));
  const writes = [];
  const ref = (path) => ({
    path,
    collection: (name) => ({ doc: (id) => ref(`${path}/${name}/${id}`) }),
  });
  const snapshot = (documentRef) => ({
    exists: documents.has(documentRef.path),
    data: () => documents.get(documentRef.path),
    ref: documentRef,
  });
  const transaction = {
    get: async (documentRef) => snapshot(documentRef),
    set: (documentRef, data, options) => writes.push({
      action: 'set', path: documentRef.path, data, options,
    }),
    create: (documentRef, data) => writes.push({
      action: 'create', path: documentRef.path, data,
    }),
    update: (documentRef, data) => writes.push({
      action: 'update', path: documentRef.path, data,
    }),
    delete: (documentRef) => writes.push({ action: 'delete', path: documentRef.path }),
  };
  const db = {
    doc: ref,
    runTransaction: async (operation) => operation(transaction),
  };
  const firestore = () => db;
  firestore.FieldValue = {
    increment: (value) => ({ increment: value }),
    serverTimestamp: () => 'server-time',
  };
  return { admin: { firestore }, writes };
}

test('favorite mutations are blocked while a destination is being reassigned', () => {
  assert.throws(() => assertDestinationFavoriteMutationAllowed(
    { type: 'city', id: 'source', countryId: 'NI' },
    { status: 'active', reassignment: { state: 'reassigning', jobId: 'job-1' } }
  ), /being reassigned/);
  assert.doesNotThrow(() => assertDestinationFavoriteMutationAllowed(
    { type: 'city', id: 'target', countryId: 'NI' },
    { status: 'active', reassignment: { state: 'receiving', jobId: 'job-1' } }
  ));
});

test('comment threads normalize roots and one-level replies', () => {
  assert.deepEqual(canonicalCommentThread({}, 'root-1'), {
    threadType: 'root',
    threadRootId: 'root-1',
    replyToCommentId: null,
  });
  assert.deepEqual(canonicalCommentThread({
    threadType: 'reply',
    threadRootId: 'root-1',
    replyToCommentId: 'reply-1',
  }, 'reply-2'), {
    threadType: 'reply',
    threadRootId: 'root-1',
    replyToCommentId: 'reply-1',
  });
});

test('comment thread progress writes do not recursively start deletion workers', async () => {
  const result = await handleCommentThreadDeletionJobWrite({
    admin: null,
    event: {
      data: {
        after: {
          exists: true,
          data: () => ({
            schemaVersion: 1,
            type: 'comment_thread_delete',
            state: 'processing',
            parentPath: 'recommendations/rec-1',
            rootCommentPath: 'recommendations/rec-1/comments/root-1',
            rootCommentId: 'root-1',
            authorizedUid: 'user-1',
          }),
        },
      },
    },
  });
  assert.deepEqual(result, { state: 'ignored' });
});

test('favorite previews never persist rating metrics', () => {
  const preview = buildFavoritePreview({
    target: { type: 'city', id: 'city-1', countryId: 'country-1' },
    data: {
      name: 'City',
      rating: 4.8,
      travelers: 12,
      dayCount: 3,
      distanceKm: 42,
    },
    publicProfile: null,
  });

  assert.deepEqual(preview.metrics, {
    days: 3,
    distanceKm: 42,
    travelers: 12,
  });
  assert.equal(Object.hasOwn(preview.metrics, 'rating'), false);
});

test('recommendation favorite previews persist canonical and legacy category fields', () => {
  const preview = buildFavoritePreview({
    target: { type: 'recommendation', id: 'rec-1' },
    data: {
      title: 'Market',
      status: 'active',
      categoryId: 'food',
      category: 'אוכל וקולינריה',
    },
    publicProfile: null,
  });

  assert.equal(preview.categoryId, 'food');
  assert.equal(preview.category, 'אוכל וקולינריה');
});

test('non-recommendation favorite previews do not gain category fields', () => {
  const preview = buildFavoritePreview({
    target: { type: 'city', id: 'city-1', countryId: 'country-1' },
    data: { name: 'City', categoryId: 'food', category: 'אוכל' },
    publicProfile: null,
  });

  assert.equal(Object.hasOwn(preview, 'categoryId'), false);
  assert.equal(Object.hasOwn(preview, 'category'), false);
});

test('the threshold-crossing like transaction writes grouped and milestone notifications atomically', async () => {
  const { admin, writes } = socialFixture({
    'recommendations/rec-1': {
      ownerId: 'owner-1',
      status: 'active',
      publicationGate: { destinationApprovalVerified: true },
      title: 'Market',
      stats: { likeCount: 49 },
    },
    'publicProfiles/actor-1': {
      displayName: 'Dana',
      photoURL: 'https://example.com/dana.jpg',
    },
    'users/owner-1': { status: 'active' },
  });

  const result = await setReaction({
    admin,
    auth: {
      uid: 'actor-1',
      token: { firebase: { sign_in_provider: 'google.com' } },
    },
    data: { target: { type: 'recommendation', id: 'rec-1' }, liked: true },
  });

  assert.deepEqual(result, { liked: true, likeCount: 50 });
  const notificationWrites = writes.filter(({ action, path }) => (
    action === 'set' && path.startsWith('users/owner-1/notifications/')
  ));
  assert.equal(notificationWrites.length, 2);
  assert.deepEqual(
    notificationWrites.map(({ data }) => data.subtype).sort(),
    ['grouped_likes', 'like_milestone']
  );
  assert.equal(
    notificationWrites.find(({ data }) => data.subtype === 'like_milestone').data.milestone,
    50
  );
  assert.ok(writes.some(({ action, path, data }) => (
    action === 'update'
      && path === 'recommendations/rec-1'
      && data['stats.likeCount'] === 50
      && data['stats.notifiedLikeMilestone'] === 50
  )));
});
