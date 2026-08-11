const crypto = require('crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { applyAffinitySignalInTransaction } = require('./personalizationService');

const TARGETS = Object.freeze({
  recommendation: { collection: 'recommendations' },
  route: { collection: 'routes' },
  trip: { collection: 'trips' },
  city: { collection: 'cities', nested: true },
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
});

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
  if (auth.token?.admin === true) return true;
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
    ? `countries/${countryId}/cities/${id}`
    : `${TARGETS[type].collection}/${id}`;
  return { type, id, ...(countryId ? { countryId } : {}), path };
}

function favoriteKeyForPath(path) {
  return crypto.createHash('sha256').update(path).digest('base64url');
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
    title: data?.title || data?.name || '',
    subtitle,
    thumbUrl: mediaThumb(data),
    placeholderColor: mediaPlaceholder(data),
    ...(target.type === 'city'
      ? { destinationImage: data?.destinationImage || null }
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

function assertActiveTarget(snapshot) {
  assert(snapshot.exists, 'not-found', 'The selected item no longer exists.');
  const data = snapshot.data();
  assert(data?.status === 'active', 'failed-precondition', 'The selected item is not available.');
  return data;
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
    const targetSnapshot = await transaction.get(targetRef);
    const targetData = saved ? assertActiveTarget(targetSnapshot) : targetSnapshot.data();
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

function notificationId(kind, targetPath, actorId, suffix = '') {
  return `${kind}_${favoriteKeyForPath(`${targetPath}|${actorId}|${suffix}`)}`;
}

function targetPreview(target, targetData) {
  return {
    type: target.type,
    id: target.id,
    path: target.path,
    ...(target.countryId ? { countryId: target.countryId } : {}),
    title: targetData.title || targetData.name || '',
    thumbUrl: mediaThumb(targetData),
  };
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
    const targetData = assertActiveTarget(targetSnapshot);
    const wasLiked = likeSnapshot.exists;
    const currentCount = Math.max(0, Number(targetData?.stats?.likeCount || 0));
    nextCount = currentCount;
    if (liked !== wasLiked) nextCount = Math.max(0, currentCount + (liked ? 1 : -1));

    const actor = liked && !wasLiked
      ? await loadAuthorProfile(transaction, db, auth.uid)
      : null;

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
      transaction.create(likeRef, {
        userId: auth.uid,
        userPreview: {
          displayName: actor?.displayName || 'Traveler',
          photoURL: actor?.photoURL || null,
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else if (!liked && wasLiked) {
      transaction.delete(likeRef);
    }
    if (liked !== wasLiked) {
      transaction.update(targetRef, {
        'stats.likeCount': nextCount,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    const ownerId = targetData.ownerId;
    if (ownerId && ownerId !== auth.uid && liked !== wasLiked) {
      const id = notificationId('like', target.path, auth.uid);
      const notificationRef = db.doc(`users/${ownerId}/notifications/${id}`);
      if (liked) {
        transaction.set(notificationRef, {
          type: 'like',
          actorId: auth.uid,
          actorPreview: {
            displayName: actor?.displayName || 'Traveler',
            photoURL: actor?.photoURL || null,
          },
          target: targetPreview(target, targetData),
          isRead: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        transaction.delete(notificationRef);
      }
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
  assertVerified(auth);
  const target = normalizeTarget(data?.target);
  assert(target.type !== 'city', 'invalid-argument', 'Cities do not support comments.');
  const text = cleanText(data?.text, { field: 'text', min: 1, max: 2000 });
  const commentId = data?.commentId ? cleanId(data.commentId, 'commentId') : null;
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
    const targetData = assertActiveTarget(targetSnapshot);
    const author = authorSnapshot.exists ? authorSnapshot.data() : {};
    const authorPreview = {
      displayName: author.displayName || 'Traveler',
      photoURL: author.photoURL || null,
    };
    if (commentId) {
      assert(commentSnapshot.exists, 'not-found', 'Comment does not exist.');
      const previous = commentSnapshot.data();
      assert(
        previous.authorId === auth.uid || auth.token?.admin === true,
        'permission-denied',
        'You do not own this comment.'
      );
      transaction.update(commentRef, {
        text,
        authorPreview,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      transaction.create(commentRef, {
        authorId: auth.uid,
        authorPreview,
        text,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      const nextCount = Math.max(0, Number(targetData?.stats?.commentCount || 0)) + 1;
      transaction.update(targetRef, {
        'stats.commentCount': nextCount,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      if (targetData.ownerId && targetData.ownerId !== auth.uid) {
        const id = notificationId('comment', target.path, auth.uid, commentRef.id);
        transaction.set(db.doc(`users/${targetData.ownerId}/notifications/${id}`), {
          type: 'comment',
          actorId: auth.uid,
          actorPreview: authorPreview,
          target: targetPreview(target, targetData),
          commentId: commentRef.id,
          isRead: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }
    result = {
      id: commentRef.id,
      authorId: auth.uid,
      authorPreview,
      text,
    };
  });
  return { comment: result };
}

async function deleteComment({ admin, auth, data }) {
  assertVerified(auth);
  const target = normalizeTarget(data?.target);
  const commentId = cleanId(data?.commentId, 'commentId');
  await consumeRateLimit({ admin, uid: auth.uid, action: 'comment' });
  const db = admin.firestore();
  const targetRef = db.doc(target.path);
  const commentRef = targetRef.collection('comments').doc(commentId);

  await db.runTransaction(async (transaction) => {
    const [targetSnapshot, commentSnapshot] = await Promise.all([
      transaction.get(targetRef),
      transaction.get(commentRef),
    ]);
    assert(commentSnapshot.exists, 'not-found', 'Comment does not exist.');
    const comment = commentSnapshot.data();
    assert(
      comment.authorId === auth.uid || auth.token?.admin === true,
      'permission-denied',
      'You do not own this comment.'
    );
    transaction.delete(commentRef);
    if (targetSnapshot.exists) {
      const targetData = targetSnapshot.data();
      transaction.update(targetRef, {
        'stats.commentCount': Math.max(
          0,
          Number(targetData?.stats?.commentCount || 0) - 1
        ),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      if (targetData.ownerId && targetData.ownerId !== comment.authorId) {
        transaction.delete(
          db.doc(
            `users/${targetData.ownerId}/notifications/${notificationId(
              'comment',
              target.path,
              comment.authorId,
              commentId
            )}`
          )
        );
      }
    }
  });
  return { deleted: true };
}

async function setNotificationRead({ admin, auth, data }) {
  assert(auth?.uid, 'unauthenticated', 'You must be signed in.');
  const notificationIdValue = cleanId(data?.notificationId, 'notificationId');
  const read = data?.read;
  assert(typeof read === 'boolean', 'invalid-argument', 'read must be boolean.');
  await admin.firestore().doc(
    `users/${auth.uid}/notifications/${notificationIdValue}`
  ).update({ isRead: read, readAt: read ? admin.firestore.FieldValue.serverTimestamp() : null });
  return { read };
}

async function clearNotifications({ admin, auth }) {
  assert(auth?.uid, 'unauthenticated', 'You must be signed in.');
  const db = admin.firestore();
  let deleted = 0;
  while (true) {
    const snapshot = await db.collection(`users/${auth.uid}/notifications`).limit(400).get();
    if (snapshot.empty) break;
    const batch = db.batch();
    snapshot.docs.forEach((entry) => batch.delete(entry.ref));
    await batch.commit();
    deleted += snapshot.size;
  }
  return { deleted };
}

async function deleteNotification({ admin, auth, data }) {
  assert(auth?.uid, 'unauthenticated', 'You must be signed in.');
  const notificationIdValue = cleanId(data?.notificationId, 'notificationId');
  await admin.firestore().doc(
    `users/${auth.uid}/notifications/${notificationIdValue}`
  ).delete();
  return { deleted: true };
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
  cleanupOrphanFavorites,
  cleanId,
  cleanText,
  clearNotifications,
  consumeRateLimit,
  deleteComment,
  deleteNotification,
  favoriteKeyForPath,
  getReactionState,
  isVerified,
  normalizeTarget,
  refreshFavoriteOwnerPreviews,
  refreshFavoritesForTarget,
  saveComment,
  setFavorite,
  setNotificationRead,
  setReaction,
};
