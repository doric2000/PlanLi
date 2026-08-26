const { HttpsError } = require('firebase-functions/v2/https');
const {
  buildAllowedMediaPrefixes,
  cleanupRemovedMedia,
} = require('./mediaCleanup');
const {
  consumeRateLimit,
  deleteComment,
  isVerified,
  normalizeTarget,
} = require('./socialService');
const { refreshRecommendationFallbackForDestination } = require('./destinationImageService');
const { revokeAppleAuthorization } = require('./appleAuthService');
const {
  deactivateAdminRegistryInTransaction,
  hasActiveAdminAccess,
} = require('./adminAuthorization');
const {
  detachGroupedLikeContribution,
  purgeNotificationsForActor,
  purgeNotificationsForTarget,
} = require('./notificationService');

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

function isNotFound(error) {
  return error?.code === 5 || error?.code === 404 || error?.code === '404';
}

async function deleteDocumentStrict(ref) {
  try {
    await ref.delete();
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
}

async function deleteRecommendationDraftsForUser({ admin, uid }) {
  const db = admin.firestore();
  const ownerRef = db.doc(`system/recommendationDrafts/owners/${uid}`);
  if (typeof db.recursiveDelete === 'function') {
    await db.recursiveDelete(ownerRef);
    return;
  }
  await Promise.all([
    deleteQueryInBatches(db, () => ownerRef.collection('draftVersions')),
    deleteQueryInBatches(db, () => ownerRef.collection('publicationReceipts')),
  ]);
  await deleteDocumentStrict(ownerRef);
}

async function removeReporterModerationData({ admin, uid }) {
  const db = admin.firestore();
  const reports = await db.collectionGroup('reports').where('reporterId', '==', uid).get();
  for (const entry of reports.docs) {
    const caseRef = entry.ref.parent.parent;
    await db.runTransaction(async (transaction) => {
      const caseSnapshot = caseRef ? await transaction.get(caseRef) : null;
      if (caseSnapshot?.exists) {
        const caseData = caseSnapshot.data() || {};
        const category = entry.data()?.category;
        transaction.update(caseRef, {
          reportCount: Math.max(0, Number(caseData.reportCount || 0) - 1),
          uniqueCount24h: Math.max(
            0,
            Number(caseData.uniqueCount24h || 0) - (caseData.recentReporters?.[uid] ? 1 : 0)
          ),
          [`recentReporters.${uid}`]: admin.firestore.FieldValue.delete(),
          ...(category ? {
            [`categoryCounts.${category}`]: Math.max(
              0,
              Number(caseData.categoryCounts?.[category] || 0) - 1
            ),
          } : {}),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      transaction.delete(entry.ref);
    });
  }
  return reports.size;
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
        cityRef = db.doc(`countries/${countryId}/destinations/${cityId}`);
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
    purgeNotificationsForTarget({
      admin,
      targetPath: normalized.path,
      includeDescendants: true,
    }),
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
  const isAdmin = await hasActiveAdminAccess({ admin, auth });
  assert(isVerified(auth) || isAdmin, 'permission-denied', 'Email verification is required.');
  await consumeRateLimit({ admin, uid: auth.uid, action: 'deleteContent' });
  return deleteContentInternal({
    admin,
    target: data?.target,
    actorUid: auth.uid,
    isAdmin,
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
  const affectedParents = new Map();
  comments.docs.forEach((entry) => {
    const parent = entry.ref.parent.parent;
    if (parent) affectedParents.set(parent.path, parent);
  });
  likes.docs.forEach((entry) => {
    const parent = entry.ref.parent.parent;
    if (parent) affectedParents.set(parent.path, parent);
  });
  const orderedComments = [...comments.docs].sort((left, right) => {
    const leftRoot = left.data()?.threadType !== 'reply';
    const rightRoot = right.data()?.threadType !== 'reply';
    return Number(rightRoot) - Number(leftRoot);
  });
  for (const entry of orderedComments) {
    const current = await entry.ref.get();
    if (!current.exists) continue;
    const parent = entry.ref.parent.parent;
    if (!parent) continue;
    const [collectionName, parentId] = parent.path.split('/');
    const type = collectionName === 'routes'
      ? 'route'
      : collectionName === 'trips'
        ? 'trip'
        : 'recommendation';
    await deleteComment({
      admin,
      auth: null,
      internalActorUid: uid,
      data: { target: { type, id: parentId }, commentId: entry.id },
    });
  }
  for (let offset = 0; offset < likes.docs.length; offset += 10) {
    await Promise.all(likes.docs.slice(offset, offset + 10).map((entry) => (
      detachGroupedLikeContribution({ admin, likeRef: entry.ref, deleteLike: true })
    )));
  }
  const removedNotifications = await purgeNotificationsForActor({ admin, actorId: uid });
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
  return { comments: comments.size, likes: likes.size, notifications: removedNotifications };
}

async function deleteNotificationDevicesForUser({ admin, uid }) {
  const db = admin.firestore();
  return deleteQueryInBatches(
    db,
    () => db.collection('notificationDevices').where('uid', '==', uid)
  );
}

async function requestAccountDeletion({
  admin,
  auth,
  data,
  mediaBucket,
  appleConfig,
  revokeAppleAuthorizationImpl = revokeAppleAuthorization,
}) {
  assert(auth?.uid, 'unauthenticated', 'You must be signed in.');
  assert(data == null || (data && typeof data === 'object' && !Array.isArray(data)),
    'invalid-argument', 'Account deletion request is invalid.');
  assert(Object.keys(data || {}).every((key) => key === 'appleAuthorizationCode'),
    'invalid-argument', 'Account deletion request contains unsupported fields.');
  const authTimeSeconds = Number(auth.token?.auth_time || 0);
  assert(
    authTimeSeconds > 0 && Date.now() / 1000 - authTimeSeconds <= 5 * 60,
    'failed-precondition',
    'Recent sign-in is required before deleting an account.'
  );
  const uid = auth.uid;
  const activeAdmin = await hasActiveAdminAccess({ admin, auth });
  assert(
    !activeAdmin,
    'failed-precondition',
    'Another administrator must remove admin access before this account can be deleted.'
  );
  const authUser = await admin.auth().getUser(uid);
  const appleProvider = (authUser.providerData || []).find((provider) => provider.providerId === 'apple.com');
  if (appleProvider) {
    await revokeAppleAuthorizationImpl({
      authorizationCode: data?.appleAuthorizationCode,
      expectedSubject: appleProvider.uid,
      config: appleConfig,
    });
  } else {
    assert(!data?.appleAuthorizationCode, 'invalid-argument', 'Apple authorization is not linked to this account.');
  }
  const result = await deleteAccountInternal({
    admin,
    uid,
    mediaBucket,
    rejectActiveAdminTarget: true,
  });
  return { jobId: result.jobId, status: result.status };
}

async function deleteAccountInternal({
  admin,
  uid,
  mediaBucket,
  actorUid = null,
  requireActiveAdminActor = false,
  rejectActiveAdminTarget = false,
}) {
  const db = admin.firestore();
  const jobRef = db.doc(`system/accountDeletion/jobs/${uid}`);
  const userRef = db.doc(`users/${uid}`);
  const adminRegistryRef = db.doc(`system/moderation/admins/${uid}`);
  const updateJob = (step, extra = {}) => jobRef.set({
    uid,
    status: 'running',
    step,
    ...extra,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  await db.runTransaction(async (transaction) => {
    const userSnapshot = await transaction.get(userRef);
    await deactivateAdminRegistryInTransaction({
      admin,
      transaction,
      uid,
      actorUid,
      requireActiveActor: requireActiveAdminActor,
      rejectActiveTarget: rejectActiveAdminTarget,
    });
    if (userSnapshot.exists) {
      transaction.set(userRef, {
        status: 'deleting',
        moderation: {
          ...(userSnapshot.data()?.moderation || {}),
          status: 'deleting',
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  });

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
  const purgedReports = await removeReporterModerationData({ admin, uid });
  await updateJob('public-profile', { interactions, purgedReports });

  const publicProfileRef = db.doc(`publicProfiles/${uid}`);
  await purgeNotificationsForTarget({ admin, targetPath: publicProfileRef.path });
  await publicProfileRef.set({ status: 'deleting' }, { merge: true });
  await deleteDocumentStrict(publicProfileRef);
  await updateJob('private-data');

  if (typeof db.recursiveDelete === 'function') {
    await db.recursiveDelete(userRef);
  } else {
    await Promise.all([
      deleteQueryInBatches(db, () => userRef.collection('favorites')),
      deleteQueryInBatches(db, () => userRef.collection('notifications')),
      deleteQueryInBatches(db, () => userRef.collection('notificationState')),
      deleteQueryInBatches(db, () => userRef.collection('blockedUsers')),
      deleteQueryInBatches(db, () => userRef.collection('serverState')),
    ]);
    await deleteDocumentStrict(userRef);
  }
  await Promise.all([
    deleteQueryInBatches(
      db,
      () => db.collection('system/moderation/ownerNotifications').where('uid', '==', uid)
    ),
    deleteQueryInBatches(db, () => userRef.collection('notifications')),
    deleteQueryInBatches(db, () => userRef.collection('notificationState')),
    deleteQueryInBatches(db, () => db.collection('system/media/assets').where('ownerUid', '==', uid)),
    deleteNotificationDevicesForUser({ admin, uid }),
    deleteRecommendationDraftsForUser({ admin, uid }),
    deleteDocumentStrict(adminRegistryRef),
  ]);
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
  return {
    jobId: uid,
    status: 'complete',
    ownedContent,
    interactions,
    purgedReports,
  };
}

module.exports = {
  deleteAccountInternal,
  deleteContent,
  deleteContentInternal,
  deleteOwnedContent,
  deleteRecommendationDraftsForUser,
  deleteNotificationDevicesForUser,
  deleteQueryInBatches,
  deleteDocumentStrict,
  removeAuthoredInteractions,
  removeReporterModerationData,
  requestAccountDeletion,
};
