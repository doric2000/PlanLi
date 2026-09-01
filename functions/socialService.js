const crypto = require('crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { hasActiveAdminAccess } = require('./adminAuthorization');
const { applyAffinitySignalInTransaction } = require('./personalizationService');
const { evaluateTextSafety } = require('./moderationService');
const {
  buildNotificationTarget,
  clearNotifications,
  commentNotificationId,
  deleteNotification,
  groupedLikeNotificationId,
  likeMilestoneNotificationId,
  markAllNotificationsRead,
  navigationForTarget,
  notificationCleanupJobRef,
  notificationRecipientEligible,
  prepareGroupedLikeActivity,
  prepareGroupedLikeRemoval,
  prepareLikeMilestoneActivity,
  processNotificationCleanupJob,
  purgeNotificationsForTarget,
  sanitizeActorPreview,
  setNotificationRead,
  stageNotificationActivity,
  stageNotificationCleanupJob,
  stageNotificationDelete,
} = require('./notificationService');
const { destinationHebrewName } = require('./destinationLocalizationService');
const {
  contentIsPubliclyVisible,
  destinationIsPublicInCountry,
  isDestinationReassigning,
} = require('./destinationReferencePolicy');

const TARGETS = Object.freeze({
  recommendation: { collection: 'recommendations' },
  route: { collection: 'routes' },
  trip: { collection: 'trips' },
  city: { collection: 'destinations', nested: true },
});

const TYPE_ALIASES = Object.freeze({
  recommendation: 'recommendation',
  recommendations: 'recommendation',
  route: 'route',
  routes: 'route',
  roadtrip: 'route',
  roadtrips: 'route',
  trip: 'trip',
  trips: 'trip',
  city: 'city',
  cities: 'city',
});

const RATE_LIMITS = Object.freeze({
  favorite: { max: 120, windowMs: 60 * 1000 },
  reaction: { max: 120, windowMs: 60 * 1000 },
  comment: { max: 30, windowMs: 10 * 60 * 1000 },
  deleteContent: { max: 20, windowMs: 60 * 60 * 1000 },
  notification: { max: 120, windowMs: 60 * 1000 },
  recommendationDraftSave: { max: 120, windowMs: 10 * 60 * 1000 },
});

const COMMENT_THREAD_DELETE_PAGE_SIZE = 200;
const COMMENT_THREAD_DELETE_JOB_SCHEMA_VERSION = 1;

function assert(condition, code, message) {
  if (!condition) throw new HttpsError(code, message);
}

function cleanId(value, field = 'id') {
  assert(typeof value === 'string', 'invalid-argument', `${field} must be a string.`);
  const result = value.trim();
  assert(result.length >= 1 && result.length <= 180, 'invalid-argument', `${field} is invalid.`);
  assert(!result.includes('/'), 'invalid-argument', `${field} must not contain a slash.`);
  return result;
}

function cleanText(value, { field, min = 1, max }) {
  assert(typeof value === 'string', 'invalid-argument', `${field} must be a string.`);
  const result = value.trim();
  assert(result.length >= min && result.length <= max, 'invalid-argument', `${field} is invalid.`);
  return result;
}

function isVerified(auth) {
  if (!auth?.uid) return false;
  const provider = auth.token?.firebase?.sign_in_provider;
  return provider !== 'password' || auth.token?.email_verified === true;
}

function assertVerified(auth) {
  assert(auth?.uid, 'unauthenticated', 'You must be signed in.');
  assert(isVerified(auth), 'permission-denied', 'Email verification is required.');
}

function normalizeTarget(target) {
  assert(target && typeof target === 'object', 'invalid-argument', 'Missing target.');
  const type = TYPE_ALIASES[String(target.type || '').toLowerCase()];
  assert(type && TARGETS[type], 'invalid-argument', 'Unsupported target type.');
  const id = cleanId(target.id, 'target.id');
  const countryId = type === 'city'
    ? cleanId(target.countryId, 'target.countryId')
    : null;
  const path = type === 'city'
    ? `countries/${countryId}/destinations/${id}`
    : `${TARGETS[type].collection}/${id}`;
  return { type, id, ...(countryId ? { countryId } : {}), path };
}

function favoriteKeyForPath(path) {
  return crypto.createHash('sha256').update(path).digest('base64url');
}

function commentThreadDeletionJobId(rootCommentPath) {
  return crypto.createHash('sha256').update(rootCommentPath).digest('base64url');
}

function commentThreadDeletionJobRef(db, rootCommentPath) {
  return db.doc(
    `system/runtime/commentThreadDeletionJobs/${commentThreadDeletionJobId(rootCommentPath)}`
  );
}

function canonicalCommentThread(value, commentId) {
  const threadType = value?.threadType === 'reply' ? 'reply' : 'root';
  const threadRootId = threadType === 'reply'
    ? cleanId(value?.threadRootId, 'threadRootId')
    : commentId;
  const replyToCommentId = threadType === 'reply'
    ? cleanId(value?.replyToCommentId, 'replyToCommentId')
    : null;
  return { threadType, threadRootId, replyToCommentId };
}

function compactObject(value) {
  if (Array.isArray(value)) return value.map(compactObject);
  if (!value || typeof value !== 'object') return value;
  if (typeof value.toDate === 'function' || typeof value.toMillis === 'function') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, compactObject(entry)])
  );
}

function mediaThumb(data) {
  if (data?.destinationImage?.urls?.thumb) return data.destinationImage.urls.thumb;
  const first = Array.isArray(data?.media) ? data.media[0] : data?.media;
  return first?.thumb?.url || data?.externalImageUrl || data?.imageUrl || null;
}

function mediaPlaceholder(data) {
  if (data?.destinationImage) {
    return data.destinationImage.color || data.placeholderColor || '#E5E7EB';
  }
  const first = Array.isArray(data?.media) ? data.media[0] : data?.media;
  return first?.placeholder?.color || data?.placeholderColor || '#E5E7EB';
}

function buildFavoritePreview({ target, data, publicProfile }) {
  const description = typeof data?.description === 'string' ? data.description.trim() : '';
  const subtitle = target.type === 'city'
    ? (data?.countryName || '')
    : description.slice(0, 140);
  return compactObject({
    title: data?.title || (target.type === 'city' ? destinationHebrewName(data) : '') || data?.name || '',
    subtitle,
    thumbUrl: mediaThumb(data),
    placeholderColor: mediaPlaceholder(data),
    ...(target.type === 'city'
      ? { destinationImage: data?.destinationImage || null }
      : {}),
    ...(target.type === 'city'
      ? { cacheExpiresAt: data?.googleCache?.expiresAt || null }
      : {}),
    ...(target.type === 'recommendation'
      ? {
          categoryId: data?.categoryId || null,
          category: data?.category || null,
        }
      : {}),
    owner: data?.ownerId
      ? {
          id: data.ownerId,
          displayName: publicProfile?.displayName || 'Traveler',
          photoURL: publicProfile?.photoURL || null,
        }
      : null,
    metrics: {
      days: Number.isFinite(Number(data?.dayCount)) ? Number(data.dayCount) : null,
      distanceKm: Number.isFinite(Number(data?.distanceKm)) ? Number(data.distanceKm) : null,
      travelers: Number.isFinite(Number(data?.travelers)) ? Number(data.travelers) : null,
    },
  });
}

async function consumeRateLimit({ admin, uid, action, now = Date.now() }) {
  const rule = RATE_LIMITS[action];
  if (!rule) return;
  const db = admin.firestore();
  const ref = db.doc(`users/${uid}/serverState/rateLimits_${action}`);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.exists ? snapshot.data() : {};
    const startedAt = Number(data.windowStartedAtMs || 0);
    const inWindow = now - startedAt < rule.windowMs;
    const count = inWindow ? Number(data.count || 0) : 0;
    assert(count < rule.max, 'resource-exhausted', 'Too many requests. Please try again later.');
    transaction.set(ref, {
      action,
      count: count + 1,
      windowStartedAtMs: inWindow ? startedAt : now,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
}

async function loadAuthorProfile(transaction, db, ownerId) {
  if (!ownerId) return null;
  const snapshot = await transaction.get(db.doc(`publicProfiles/${ownerId}`));
  return snapshot.exists ? snapshot.data() : null;
}

function assertActiveTarget(snapshot, target, country = null) {
  assert(snapshot.exists, 'not-found', 'The selected item no longer exists.');
  const data = snapshot.data();
  assert(
    target?.type === 'city'
      ? destinationIsPublicInCountry(data, country, target.countryId)
      : contentIsPubliclyVisible(data),
    'failed-precondition',
    'The selected item is not available.'
  );
  assert(target?.type !== 'city' || !isDestinationReassigning(data), 'failed-precondition',
    'The selected destination is being reassigned. Try again shortly.');
  return data;
}

function assertDestinationFavoriteMutationAllowed(target, targetData) {
  assert(target?.type !== 'city' || !isDestinationReassigning(targetData),
    'failed-precondition', 'The selected destination is being reassigned. Try again shortly.');
}

async function setFavorite({ admin, auth, data }) {
  assertVerified(auth);
  const target = normalizeTarget(data?.target);
  const saved = data?.saved;
  assert(typeof saved === 'boolean', 'invalid-argument', 'saved must be boolean.');
  await consumeRateLimit({ admin, uid: auth.uid, action: 'favorite' });

  const db = admin.firestore();
  const key = favoriteKeyForPath(target.path);
  const favoriteRef = db.doc(`users/${auth.uid}/favorites/${key}`);
  const targetRef = db.doc(target.path);

  await db.runTransaction(async (transaction) => {
    const [targetSnapshot, countrySnapshot] = await Promise.all([
      transaction.get(targetRef),
      target.type === 'city'
        ? transaction.get(db.doc(`countries/${target.countryId}`))
        : Promise.resolve(null),
    ]);
    assertDestinationFavoriteMutationAllowed(target, targetSnapshot.data());
    const targetData = saved
      ? assertActiveTarget(targetSnapshot, target, countrySnapshot?.data?.())
      : targetSnapshot.data();
    const publicProfile = saved
      ? await loadAuthorProfile(transaction, db, targetData.ownerId)
      : null;
    const existing = await transaction.get(favoriteRef);
    if (saved !== existing.exists && targetData) {
      await applyAffinitySignalInTransaction({
        transaction,
        db,
        admin,
        userId: auth.uid,
        target,
        targetData,
        delta: saved ? (target.type === 'city' ? 6 : 5) : (target.type === 'city' ? -6 : -5),
        action: saved ? 'favorite' : 'unfavorite',
      });
    }
    if (!saved) {
      transaction.delete(favoriteRef);
    } else {
      transaction.set(favoriteRef, {
        ownerId: auth.uid,
        type: target.type,
        target,
        preview: buildFavoritePreview({ target, data: targetData, publicProfile }),
        createdAt: existing.exists
          ? existing.data().createdAt
          : admin.firestore.FieldValue.serverTimestamp(),
        sourceUpdatedAt:
          targetData.updatedAt || targetData.createdAt || admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  });

  return { saved, favoriteKey: key };
}

async function setReaction({ admin, auth, data }) {
  assertVerified(auth);
  const target = normalizeTarget(data?.target);
  assert(target.type !== 'city', 'invalid-argument', 'Cities do not support reactions.');
  const liked = data?.liked;
  assert(typeof liked === 'boolean', 'invalid-argument', 'liked must be boolean.');
  await consumeRateLimit({ admin, uid: auth.uid, action: 'reaction' });

  const db = admin.firestore();
  const targetRef = db.doc(target.path);
  const likeRef = targetRef.collection('likes').doc(auth.uid);

  let nextCount = 0;
  await db.runTransaction(async (transaction) => {
    const [targetSnapshot, likeSnapshot] = await Promise.all([
      transaction.get(targetRef),
      transaction.get(likeRef),
    ]);
    const targetData = assertActiveTarget(targetSnapshot, target);
    const wasLiked = likeSnapshot.exists;
    const currentCount = Math.max(0, Number(targetData?.stats?.likeCount || 0));
    nextCount = currentCount;
    if (liked !== wasLiked) nextCount = Math.max(0, currentCount + (liked ? 1 : -1));

    const ownerId = targetData.ownerId;
    const shouldNotifyOwner = ownerId && ownerId !== auth.uid && liked !== wasLiked;
    const notificationTarget = buildNotificationTarget({ target, data: targetData });
    const milestoneActivity = liked && !wasLiked && shouldNotifyOwner
      ? prepareLikeMilestoneActivity({
        currentCount,
        nextCount,
        notifiedMilestone: targetData?.stats?.notifiedLikeMilestone,
        target: notificationTarget,
        navigation: navigationForTarget(target),
      })
      : null;
    const actor = liked && !wasLiked
      ? await loadAuthorProfile(transaction, db, auth.uid)
      : null;
    const likeData = likeSnapshot.exists ? likeSnapshot.data() || {} : {};
    const notificationId = liked
      ? groupedLikeNotificationId(target.path)
      : (typeof likeData.notificationId === 'string' ? likeData.notificationId : null);
    const notificationGeneration = typeof likeData.notificationGeneration === 'string'
      ? likeData.notificationGeneration
      : null;
    const notificationRef = shouldNotifyOwner && notificationId
      ? db.doc(`users/${ownerId}/notifications/${notificationId}`)
      : null;
    const milestoneRef = shouldNotifyOwner && milestoneActivity
      ? db.doc(`users/${ownerId}/notifications/${
        likeMilestoneNotificationId(target.path, milestoneActivity.milestone)
      }`)
      : null;
    const shouldReadRecipient = Boolean(notificationRef || milestoneRef);
    const [notificationSnapshot, milestoneSnapshot, ownerSnapshot, blockedSnapshot] = shouldReadRecipient
      ? await Promise.all([
        notificationRef ? transaction.get(notificationRef) : Promise.resolve(null),
        milestoneRef ? transaction.get(milestoneRef) : Promise.resolve(null),
        transaction.get(db.doc(`users/${ownerId}`)),
        transaction.get(db.doc(`users/${ownerId}/blockedUsers/${auth.uid}`)),
      ])
      : [null, null, null, null];
    const canNotifyOwner = shouldReadRecipient
      && notificationRecipientEligible(ownerSnapshot)
      && !blockedSnapshot?.exists;
    let deliveredMilestone = null;

    if (liked !== wasLiked) {
      await applyAffinitySignalInTransaction({
        transaction,
        db,
        admin,
        userId: auth.uid,
        target,
        targetData,
        delta: liked ? 3 : -3,
        action: liked ? 'like' : 'unlike',
      });
    }

    if (liked && !wasLiked) {
      let preparedNotification = null;
      if (canNotifyOwner && notificationSnapshot) {
        const actorPreview = sanitizeActorPreview({
          id: auth.uid,
          displayName: actor?.displayName,
          photoURL: actor?.photoURL,
        });
        preparedNotification = prepareGroupedLikeActivity({
          existingSnapshot: notificationSnapshot,
          actorPreview,
          target: notificationTarget,
          navigation: navigationForTarget(target),
        });
        stageNotificationActivity({
          transaction,
          admin,
          db,
          uid: ownerId,
          notificationRef,
          existingSnapshot: notificationSnapshot,
          notification: preparedNotification.notification,
        });
      }
      if (canNotifyOwner && milestoneRef && milestoneSnapshot && milestoneActivity) {
        if (!milestoneSnapshot.exists) {
          stageNotificationActivity({
            transaction,
            admin,
            db,
            uid: ownerId,
            notificationRef: milestoneRef,
            existingSnapshot: milestoneSnapshot,
            notification: milestoneActivity.notification,
          });
        }
        deliveredMilestone = milestoneActivity.milestone;
      }
      transaction.create(likeRef, {
        userId: auth.uid,
        userPreview: {
          displayName: actor?.displayName || 'Traveler',
          photoURL: actor?.photoURL || null,
        },
        ...(preparedNotification ? {
          notificationId,
          notificationGeneration: preparedNotification.generation,
          notificationRecipientId: ownerId,
        } : {}),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else if (!liked && wasLiked) {
      transaction.delete(likeRef);
      if (notificationRef && notificationSnapshot && notificationGeneration) {
        const transition = prepareGroupedLikeRemoval({
          existingSnapshot: notificationSnapshot,
          actorId: auth.uid,
          generation: notificationGeneration,
        });
        if (transition.action === 'delete') {
          stageNotificationDelete({
            transaction,
            admin,
            db,
            uid: ownerId,
            notificationRef,
            existingSnapshot: notificationSnapshot,
          });
        } else if (transition.action === 'update') {
          transaction.update(notificationRef, transition.patch);
        }
      }
    }
    if (liked !== wasLiked) {
      transaction.update(targetRef, {
        'stats.likeCount': nextCount,
        ...(deliveredMilestone ? { 'stats.notifiedLikeMilestone': deliveredMilestone } : {}),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

  });

  return { liked, likeCount: nextCount };
}

async function getReactionState({ admin, auth, data }) {
  assert(auth?.uid, 'unauthenticated', 'You must be signed in.');
  const target = normalizeTarget(data?.target);
  const snapshot = await admin.firestore().doc(`${target.path}/likes/${auth.uid}`).get();
  return { liked: snapshot.exists };
}

async function saveComment({ admin, auth, data }) {
  const isAdmin = await hasActiveAdminAccess({ admin, auth, requireRecentTotp: true });
  if (!isAdmin) assertVerified(auth);
  const target = normalizeTarget(data?.target);
  assert(target.type !== 'city', 'invalid-argument', 'Cities do not support comments.');
  const text = cleanText(data?.text, { field: 'text', min: 1, max: 2000 });
  const textSafety = evaluateTextSafety(text);
  assert(textSafety.safe, 'invalid-argument', 'This comment cannot be published. Please revise it.');
  const commentId = data?.commentId ? cleanId(data.commentId, 'commentId') : null;
  const replyToCommentId = data?.replyToCommentId
    ? cleanId(data.replyToCommentId, 'replyToCommentId')
    : null;
  assert(
    !(commentId && replyToCommentId),
    'invalid-argument',
    'A comment relationship cannot be changed while editing.'
  );
  await consumeRateLimit({ admin, uid: auth.uid, action: 'comment' });

  const db = admin.firestore();
  const targetRef = db.doc(target.path);
  const commentRef = commentId
    ? targetRef.collection('comments').doc(commentId)
    : targetRef.collection('comments').doc();

  let result;
  await db.runTransaction(async (transaction) => {
    const [targetSnapshot, commentSnapshot, authorSnapshot] = await Promise.all([
      transaction.get(targetRef),
      transaction.get(commentRef),
      transaction.get(db.doc(`publicProfiles/${auth.uid}`)),
    ]);
    const targetData = assertActiveTarget(targetSnapshot, target);
    const author = authorSnapshot.exists ? authorSnapshot.data() : {};
    const authorPreview = {
      displayName: author.displayName || 'Traveler',
      photoURL: author.photoURL || null,
    };
    if (commentId) {
      assert(commentSnapshot.exists, 'not-found', 'Comment does not exist.');
      const previous = commentSnapshot.data();
      assert(
        previous.status === 'active',
        'failed-precondition',
        'Only published comments can be edited.'
      );
      assert(
        previous.authorId === auth.uid || isAdmin,
        'permission-denied',
        'You do not own this comment.'
      );
      transaction.update(commentRef, {
        text,
        authorPreview,
        ...(!previous.threadType ? {
          threadType: 'root',
          threadRootId: commentRef.id,
          replyToCommentId: null,
          replyCount: Math.max(0, Math.trunc(Number(previous.replyCount) || 0)),
        } : {}),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      const thread = canonicalCommentThread(previous, commentRef.id);
      result = {
        id: commentRef.id,
        authorId: auth.uid,
        authorPreview,
        text,
        ...thread,
        replyCount: Math.max(0, Math.trunc(Number(previous.replyCount) || 0)),
      };
    } else {
      let directReplySnapshot = null;
      let rootSnapshot = null;
      let rootRef = null;
      let directReplyAuthorId = null;
      let threadRootId = commentRef.id;
      let threadType = 'root';

      if (replyToCommentId) {
        const directReplyRef = targetRef.collection('comments').doc(replyToCommentId);
        directReplySnapshot = await transaction.get(directReplyRef);
        assert(
          directReplySnapshot.exists && directReplySnapshot.data()?.status === 'active',
          'failed-precondition',
          'The comment being replied to is no longer available.'
        );
        const directReply = directReplySnapshot.data() || {};
        const directThread = canonicalCommentThread(directReply, directReplyRef.id);
        directReplyAuthorId = cleanId(directReply.authorId, 'replyAuthorId');
        threadRootId = directThread.threadRootId;
        threadType = 'reply';
        rootRef = targetRef.collection('comments').doc(threadRootId);
        rootSnapshot = rootRef.path === directReplyRef.path
          ? directReplySnapshot
          : await transaction.get(rootRef);
        assert(
          rootSnapshot.exists && rootSnapshot.data()?.status === 'active',
          'failed-precondition',
          'The reply thread is no longer available.'
        );
        const rootThread = canonicalCommentThread(rootSnapshot.data() || {}, rootRef.id);
        assert(rootThread.threadType === 'root', 'failed-precondition', 'The reply thread is invalid.');
      }

      const recipients = new Map();
      const addRecipient = (uid, subtype) => {
        if (!uid || uid === auth.uid) return;
        const existing = recipients.get(uid);
        if (!existing || subtype === 'new_reply') recipients.set(uid, subtype);
      };
      if (directReplyAuthorId) addRecipient(directReplyAuthorId, 'new_reply');
      addRecipient(targetData.ownerId, 'new_comment');

      const notificationId = commentNotificationId(target.path, commentRef.id);
      const recipientRecords = await Promise.all(Array.from(recipients.entries()).map(
        async ([uid, subtype]) => {
          const notificationRef = db.doc(`users/${uid}/notifications/${notificationId}`);
          const [notificationSnapshot, recipientSnapshot, blockedSnapshot] = await Promise.all([
            transaction.get(notificationRef),
            transaction.get(db.doc(`users/${uid}`)),
            transaction.get(db.doc(`users/${uid}/blockedUsers/${auth.uid}`)),
          ]);
          return {
            uid,
            subtype,
            notificationRef,
            notificationSnapshot,
            eligible: notificationRecipientEligible(recipientSnapshot) && !blockedSnapshot.exists,
          };
        }
      ));

      transaction.create(commentRef, {
        authorId: auth.uid,
        authorPreview,
        text,
        status: 'active',
        threadType,
        threadRootId,
        replyToCommentId,
        replyCount: 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      const nextCount = Math.max(0, Number(targetData?.stats?.commentCount || 0)) + 1;
      transaction.update(targetRef, {
        'stats.commentCount': nextCount,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      if (rootRef && rootSnapshot) {
        transaction.update(rootRef, {
          replyCount: Math.max(0, Math.trunc(Number(rootSnapshot.data()?.replyCount) || 0)) + 1,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          ...(!rootSnapshot.data()?.threadType ? {
            threadType: 'root',
            threadRootId: rootRef.id,
            replyToCommentId: null,
          } : {}),
        });
      }

      const commentTarget = {
        type: 'comment',
        id: commentRef.id,
        parentType: target.type,
        parentId: target.id,
      };
      const notificationTarget = buildNotificationTarget({
        target: commentTarget,
        data: {},
        parentData: targetData,
      });
      recipientRecords.forEach((recipient) => {
        if (!recipient.eligible) return;
        stageNotificationActivity({
          transaction,
          admin,
          db,
          uid: recipient.uid,
          notificationRef: recipient.notificationRef,
          existingSnapshot: recipient.notificationSnapshot,
          notification: {
            channel: 'personal',
            type: 'comment',
            subtype: recipient.subtype,
            priority: 'normal',
            actorId: auth.uid,
            actorPreview: { id: auth.uid, ...authorPreview },
            actorPreviews: [{ id: auth.uid, ...authorPreview }],
            count: 1,
            commentExcerpt: text,
            target: notificationTarget,
            navigation: navigationForTarget(commentTarget),
          },
        });
      });

      result = {
        id: commentRef.id,
        authorId: auth.uid,
        authorPreview,
        text,
        threadType,
        threadRootId,
        replyToCommentId,
        replyCount: 0,
      };
    }
  });
  return { comment: result };
}

function validCommentThreadDeletionJob(value) {
  return value?.schemaVersion === COMMENT_THREAD_DELETE_JOB_SCHEMA_VERSION
    && value?.type === 'comment_thread_delete'
    && ['ready', 'complete'].includes(value?.state)
    && typeof value?.parentPath === 'string'
    && typeof value?.rootCommentPath === 'string'
    && typeof value?.rootCommentId === 'string'
    && typeof value?.authorizedUid === 'string';
}

async function processCommentThreadDeletionJob({ admin, rootCommentPath, expectedVersion = null }) {
  const db = admin.firestore();
  const jobRef = commentThreadDeletionJobRef(db, rootCommentPath);
  while (true) {
    const jobSnapshot = await jobRef.get();
    if (!jobSnapshot.exists || !validCommentThreadDeletionJob(jobSnapshot.data())) {
      return { state: 'ignored', deletedReplies: 0 };
    }
    const job = jobSnapshot.data() || {};
    if (expectedVersion != null && job.version !== expectedVersion) {
      return { state: 'superseded', deletedReplies: Number(job.deletedReplies || 0) };
    }
    if (job.state === 'complete') {
      return { state: 'complete', deletedReplies: Number(job.deletedReplies || 0) };
    }

    const commentsRef = db.doc(job.parentPath).collection('comments');
    const page = await commentsRef
      .where('threadRootId', '==', job.rootCommentId)
      .limit(COMMENT_THREAD_DELETE_PAGE_SIZE)
      .get();
    const replies = page.docs.filter((entry) => entry.id !== job.rootCommentId);
    if (replies.length) {
      for (let offset = 0; offset < replies.length; offset += 10) {
        await Promise.all(replies.slice(offset, offset + 10).map((entry) => (
          purgeNotificationsForTarget({ admin, targetPath: entry.ref.path })
        )));
      }
      const batch = db.batch();
      replies.forEach((entry) => batch.delete(entry.ref));
      await batch.commit();
      continue;
    }

    await purgeNotificationsForTarget({ admin, targetPath: rootCommentPath });
    const parentRef = db.doc(job.parentPath);
    const activeCount = await parentRef.collection('comments').where('status', '==', 'active').count().get();
    await db.runTransaction(async (transaction) => {
      const [currentJob, rootSnapshot, parentSnapshot] = await Promise.all([
        transaction.get(jobRef),
        transaction.get(db.doc(rootCommentPath)),
        transaction.get(parentRef),
      ]);
      if (!currentJob.exists || !validCommentThreadDeletionJob(currentJob.data())) return;
      const current = currentJob.data() || {};
      if (current.state === 'complete' || (expectedVersion != null && current.version !== expectedVersion)) return;
      if (rootSnapshot.exists) transaction.delete(rootSnapshot.ref);
      if (parentSnapshot.exists) {
        transaction.update(parentRef, {
          'stats.commentCount': Math.max(0, Number(activeCount.data().count || 0)),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      const expireAt = admin.firestore.Timestamp?.fromMillis
        ? admin.firestore.Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      transaction.set(jobRef, {
        state: 'complete',
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        expireAt,
      }, { merge: true });
    });
    const complete = await jobRef.get();
    return {
      state: complete.data()?.state === 'complete' ? 'complete' : 'processing',
      deletedReplies: Number(complete.data()?.deletedReplies || 0),
    };
  }
}

async function handleCommentThreadDeletionJobWrite({ admin, event }) {
  const after = event?.data?.after?.exists ? event.data.after.data() || {} : null;
  if (!validCommentThreadDeletionJob(after) || after.state !== 'ready') {
    return { state: 'ignored' };
  }
  return processCommentThreadDeletionJob({
    admin,
    rootCommentPath: after.rootCommentPath,
    expectedVersion: after.version,
  });
}

async function deleteComment({ admin, auth, data, internalActorUid = null }) {
  const internalUid = internalActorUid ? cleanId(internalActorUid, 'internalActorUid') : null;
  const isAdmin = internalUid
    ? true
    : await hasActiveAdminAccess({ admin, auth, requireRecentTotp: true });
  if (!isAdmin) assertVerified(auth);
  const actorUid = internalUid || auth.uid;
  const target = normalizeTarget(data?.target);
  const commentId = cleanId(data?.commentId, 'commentId');
  if (!internalUid) await consumeRateLimit({ admin, uid: auth.uid, action: 'comment' });
  const db = admin.firestore();
  const targetRef = db.doc(target.path);
  const commentRef = targetRef.collection('comments').doc(commentId);
  const cleanupTargetPath = `${target.path}/comments/${commentId}`;
  const cleanupJobRef = notificationCleanupJobRef(db, cleanupTargetPath);
  let cleanupVersion = null;
  let threadDeletion = null;

  await db.runTransaction(async (transaction) => {
    const rootJobRef = commentThreadDeletionJobRef(db, cleanupTargetPath);
    const [targetSnapshot, commentSnapshot, cleanupJobSnapshot, rootJobSnapshot] = await Promise.all([
      transaction.get(targetRef),
      transaction.get(commentRef),
      transaction.get(cleanupJobRef),
      transaction.get(rootJobRef),
    ]);
    if (!commentSnapshot.exists) {
      const rootJob = rootJobSnapshot.exists ? rootJobSnapshot.data() || {} : null;
      if (validCommentThreadDeletionJob(rootJob)) {
        assert(
          rootJob.authorizedUid === actorUid || isAdmin,
          'not-found',
          'Comment does not exist.'
        );
        threadDeletion = { rootCommentPath: cleanupTargetPath, version: rootJob.version };
        return;
      }
      const cleanupJob = cleanupJobSnapshot.exists ? cleanupJobSnapshot.data() || {} : null;
      assert(
        cleanupJob?.authorizedUid === actorUid || isAdmin,
        'not-found',
        'Comment does not exist.'
      );
      cleanupVersion = cleanupJob.version;
      return;
    }
    const comment = commentSnapshot.data();
    assert(
      comment.authorId === actorUid || isAdmin,
      'permission-denied',
      'You do not own this comment.'
    );
    const thread = canonicalCommentThread(comment, commentId);
    if (thread.threadType === 'root') {
      const targetData = targetSnapshot.exists ? targetSnapshot.data() || {} : {};
      const legacyOwnerNotificationRef = targetData.ownerId && targetData.ownerId !== comment.authorId
        ? db.doc(
          `users/${targetData.ownerId}/notifications/${commentNotificationId(target.path, commentId)}`
        )
        : null;
      const legacyOwnerNotificationSnapshot = legacyOwnerNotificationRef
        ? await transaction.get(legacyOwnerNotificationRef)
        : null;
      const version = Math.max(0, Math.trunc(Number(rootJobSnapshot.data()?.version) || 0)) + 1;
      transaction.update(commentRef, {
        status: 'deleting',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      if (legacyOwnerNotificationRef && legacyOwnerNotificationSnapshot) {
        stageNotificationDelete({
          transaction,
          admin,
          db,
          uid: targetData.ownerId,
          notificationRef: legacyOwnerNotificationRef,
          existingSnapshot: legacyOwnerNotificationSnapshot,
        });
      }
      transaction.set(rootJobRef, {
        schemaVersion: COMMENT_THREAD_DELETE_JOB_SCHEMA_VERSION,
        type: 'comment_thread_delete',
        state: 'ready',
        version,
        parentPath: target.path,
        rootCommentPath: cleanupTargetPath,
        rootCommentId: commentId,
        authorizedUid: actorUid,
        deletedReplies: 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      threadDeletion = { rootCommentPath: cleanupTargetPath, version };
      return;
    }

    const targetData = targetSnapshot.exists ? targetSnapshot.data() || {} : {};
    const notificationId = targetData.ownerId && targetData.ownerId !== comment.authorId
      ? commentNotificationId(target.path, commentId)
      : null;
    const notificationRef = notificationId
      ? db.doc(`users/${targetData.ownerId}/notifications/${notificationId}`)
      : null;
    const notificationSnapshot = notificationRef
      ? await transaction.get(notificationRef)
      : null;
    const rootRef = targetRef.collection('comments').doc(thread.threadRootId);
    const rootSnapshot = await transaction.get(rootRef);
    transaction.delete(commentRef);
    cleanupVersion = stageNotificationCleanupJob({
      transaction,
      admin,
      jobRef: cleanupJobRef,
      existingSnapshot: cleanupJobSnapshot,
      targetPath: cleanupTargetPath,
      authorizedUid: actorUid,
    });
    if (targetSnapshot.exists && comment.status === 'active') {
      transaction.update(targetRef, {
        'stats.commentCount': Math.max(
          0,
          Number(targetData?.stats?.commentCount || 0) - 1
        ),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    if (notificationRef && notificationSnapshot) {
      stageNotificationDelete({
        transaction,
        admin,
        db,
        uid: targetData.ownerId,
        notificationRef,
        existingSnapshot: notificationSnapshot,
      });
    }
    if (rootSnapshot.exists && comment.status === 'active') {
      transaction.update(rootRef, {
        replyCount: Math.max(0, Math.trunc(Number(rootSnapshot.data()?.replyCount) || 0) - 1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  });
  if (threadDeletion) {
    const outcome = await processCommentThreadDeletionJob({
      admin,
      rootCommentPath: threadDeletion.rootCommentPath,
      expectedVersion: threadDeletion.version,
    });
    return { deleted: outcome.state === 'complete', scope: 'thread', state: outcome.state };
  }
  await processNotificationCleanupJob({
    admin,
    targetPath: cleanupTargetPath,
    expectedVersion: cleanupVersion,
  });
  return { deleted: true, scope: 'comment', state: 'complete' };
}

async function refreshFavoritesForTarget({ admin, target, data }) {
  const normalized = normalizeTarget(target);
  const db = admin.firestore();
  let profile = null;
  if (data?.ownerId) {
    const profileSnapshot = await db.doc(`publicProfiles/${data.ownerId}`).get();
    profile = profileSnapshot.exists ? profileSnapshot.data() : null;
  }
  const preview = data
    ? buildFavoritePreview({ target: normalized, data, publicProfile: profile })
    : null;
  let updated = 0;
  let lastDocument = null;
  while (true) {
    let query = db
      .collectionGroup('favorites')
      .where('target.path', '==', normalized.path)
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(400)
    if (lastDocument) query = query.startAfter(lastDocument);
    const snapshot = await query.get();
    if (snapshot.empty) break;
    const batch = db.batch();
    snapshot.docs.forEach((entry) => {
      if (!data || data.status !== 'active') {
        batch.delete(entry.ref);
      } else {
        batch.update(entry.ref, {
          preview,
          sourceUpdatedAt:
            data.updatedAt || data.createdAt || admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    });
    await batch.commit();
    updated += snapshot.size;
    if (snapshot.size < 400) break;
    lastDocument = snapshot.docs[snapshot.docs.length - 1];
  }
  return { updated };
}

async function refreshFavoriteOwnerPreviews({ admin, userId, publicProfile }) {
  const db = admin.firestore();
  let updated = 0;
  let lastDocument = null;
  while (true) {
    let query = db
      .collectionGroup('favorites')
      .where('preview.owner.id', '==', userId)
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(400);
    if (lastDocument) query = query.startAfter(lastDocument);
    const snapshot = await query.get();
    if (snapshot.empty) break;
    const batch = db.batch();
    snapshot.docs.forEach((entry) => {
      if (!publicProfile) {
        batch.update(entry.ref, {
          'preview.owner.displayName': 'Traveler',
          'preview.owner.photoURL': null,
        });
      } else {
        batch.update(entry.ref, {
          'preview.owner.displayName': publicProfile.displayName || 'Traveler',
          'preview.owner.photoURL': publicProfile.photoURL || null,
        });
      }
    });
    await batch.commit();
    updated += snapshot.size;
    if (snapshot.size < 400) break;
    lastDocument = snapshot.docs[snapshot.docs.length - 1];
  }
  return { updated };
}

async function cleanupOrphanFavorites({ admin, limit = 500 }) {
  const db = admin.firestore();
  const snapshot = await db.collectionGroup('favorites').limit(limit).get();
  const records = snapshot.docs.map((entry) => ({
    ref: entry.ref,
    path: entry.data()?.target?.path,
  }));
  const validPaths = Array.from(new Set(records
    .map((entry) => entry.path)
    .filter((entry) => typeof entry === 'string' && entry.split('/').length >= 2)));
  const sources = validPaths.length
    ? await db.getAll(...validPaths.map((path) => db.doc(path)))
    : [];
  const activeByPath = new Map(sources.map((entry) => [
    entry.ref.path,
    entry.exists && entry.data()?.status === 'active',
  ]));
  const orphaned = records.filter((entry) =>
    !entry.path || activeByPath.get(entry.path) !== true
  );
  for (let offset = 0; offset < orphaned.length; offset += 400) {
    const batch = db.batch();
    orphaned.slice(offset, offset + 400).forEach((entry) => batch.delete(entry.ref));
    await batch.commit();
  }
  return { scanned: records.length, deleted: orphaned.length };
}

module.exports = {
  RATE_LIMITS,
  TARGETS,
  buildFavoritePreview,
  assertDestinationFavoriteMutationAllowed,
  canonicalCommentThread,
  cleanupOrphanFavorites,
  cleanId,
  cleanText,
  clearNotifications,
  consumeRateLimit,
  deleteComment,
  deleteNotification,
  favoriteKeyForPath,
  getReactionState,
  handleCommentThreadDeletionJobWrite,
  isVerified,
  markAllNotificationsRead,
  normalizeTarget,
  processCommentThreadDeletionJob,
  refreshFavoriteOwnerPreviews,
  refreshFavoritesForTarget,
  saveComment,
  setFavorite,
  setNotificationRead,
  setReaction,
};
