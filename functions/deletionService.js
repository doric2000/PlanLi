const { HttpsError } = require('firebase-functions/v2/https');
const {
  buildAllowedMediaPrefixes,
  cleanupRemovedMedia,
} = require('./mediaCleanup');
const {
  consumeRateLimit,
  isVerified,
  normalizeTarget,
} = require('./socialService');
const { refreshRecommendationFallbackForDestination } = require('./destinationImageService');

function assert(condition, code, message) {
  if (!condition) throw new HttpsError(code, message);
}

async function deleteQueryInBatches(db, buildQuery, limit = 400) {
  let deleted = 0;
  while (true) {
    const snapshot = await buildQuery().limit(limit).get();
    if (snapshot.empty) break;
    const batch = db.batch();
    snapshot.docs.forEach((entry) => batch.delete(entry.ref));
    await batch.commit();
    deleted += snapshot.size;
    if (snapshot.size < limit) break;
  }
  return deleted;
}

async function markDeleting({ admin, target, actorUid, isAdmin }) {
  const db = admin.firestore();
  const ref = db.doc(target.path);
  let before;
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    assert(snapshot.exists, 'not-found', 'Content does not exist.');
    before = snapshot.data();
    assert(
      before.ownerId === actorUid || isAdmin,
      'permission-denied',
      'You do not own this content.'
    );
    if (before.status === 'active') {
      const countryId = before.destination?.countryId;
      const cityId = before.destination?.cityId;
      let cityRef = null;
      let citySnapshot = null;
      if (target.type === 'recommendation' && countryId && cityId) {
        cityRef = db.doc(`countries/${countryId}/cities/${cityId}`);
        citySnapshot = await transaction.get(cityRef);
      }
      transaction.update(ref, {
        status: 'deleting',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      if (citySnapshot?.exists) {
        transaction.update(cityRef, {
          'stats.recommendationCount': Math.max(
            0,
            Number(citySnapshot.data()?.stats?.recommendationCount || 0) - 1
          ),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }
  });
  return { ref, before };
}

async function deleteContentInternal({
  admin,
  target,
  actorUid,
  isAdmin = false,
  mediaBucket,
}) {
  const normalized = normalizeTarget(target);
  assert(normalized.type !== 'city', 'invalid-argument', 'Destinations use the admin catalog workflow.');
  const db = admin.firestore();
  const { ref, before } = await markDeleting({
    admin,
    target: normalized,
    actorUid,
    isAdmin,
  });

  await Promise.all([
    deleteQueryInBatches(db, () => db.collectionGroup('favorites').where('target.path', '==', normalized.path)),
    deleteQueryInBatches(db, () => db.collectionGroup('notifications').where('target.path', '==', normalized.path)),
  ]);

  if (normalized.type === 'recommendation') {
    await refreshRecommendationFallbackForDestination({
      admin,
      countryId: before.destination?.countryId,
      cityId: before.destination?.cityId,
      force: true,
    });
  }

  await cleanupRemovedMedia(admin, before, null, {
    allowedPrefixes: buildAllowedMediaPrefixes(
      normalized.type === 'recommendation' ? 'recommendations' : `${normalized.type}s`,
      normalized.id,
      before
    ),
    bucketName: mediaBucket,
  });

  if (typeof db.recursiveDelete === 'function') {
    await db.recursiveDelete(ref);
  } else {
    await Promise.all([
      deleteQueryInBatches(db, () => ref.collection('likes')),
      deleteQueryInBatches(db, () => ref.collection('comments')),
      deleteQueryInBatches(db, () => ref.collection('days')),
    ]);
    await ref.delete();
  }
  return { deleted: true, path: normalized.path };
}

async function deleteContent({ admin, auth, data, mediaBucket }) {
  assert(auth?.uid, 'unauthenticated', 'You must be signed in.');
  assert(isVerified(auth), 'permission-denied', 'Email verification is required.');
  await consumeRateLimit({ admin, uid: auth.uid, action: 'deleteContent' });
  return deleteContentInternal({
    admin,
    target: data?.target,
    actorUid: auth.uid,
    isAdmin: auth.token?.admin === true,
    mediaBucket,
  });
}

async function deleteOwnedContent({ admin, uid, mediaBucket }) {
  const db = admin.firestore();
  let deleted = 0;
  for (const [type, collectionName] of [
    ['recommendation', 'recommendations'],
    ['route', 'routes'],
    ['trip', 'trips'],
  ]) {
    const snapshot = await db.collection(collectionName).where('ownerId', '==', uid).get();
    for (const entry of snapshot.docs) {
      await deleteContentInternal({
        admin,
        target: { type, id: entry.id },
        actorUid: uid,
        isAdmin: true,
        mediaBucket,
      });
      deleted += 1;
    }
  }
  return deleted;
}

async function removeAuthoredInteractions({ admin, uid }) {
  const db = admin.firestore();
  const comments = await db.collectionGroup('comments').where('authorId', '==', uid).get();
  const likes = await db.collectionGroup('likes').where('userId', '==', uid).get();
  const actorNotifications = await db
    .collectionGroup('notifications')
    .where('actorId', '==', uid)
    .get();
  const affectedParents = new Map();
  comments.docs.forEach((entry) => {
    const parent = entry.ref.parent.parent;
    if (parent) affectedParents.set(parent.path, parent);
  });
  likes.docs.forEach((entry) => {
    const parent = entry.ref.parent.parent;
    if (parent) affectedParents.set(parent.path, parent);
  });
  const refs = [...comments.docs, ...likes.docs, ...actorNotifications.docs].map((entry) => entry.ref);
  for (let offset = 0; offset < refs.length; offset += 400) {
    const batch = db.batch();
    refs.slice(offset, offset + 400).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
  for (const parent of affectedParents.values()) {
    const [parentSnapshot, likesCount, commentsCount] = await Promise.all([
      parent.get(),
      parent.collection('likes').count().get(),
      parent.collection('comments').count().get(),
    ]);
    if (parentSnapshot.exists && parentSnapshot.data()?.status === 'active') {
      await parent.update({
        'stats.likeCount': likesCount.data().count,
        'stats.commentCount': commentsCount.data().count,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  }
  return { comments: comments.size, likes: likes.size, notifications: actorNotifications.size };
}

async function requestAccountDeletion({ admin, auth, mediaBucket }) {
  assert(auth?.uid, 'unauthenticated', 'You must be signed in.');
  const authTimeSeconds = Number(auth.token?.auth_time || 0);
  assert(
    authTimeSeconds > 0 && Date.now() / 1000 - authTimeSeconds <= 5 * 60,
    'failed-precondition',
    'Recent sign-in is required before deleting an account.'
  );
  const uid = auth.uid;
  const db = admin.firestore();
  const jobRef = db.doc(`system/accountDeletion/jobs/${uid}`);
  const updateJob = (step, extra = {}) => jobRef.set({
    uid,
    status: 'running',
    step,
    ...extra,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  await jobRef.set({
    uid,
    status: 'running',
    step: 'content',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  const ownedContent = await deleteOwnedContent({ admin, uid, mediaBucket });
  await updateJob('interactions', { ownedContent });
  const interactions = await removeAuthoredInteractions({ admin, uid });
  await updateJob('private-data', { interactions });

  const userRef = db.doc(`users/${uid}`);
  if (typeof db.recursiveDelete === 'function') {
    await db.recursiveDelete(userRef);
  } else {
    await Promise.all([
      deleteQueryInBatches(db, () => userRef.collection('favorites')),
      deleteQueryInBatches(db, () => userRef.collection('notifications')),
      deleteQueryInBatches(db, () => userRef.collection('serverState')),
    ]);
    await userRef.delete().catch(() => {});
  }
  await db.doc(`publicProfiles/${uid}`).delete().catch(() => {});
  if (mediaBucket) {
    const bucket = admin.storage().bucket(mediaBucket);
    await Promise.all([
      bucket.deleteFiles({ prefix: `media/${uid}/`, force: true }),
      bucket.deleteFiles({ prefix: `media-staging/${uid}/`, force: true }),
    ]);
  }
  await updateJob('auth');
  await admin.auth().deleteUser(uid);
  await jobRef.set({
    uid,
    status: 'complete',
    step: 'complete',
    completedAt: admin.firestore.FieldValue.serverTimestamp(),
    expireAt: admin.firestore.Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000),
  }, { merge: true });
  return { jobId: uid, status: 'complete' };
}

module.exports = {
  deleteContent,
  deleteContentInternal,
  deleteOwnedContent,
  deleteQueryInBatches,
  requestAccountDeletion,
};
