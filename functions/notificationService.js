const crypto = require('crypto');
const { HttpsError } = require('firebase-functions/v2/https');

const NOTIFICATION_SCHEMA_VERSION = 2;
const OWNER_NOTIFICATION_OUTBOX_SCHEMA_VERSION = 1;
const NOTIFICATION_CLEANUP_JOB_SCHEMA_VERSION = 1;
const NOTIFICATION_CHANNELS = Object.freeze(['personal', 'admin']);
const NOTIFICATION_TYPES = Object.freeze(['like', 'comment', 'system', 'moderation']);
const NOTIFICATION_PRIORITIES = Object.freeze(['normal', 'urgent']);
const NOTIFICATION_SUBTYPES = Object.freeze({
  like: Object.freeze(['grouped_likes']),
  comment: Object.freeze(['new_comment', 'new_reply']),
  system: Object.freeze(['content_held', 'content_restored', 'content_deleted']),
  moderation: Object.freeze([
    'report_received',
    'urgent_escalation',
    'destination_review_discovered',
  ]),
});
const TARGET_TYPES = new Set([
  'recommendation',
  'route',
  'trip',
  'comment',
  'profile',
  'destination',
]);
const CONTENT_TYPES = new Set(['recommendation', 'route', 'trip']);
const MAX_ACTOR_PREVIEWS = 4;
const MAX_TARGET_THUMB_URLS = 4;
const MAX_COMMENT_EXCERPT = 160;
const BULK_READ_LIMIT = 400;
// Clearing also writes one dismissal tombstone per row plus one counter update.
// Keep each transaction below Firestore's 500-write ceiling.
const BULK_DELETE_LIMIT = 240;
const ADMIN_FANOUT_PAGE_SIZE = 50;
const BLOCKED_LIKE_PAGE_SIZE = 50;
// A purge may touch one notification document and one unread-state document per
// result. Keep the worst-case transaction comfortably below Firestore's
// 500-write ceiling even when every row belongs to a different user.
const PURGE_LIMIT = 240;

function fail(code, message, reason) {
  throw new HttpsError(code, message, { reason });
}

function cleanId(value, field = 'id') {
  const result = typeof value === 'string' ? value.trim() : '';
  if (!result || result.length > 180 || result.includes('/')) {
    fail('invalid-argument', `${field} is invalid.`, 'invalid_notification_input');
  }
  return result;
}

function cleanText(value, maximum, fallback = '') {
  const result = typeof value === 'string'
    ? value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim()
    : '';
  return (result || fallback).slice(0, maximum);
}

function safeHttpsUrl(value) {
  const result = typeof value === 'string' ? value.trim() : '';
  if (!result || result.length > 2048 || !result.startsWith('https://')) return null;
  try {
    const url = new URL(result);
    return url.protocol === 'https:' ? result : null;
  } catch {
    return null;
  }
}

function compactObject(value) {
  if (Array.isArray(value)) return value.map(compactObject);
  if (!value || typeof value !== 'object') return value;
  if (typeof value.toDate === 'function' || typeof value.toMillis === 'function') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, compactObject(item)])
  );
}

function hashId(prefix, ...parts) {
  const digest = crypto.createHash('sha256').update(parts.join('\n')).digest('base64url');
  return `${prefix}_${digest}`;
}

function groupedLikeNotificationId(targetPath) {
  return hashId('like', targetPath);
}

function commentNotificationId(targetPath, commentId) {
  return hashId('comment', targetPath, commentId);
}

function systemNotificationId(subtype, targetPath) {
  return hashId('system', subtype, targetPath);
}

function ownerNotificationOutboxId(subtype, targetPath) {
  validateSubtype('system', subtype);
  const path = typeof targetPath === 'string' ? targetPath.trim() : '';
  if (!path || path.length > 500) {
    fail('invalid-argument', 'Notification target path is invalid.', 'invalid_notification_target');
  }
  return hashId('owner_notice', subtype, path);
}

function moderationNotificationId(caseId) {
  return `moderation_${cleanId(caseId, 'caseId')}`;
}

function destinationNotificationId(countryId, cityId) {
  return hashId(
    'destination',
    cleanId(countryId, 'countryId'),
    cleanId(cityId, 'cityId')
  );
}

function createNotificationGeneration() {
  return crypto.randomBytes(12).toString('base64url');
}

function sanitizeActorPreview(input, fallbackId = null) {
  const idValue = input?.id || input?.uid || fallbackId;
  if (!idValue) return null;
  const id = cleanId(idValue, 'actor.id');
  return {
    id,
    displayName: cleanText(input?.displayName, 80, 'Traveler'),
    photoURL: safeHttpsUrl(input?.photoURL),
  };
}

function targetThumbUrls(data = {}, target = {}) {
  const candidates = [];
  const add = (value) => {
    const safe = safeHttpsUrl(value);
    if (safe && !candidates.includes(safe)) candidates.push(safe);
  };
  const sourceThumbs = Array.isArray(target.thumbUrls) ? target.thumbUrls : [];
  sourceThumbs.forEach(add);
  add(target.thumbUrl);
  add(data?.destinationImage?.urls?.thumb);
  add(data?.destinationImage?.urls?.feed);
  const media = Array.isArray(data?.media) ? data.media : data?.media ? [data.media] : [];
  media.forEach((item) => {
    add(item?.thumb?.url);
    add(item?.feed?.url);
    add(item?.url);
  });
  add(data?.externalImageUrl);
  add(data?.imageUrl);
  return candidates.slice(0, MAX_TARGET_THUMB_URLS);
}

function canonicalTarget(input = {}) {
  const type = String(input.type || '').trim().toLowerCase();
  if (!TARGET_TYPES.has(type)) {
    fail('invalid-argument', 'Notification target type is invalid.', 'invalid_notification_target');
  }
  if (CONTENT_TYPES.has(type)) {
    const id = cleanId(input.id, 'target.id');
    return { type, id, path: `${type}s/${id}` };
  }
  if (type === 'profile') {
    const id = cleanId(input.id, 'target.id');
    return { type, id, path: `publicProfiles/${id}` };
  }
  if (type === 'destination') {
    const countryId = cleanId(input.countryId, 'target.countryId');
    const cityId = cleanId(input.cityId || input.id, 'target.cityId');
    return {
      type,
      id: cityId,
      countryId,
      cityId,
      path: `countries/${countryId}/destinations/${cityId}`,
    };
  }
  const parentType = String(input.parentType || '').trim().toLowerCase();
  if (!CONTENT_TYPES.has(parentType)) {
    fail('invalid-argument', 'Notification comment parent is invalid.', 'invalid_notification_target');
  }
  const parentId = cleanId(input.parentId, 'target.parentId');
  const id = cleanId(input.id, 'target.id');
  return {
    type,
    id,
    parentType,
    parentId,
    path: `${parentType}s/${parentId}/comments/${id}`,
  };
}

function buildNotificationTarget({ target, data = {}, parentData = null }) {
  const normalized = canonicalTarget(target);
  const previewData = normalized.type === 'comment' && parentData ? parentData : data;
  const names = previewData?.googleCache?.names || previewData?.identity?.names || {};
  const title = cleanText(
    target?.title || previewData?.title || names.he || names.en || previewData?.name,
    160
  );
  return compactObject({
    ...normalized,
    title,
    thumbUrls: targetThumbUrls(previewData, target),
  });
}

function navigationForTarget(target) {
  const normalized = canonicalTarget(target);
  if (normalized.type === 'recommendation') {
    return { action: 'open_recommendation', recommendationId: normalized.id };
  }
  if (normalized.type === 'route') {
    return { action: 'open_route', routeId: normalized.id };
  }
  if (normalized.type === 'trip') {
    return { action: 'open_trip', tripId: normalized.id };
  }
  if (normalized.type === 'profile') {
    return { action: 'open_profile', profileId: normalized.id };
  }
  if (normalized.type === 'destination') {
    return {
      action: 'open_destination_review',
      countryId: normalized.countryId,
      cityId: normalized.cityId,
    };
  }
  return {
    action: 'open_comment',
    parentType: normalized.parentType,
    parentId: normalized.parentId,
    commentId: normalized.id,
  };
}

function moderationNavigation(caseId) {
  return { action: 'open_moderation_case', caseId: cleanId(caseId, 'caseId') };
}

function sanitizeNavigation(input = {}) {
  const action = String(input.action || '');
  if (action === 'open_recommendation') {
    return { action, recommendationId: cleanId(input.recommendationId, 'recommendationId') };
  }
  if (action === 'open_route') {
    return { action, routeId: cleanId(input.routeId, 'routeId') };
  }
  if (action === 'open_trip') {
    return { action, tripId: cleanId(input.tripId, 'tripId') };
  }
  if (action === 'open_profile') {
    return { action, profileId: cleanId(input.profileId, 'profileId') };
  }
  if (action === 'open_moderation_case') {
    return { action, caseId: cleanId(input.caseId, 'caseId') };
  }
  if (action === 'open_destination_review') {
    return {
      action,
      countryId: cleanId(input.countryId, 'countryId'),
      cityId: cleanId(input.cityId, 'cityId'),
    };
  }
  if (action === 'open_comment') {
    const parentType = String(input.parentType || '').trim().toLowerCase();
    if (!CONTENT_TYPES.has(parentType)) {
      fail('invalid-argument', 'Notification navigation is invalid.', 'invalid_notification_navigation');
    }
    return {
      action,
      parentType,
      parentId: cleanId(input.parentId, 'parentId'),
      commentId: cleanId(input.commentId, 'commentId'),
    };
  }
  fail('invalid-argument', 'Notification navigation is invalid.', 'invalid_notification_navigation');
}

function validateSubtype(type, subtype) {
  if (!NOTIFICATION_TYPES.includes(type) || !NOTIFICATION_SUBTYPES[type]?.includes(subtype)) {
    fail('invalid-argument', 'Notification subtype is invalid.', 'invalid_notification_input');
  }
}

function buildNotificationDocument({
  channel,
  type,
  subtype,
  priority = 'normal',
  target,
  navigation,
  actorPreview,
  actorPreviews,
  actorId,
  count = 1,
  commentExcerpt,
  generation,
  createdAt,
  pushVersion = 1,
}) {
  if (!NOTIFICATION_CHANNELS.includes(channel)) {
    fail('invalid-argument', 'Notification channel is invalid.', 'invalid_notification_input');
  }
  validateSubtype(type, subtype);
  if ((channel === 'admin') !== (type === 'moderation')) {
    fail('invalid-argument', 'Notification channel and type are incompatible.', 'invalid_notification_input');
  }
  if (!NOTIFICATION_PRIORITIES.includes(priority)) {
    fail('invalid-argument', 'Notification priority is invalid.', 'invalid_notification_input');
  }
  const sanitizedActor = sanitizeActorPreview(actorPreview, actorId);
  const sanitizedActors = (Array.isArray(actorPreviews) ? actorPreviews : [])
    .map((item) => sanitizeActorPreview(item))
    .filter(Boolean)
    .filter((item, index, array) => array.findIndex((entry) => entry.id === item.id) === index)
    .slice(0, MAX_ACTOR_PREVIEWS);
  const boundedCount = Math.max(1, Math.min(Number.MAX_SAFE_INTEGER, Math.trunc(Number(count) || 1)));
  const sanitizedTarget = buildNotificationTarget({ target, data: { title: target?.title } });
  const sanitizedNavigation = sanitizeNavigation(navigation);
  return compactObject({
    schemaVersion: NOTIFICATION_SCHEMA_VERSION,
    channel,
    type,
    subtype,
    priority,
    isRead: false,
    readAt: null,
    createdAt,
    target: sanitizedTarget,
    navigation: sanitizedNavigation,
    ...(sanitizedActor ? { actorPreview: sanitizedActor } : {}),
    ...(sanitizedActors.length ? { actorPreviews: sanitizedActors } : {}),
    ...(actorId ? { actorId: cleanId(actorId, 'actorId') } : {}),
    count: boundedCount,
    ...(commentExcerpt !== undefined
      ? { commentExcerpt: cleanText(commentExcerpt, MAX_COMMENT_EXCERPT) }
      : {}),
    ...(generation ? { generation: cleanId(generation, 'generation') } : {}),
    push: { version: Math.max(1, Math.trunc(Number(pushVersion) || 1)) },
  });
}

function counterField(channel) {
  if (channel === 'personal') return 'personalUnread';
  if (channel === 'admin') return 'adminUnread';
  fail('invalid-argument', 'Notification channel is invalid.', 'invalid_notification_channel');
}

function notificationStateRef(db, uid) {
  return db.doc(`users/${cleanId(uid, 'uid')}/notificationState/state`);
}

function notificationRecipientEligible(snapshot) {
  if (!snapshot?.exists) return false;
  const value = snapshot.data() || {};
  return value.status !== 'deleting'
    && value.moderation?.status !== 'deleting';
}

function notificationDismissalRef(db, uid, notificationId) {
  return db.doc(
    `users/${cleanId(uid, 'uid')}/notificationState/${hashId('dismissal', notificationId)}`
  );
}

function notificationVersion(value) {
  return Math.max(0, Math.trunc(Number(value?.push?.version) || 0));
}

function stageNotificationDismissal({ transaction, admin, db, uid, notificationId, notification }) {
  const version = notificationVersion(notification);
  if (!version) return;
  transaction.set(notificationDismissalRef(db, uid, notificationId), {
    schemaVersion: NOTIFICATION_SCHEMA_VERSION,
    type: 'notification_dismissal',
    notificationId: cleanId(notificationId, 'notificationId'),
    channel: notification.channel,
    version,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

function adjustUnreadCounter({ transaction, admin, db, uid, channel, delta }) {
  if (!delta) return;
  transaction.set(notificationStateRef(db, uid), {
    schemaVersion: NOTIFICATION_SCHEMA_VERSION,
    [counterField(channel)]: admin.firestore.FieldValue.increment(delta),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

function isV2Notification(data) {
  return data?.schemaVersion === NOTIFICATION_SCHEMA_VERSION
    && NOTIFICATION_CHANNELS.includes(data?.channel);
}

function unreadDeltaForActivity(existingSnapshot, channel) {
  if (!existingSnapshot?.exists) return 1;
  const existing = existingSnapshot.data() || {};
  if (!isV2Notification(existing) || existing.channel !== channel) return 1;
  return existing.isRead === true ? 1 : 0;
}

function nextPushVersion(existingSnapshot) {
  if (!existingSnapshot?.exists) return 1;
  return Math.max(0, Math.trunc(Number(existingSnapshot.data()?.push?.version) || 0)) + 1;
}

function cleanActivityVersion(value) {
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version < 1 || version > 1_000_000_000) {
    fail('invalid-argument', 'Notification activity version is invalid.', 'invalid_notification_input');
  }
  return version;
}

function stageNotificationActivity({
  transaction,
  admin,
  db,
  uid,
  notificationRef,
  existingSnapshot,
  notification,
  activityVersion = null,
}) {
  const pushVersion = activityVersion == null
    ? nextPushVersion(existingSnapshot)
    : cleanActivityVersion(activityVersion);
  const document = buildNotificationDocument({
    ...notification,
    createdAt: notification?.createdAt || admin.firestore.FieldValue.serverTimestamp(),
    pushVersion,
  });
  transaction.set(notificationRef, document);
  adjustUnreadCounter({
    transaction,
    admin,
    db,
    uid,
    channel: document.channel,
    delta: unreadDeltaForActivity(existingSnapshot, document.channel),
  });
  return document;
}

function stageNotificationDelete({
  transaction,
  admin,
  db,
  uid,
  notificationRef,
  existingSnapshot,
}) {
  if (!existingSnapshot?.exists) return { deleted: false, unreadDelta: 0 };
  const existing = existingSnapshot.data() || {};
  transaction.delete(notificationRef);
  const unreadDelta = isV2Notification(existing) && existing.isRead !== true ? -1 : 0;
  if (unreadDelta) {
    adjustUnreadCounter({
      transaction,
      admin,
      db,
      uid,
      channel: existing.channel,
      delta: unreadDelta,
    });
  }
  return { deleted: true, unreadDelta };
}

function actorListWithLatest(existing = [], actorPreview) {
  const actor = sanitizeActorPreview(actorPreview);
  if (!actor) return [];
  return [actor, ...existing]
    .map((item) => sanitizeActorPreview(item))
    .filter(Boolean)
    .filter((item, index, array) => array.findIndex((entry) => entry.id === item.id) === index)
    .slice(0, MAX_ACTOR_PREVIEWS);
}

function prepareGroupedLikeActivity({ existingSnapshot, actorPreview, target, navigation, generation }) {
  const existing = existingSnapshot?.exists && isV2Notification(existingSnapshot.data())
    && existingSnapshot.data()?.type === 'like'
    ? existingSnapshot.data()
    : null;
  const nextGeneration = existing?.generation || generation || createNotificationGeneration();
  const actors = actorListWithLatest(existing?.actorPreviews || [], actorPreview);
  return {
    generation: nextGeneration,
    notification: {
      channel: 'personal',
      type: 'like',
      subtype: 'grouped_likes',
      priority: 'normal',
      actorPreview: actors[0] || actorPreview,
      actorPreviews: actors,
      count: existing ? Math.max(1, Number(existing.count || 0) + 1) : 1,
      generation: nextGeneration,
      target,
      navigation,
    },
  };
}

function prepareGroupedLikeRemoval({ existingSnapshot, actorId, generation }) {
  if (!existingSnapshot?.exists) return { action: 'none' };
  const existing = existingSnapshot.data() || {};
  if (!isV2Notification(existing) || existing.type !== 'like' || existing.generation !== generation) {
    return { action: 'none' };
  }
  const nextCount = Math.max(0, Number(existing.count || 0) - 1);
  if (nextCount === 0) return { action: 'delete', existing };
  const actors = (Array.isArray(existing.actorPreviews) ? existing.actorPreviews : [])
    .map((item) => sanitizeActorPreview(item))
    .filter((item) => item && item.id !== actorId)
    .slice(0, MAX_ACTOR_PREVIEWS);
  return {
    action: 'update',
    patch: {
      count: nextCount,
      actorPreviews: actors,
      actorPreview: actors[0] || null,
    },
  };
}

async function assertAdminChannelAccessInTransaction({ transaction, db, auth, channel }) {
  if (channel !== 'admin') return;
  if (!auth?.uid || auth.token?.admin !== true) {
    fail('permission-denied', 'Admin access is required.', 'admin_required');
  }
  const registry = await transaction.get(db.doc(`system/moderation/admins/${auth.uid}`));
  if (!registry.exists || registry.data()?.active !== true) {
    fail('permission-denied', 'Admin access is required.', 'admin_required');
  }
}

function requestedChannel(value, { defaultPersonal = false } = {}) {
  if ((value === undefined || value === null || value === '') && defaultPersonal) return 'personal';
  if (!NOTIFICATION_CHANNELS.includes(value)) {
    fail('invalid-argument', 'Notification channel is invalid.', 'invalid_notification_channel');
  }
  return value;
}

async function setNotificationRead({ admin, auth, data }) {
  if (!auth?.uid) fail('unauthenticated', 'You must be signed in.', 'sign_in_required');
  const notificationId = cleanId(data?.notificationId, 'notificationId');
  const read = data?.read;
  if (typeof read !== 'boolean') {
    fail('invalid-argument', 'read must be boolean.', 'invalid_notification_input');
  }
  const db = admin.firestore();
  const ref = db.doc(`users/${auth.uid}/notifications/${notificationId}`);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) fail('not-found', 'Notification was not found.', 'notification_missing');
    const existing = snapshot.data() || {};
    if (!isV2Notification(existing)) {
      fail('failed-precondition', 'Notification is no longer supported.', 'notification_legacy');
    }
    await assertAdminChannelAccessInTransaction({ transaction, db, auth, channel: existing.channel });
    const changed = existing.isRead !== read;
    if (changed) {
      transaction.update(ref, {
        isRead: read,
        readAt: read ? admin.firestore.FieldValue.serverTimestamp() : null,
      });
      adjustUnreadCounter({
        transaction,
        admin,
        db,
        uid: auth.uid,
        channel: existing.channel,
        delta: read ? -1 : 1,
      });
    }
    return { notificationId, channel: existing.channel, read, changed };
  });
}

async function deleteNotification({ admin, auth, data }) {
  if (!auth?.uid) fail('unauthenticated', 'You must be signed in.', 'sign_in_required');
  const notificationId = cleanId(data?.notificationId, 'notificationId');
  const db = admin.firestore();
  const ref = db.doc(`users/${auth.uid}/notifications/${notificationId}`);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return { notificationId, channel: null, deleted: false };
    const existing = snapshot.data() || {};
    if (!isV2Notification(existing)) {
      fail('failed-precondition', 'Notification is no longer supported.', 'notification_legacy');
    }
    await assertAdminChannelAccessInTransaction({ transaction, db, auth, channel: existing.channel });
    stageNotificationDismissal({
      transaction,
      admin,
      db,
      uid: auth.uid,
      notificationId,
      notification: existing,
    });
    stageNotificationDelete({
      transaction,
      admin,
      db,
      uid: auth.uid,
      notificationRef: ref,
      existingSnapshot: snapshot,
    });
    return { notificationId, channel: existing.channel, deleted: true };
  });
}

async function mutateChannelInBatches({ admin, auth, channel, operation }) {
  if (!auth?.uid) fail('unauthenticated', 'You must be signed in.', 'sign_in_required');
  if (channel === 'admin' && auth.token?.admin !== true) {
    fail('permission-denied', 'Admin access is required.', 'admin_required');
  }
  const db = admin.firestore();
  let changed = 0;
  while (true) {
    let query = db.collection(`users/${auth.uid}/notifications`)
      .where('channel', '==', channel);
    if (operation === 'read') query = query.where('isRead', '==', false);
    const pageLimit = operation === 'delete' ? BULK_DELETE_LIMIT : BULK_READ_LIMIT;
    const page = await query.limit(pageLimit).get();
    if (page.empty) break;
    const pageChanged = await db.runTransaction(async (transaction) => {
      const reads = page.docs.map((entry) => transaction.get(entry.ref));
      const registryPromise = channel === 'admin'
        ? transaction.get(db.doc(`system/moderation/admins/${auth.uid}`))
        : Promise.resolve(null);
      const [snapshots, registry] = await Promise.all([Promise.all(reads), registryPromise]);
      if (channel === 'admin' && (!registry?.exists || registry.data()?.active !== true)) {
        fail('permission-denied', 'Admin access is required.', 'admin_required');
      }
      const eligible = snapshots.filter((snapshot) => {
        const value = snapshot.exists ? snapshot.data() || {} : {};
        return isV2Notification(value)
          && value.channel === channel
          && (operation !== 'read' || value.isRead !== true);
      });
      const unread = eligible.filter((snapshot) => snapshot.data()?.isRead !== true).length;
      eligible.forEach((snapshot) => {
        if (operation === 'read') {
          transaction.update(snapshot.ref, {
            isRead: true,
            readAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        } else {
          stageNotificationDismissal({
            transaction,
            admin,
            db,
            uid: auth.uid,
            notificationId: snapshot.id,
            notification: snapshot.data() || {},
          });
          transaction.delete(snapshot.ref);
        }
      });
      if (unread) {
        adjustUnreadCounter({
          transaction,
          admin,
          db,
          uid: auth.uid,
          channel,
          delta: -unread,
        });
      }
      return eligible.length;
    });
    changed += pageChanged;
    if (page.size < pageLimit) break;
  }
  return changed;
}

async function markAllNotificationsRead({ admin, auth, data }) {
  const channel = requestedChannel(data?.channel);
  const updated = await mutateChannelInBatches({ admin, auth, channel, operation: 'read' });
  return { channel, updated };
}

async function clearNotifications({ admin, auth, data }) {
  const channel = requestedChannel(data?.channel, { defaultPersonal: true });
  const deleted = await mutateChannelInBatches({ admin, auth, channel, operation: 'delete' });
  return { channel, deleted };
}

async function upsertNotification({
  admin,
  uid,
  notificationId,
  notification,
  requireActiveAdmin = false,
  createOnly = false,
  skipIfAlreadyCurrent = false,
  activityVersion = null,
  requireExistingUser = true,
}) {
  const db = admin.firestore();
  const ref = db.doc(`users/${cleanId(uid, 'uid')}/notifications/${cleanId(notificationId, 'notificationId')}`);
  return db.runTransaction(async (transaction) => {
    const reads = [transaction.get(ref)];
    const dismissalIndex = reads.length;
    reads.push(transaction.get(notificationDismissalRef(db, uid, notificationId)));
    const registryIndex = requireActiveAdmin ? reads.length : -1;
    if (requireActiveAdmin) {
      reads.push(transaction.get(db.doc(`system/moderation/admins/${uid}`)));
    }
    const userIndex = requireExistingUser ? reads.length : -1;
    if (requireExistingUser) reads.push(transaction.get(db.doc(`users/${uid}`)));
    const snapshots = await Promise.all(reads);
    const existing = snapshots[0];
    const dismissal = snapshots[dismissalIndex];
    const registry = registryIndex >= 0 ? snapshots[registryIndex] : null;
    const user = userIndex >= 0 ? snapshots[userIndex] : null;
    if (requireActiveAdmin && (!registry?.exists || registry.data()?.active !== true)) {
      return null;
    }
    if (requireExistingUser && !notificationRecipientEligible(user)) return null;
    if (createOnly && existing.exists && isV2Notification(existing.data())) return null;
    const requestedActivityVersion = activityVersion == null
      ? null
      : cleanActivityVersion(activityVersion);
    const dismissalVersion = dismissal.exists
      ? Math.max(0, Math.trunc(Number(dismissal.data()?.version) || 0))
      : 0;
    const effectiveActivityVersion = requestedActivityVersion == null
      ? Math.max(nextPushVersion(existing), dismissalVersion + 1)
      : requestedActivityVersion;
    if (
      dismissal.exists
      && dismissalVersion >= effectiveActivityVersion
    ) {
      return null;
    }
    if (requestedActivityVersion != null
      && existing.exists
      && Number(existing.data()?.push?.version || 0) >= requestedActivityVersion) {
      return null;
    }
    if (skipIfAlreadyCurrent && existing.exists && isV2Notification(existing.data())) {
      const current = existing.data() || {};
      const requestedCount = Math.max(1, Math.trunc(Number(notification?.count) || 1));
      const countCovered = Number(current.count || 0) >= requestedCount;
      const priorityCovered = notification?.priority !== 'urgent' || current.priority === 'urgent';
      if (current.channel === notification?.channel
        && current.type === notification?.type
        && countCovered
        && priorityCovered) {
        return null;
      }
    }
    const document = stageNotificationActivity({
      transaction,
      admin,
      db,
      uid,
      notificationRef: ref,
      existingSnapshot: existing,
      notification,
      activityVersion: effectiveActivityVersion,
    });
    return notificationDeliveryDescriptor({
      userId: uid,
      notificationId: ref.id,
      before: existing.exists ? existing.data() : null,
      after: document,
    });
  });
}

async function fanoutAdminNotification({
  admin,
  notificationId,
  notification,
  createOnly = false,
  skipIfAlreadyCurrent = false,
  activityVersion = null,
}) {
  const db = admin.firestore();
  const deliveries = [];
  let cursor = null;
  while (true) {
    let query = db.collection('system/moderation/admins')
      .where('active', '==', true)
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(ADMIN_FANOUT_PAGE_SIZE);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    for (let offset = 0; offset < page.docs.length; offset += 10) {
      const chunk = await Promise.all(page.docs.slice(offset, offset + 10).map((entry) => (
        upsertNotification({
          admin,
          uid: entry.id,
          notificationId,
          notification,
          requireActiveAdmin: true,
          createOnly,
          skipIfAlreadyCurrent,
          activityVersion,
        })
      )));
      deliveries.push(...chunk.filter(Boolean));
    }
    if (page.size < ADMIN_FANOUT_PAGE_SIZE) break;
    cursor = page.docs[page.docs.length - 1];
  }
  return deliveries;
}

function validOwnerNotificationOutbox(value) {
  return value?.schemaVersion === OWNER_NOTIFICATION_OUTBOX_SCHEMA_VERSION
    && value?.state === 'ready'
    && Number.isSafeInteger(value?.version)
    && value.version >= 1
    && value.version <= 1_000_000_000
    && value.readyVersion === value.version
    && typeof value?.uid === 'string'
    && NOTIFICATION_SUBTYPES.system.includes(value?.subtype)
    && value?.target
    && typeof value.target === 'object';
}

async function prepareOwnerNotificationOutbox({ admin, uid, subtype, target }) {
  validateSubtype('system', subtype);
  const userId = cleanId(uid, 'uid');
  const sanitizedTarget = buildNotificationTarget({ target, data: { title: target?.title } });
  const db = admin.firestore();
  const outboxId = ownerNotificationOutboxId(subtype, sanitizedTarget.path);
  const ref = db.doc(`system/moderation/ownerNotifications/${outboxId}`);
  return db.runTransaction(async (transaction) => {
    const userSnapshot = await transaction.get(db.doc(`users/${userId}`));
    if (!notificationRecipientEligible(userSnapshot)) return null;
    const snapshot = await transaction.get(ref);
    const previous = snapshot.exists ? snapshot.data() || {} : {};
    if (previous.schemaVersion === OWNER_NOTIFICATION_OUTBOX_SCHEMA_VERSION
      && previous.state === 'pending'
      && previous.uid === userId
      && previous.subtype === subtype
      && previous.target?.path === sanitizedTarget.path) {
      return { outboxId, version: previous.version, state: 'pending', reused: true };
    }
    const previousVersion = Number(previous.version || 0);
    const version = Number.isSafeInteger(previousVersion) && previousVersion >= 0
      ? previousVersion + 1
      : 1;
    transaction.set(ref, {
      schemaVersion: OWNER_NOTIFICATION_OUTBOX_SCHEMA_VERSION,
      state: 'pending',
      version,
      readyVersion: Math.max(0, Math.trunc(Number(previous.readyVersion) || 0)),
      deliverySignal: Math.max(0, Math.trunc(Number(previous.deliverySignal) || 0)),
      uid: userId,
      subtype,
      target: sanitizedTarget,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { outboxId, version, state: 'pending', reused: false };
  });
}

async function completeOwnerNotificationOutbox({ admin, subtype, targetPath, version = null }) {
  const db = admin.firestore();
  const outboxId = ownerNotificationOutboxId(subtype, targetPath);
  const ref = db.doc(`system/moderation/ownerNotifications/${outboxId}`);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return null;
    const previous = snapshot.data() || {};
    if (previous.schemaVersion !== OWNER_NOTIFICATION_OUTBOX_SCHEMA_VERSION
      || previous.subtype !== subtype
      || previous.target?.path !== targetPath) {
      return null;
    }
    const expectedVersion = version == null ? previous.version : cleanActivityVersion(version);
    if (previous.version !== expectedVersion) return null;
    if (previous.state === 'ready' && previous.readyVersion === expectedVersion) {
      transaction.update(ref, {
        deliverySignal: admin.firestore.FieldValue.increment(1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { outboxId, version: expectedVersion, state: 'ready', changed: false };
    }
    transaction.update(ref, {
      state: 'ready',
      readyVersion: expectedVersion,
      deliverySignal: admin.firestore.FieldValue.increment(1),
      occurredAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { outboxId, version: expectedVersion, state: 'ready', changed: true };
  });
}

async function handleOwnerNotificationOutboxWrite({ admin, event }) {
  const after = event?.data?.after?.exists ? event.data.after.data() || {} : null;
  if (!validOwnerNotificationOutbox(after)) {
    return { status: 'ignored', reason: 'no_ready_owner_notification' };
  }
  const descriptor = await upsertNotification({
    admin,
    uid: after.uid,
    notificationId: systemNotificationId(after.subtype, after.target.path),
    activityVersion: after.readyVersion,
    requireExistingUser: true,
    notification: {
      channel: 'personal',
      type: 'system',
      subtype: after.subtype,
      priority: 'normal',
      count: 1,
      target: after.target,
      navigation: navigationForTarget(after.target),
      createdAt: after.occurredAt || after.updatedAt,
    },
  });
  return {
    status: descriptor ? 'delivered' : 'already_current',
    version: after.readyVersion,
  };
}

function notificationCleanupJobId(targetPath) {
  const path = typeof targetPath === 'string' ? targetPath.trim() : '';
  if (!path || path.length > 500) {
    fail('invalid-argument', 'Notification cleanup target is invalid.', 'invalid_notification_target');
  }
  return hashId('notification_cleanup', path);
}

function notificationCleanupJobRef(db, targetPath) {
  return db.doc(
    `system/runtime/notificationCleanupJobs/${notificationCleanupJobId(targetPath)}`
  );
}

function stageNotificationCleanupJob({
  transaction,
  admin,
  jobRef,
  existingSnapshot,
  targetPath,
  authorizedUid,
}) {
  const previous = existingSnapshot?.exists ? existingSnapshot.data() || {} : {};
  const version = Math.max(0, Math.trunc(Number(previous.version) || 0)) + 1;
  transaction.set(jobRef, {
    schemaVersion: NOTIFICATION_CLEANUP_JOB_SCHEMA_VERSION,
    type: 'target_notification_cleanup',
    state: 'ready',
    version,
    targetPath,
    authorizedUid: cleanId(authorizedUid, 'authorizedUid'),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return version;
}

function validNotificationCleanupJob(value) {
  return value?.schemaVersion === NOTIFICATION_CLEANUP_JOB_SCHEMA_VERSION
    && value?.type === 'target_notification_cleanup'
    && ['ready', 'complete'].includes(value?.state)
    && Number.isSafeInteger(value?.version)
    && value.version >= 1
    && typeof value?.targetPath === 'string'
    && value.targetPath.length > 0
    && value.targetPath.length <= 500
    && typeof value?.authorizedUid === 'string';
}

async function processNotificationCleanupJob({ admin, targetPath, expectedVersion = null }) {
  const db = admin.firestore();
  const ref = notificationCleanupJobRef(db, targetPath);
  const snapshot = await ref.get();
  if (!snapshot.exists || !validNotificationCleanupJob(snapshot.data())) {
    return { status: 'ignored', reason: 'cleanup_job_missing' };
  }
  const job = snapshot.data() || {};
  if (expectedVersion != null && job.version !== cleanActivityVersion(expectedVersion)) {
    return { status: 'ignored', reason: 'cleanup_job_superseded' };
  }
  if (job.state === 'complete') return { status: 'complete', deleted: 0, version: job.version };
  const deleted = await purgeNotificationsForTarget({ admin, targetPath: job.targetPath });
  const completed = await db.runTransaction(async (transaction) => {
    const current = await transaction.get(ref);
    if (!current.exists || !validNotificationCleanupJob(current.data())) return false;
    const value = current.data() || {};
    if (value.state !== 'ready' || value.version !== job.version) return false;
    const expireAt = admin.firestore.Timestamp?.fromMillis
      ? admin.firestore.Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    transaction.update(ref, {
      state: 'complete',
      deleted,
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      expireAt,
    });
    return true;
  });
  return completed
    ? { status: 'complete', deleted, version: job.version }
    : { status: 'superseded', deleted, version: job.version };
}

async function handleNotificationCleanupJobWrite({ admin, event }) {
  const after = event?.data?.after?.exists ? event.data.after.data() || {} : null;
  if (!validNotificationCleanupJob(after) || after.state !== 'ready') {
    return { status: 'ignored', reason: 'cleanup_job_not_ready' };
  }
  return processNotificationCleanupJob({
    admin,
    targetPath: after.targetPath,
    expectedVersion: after.version,
  });
}

function notificationOwnerId(entry) {
  const parts = String(entry?.ref?.path || '').split('/');
  return parts.length === 4 && parts[0] === 'users' && parts[2] === 'notifications'
    ? parts[1]
    : null;
}

async function purgeMatchingNotifications({ admin, buildQuery, matches }) {
  const db = admin.firestore();
  let deleted = 0;
  while (true) {
    const page = await buildQuery().limit(PURGE_LIMIT).get();
    if (page.empty) break;
    const pageDeleted = await db.runTransaction(async (transaction) => {
      const snapshots = await Promise.all(page.docs.map((entry) => transaction.get(entry.ref)));
      const eligible = snapshots.filter((snapshot) => snapshot.exists && matches(snapshot.data() || {}));
      const counterDeltas = new Map();
      eligible.forEach((snapshot) => {
        const uid = notificationOwnerId(snapshot);
        const value = snapshot.data() || {};
        if (uid && isV2Notification(value) && value.isRead !== true) {
          const key = `${uid}|${value.channel}`;
          counterDeltas.set(key, (counterDeltas.get(key) || 0) - 1);
        }
        transaction.delete(snapshot.ref);
      });
      counterDeltas.forEach((delta, key) => {
        const [uid, channel] = key.split('|');
        adjustUnreadCounter({ transaction, admin, db, uid, channel, delta });
      });
      return eligible.length;
    });
    deleted += pageDeleted;
    if (page.size < PURGE_LIMIT) break;
  }
  return deleted;
}

async function purgeNotificationsForTarget({ admin, targetPath, includeDescendants = false }) {
  const path = typeof targetPath === 'string' ? targetPath.trim() : '';
  if (!path || path.length > 500) {
    fail('invalid-argument', 'Notification target path is invalid.', 'invalid_notification_target');
  }
  const db = admin.firestore();
  let deleted = await purgeMatchingNotifications({
    admin,
    buildQuery: () => db.collectionGroup('notifications').where('target.path', '==', path),
    matches: (value) => value?.target?.path === path,
  });
  if (includeDescendants) {
    const prefix = `${path}/`;
    deleted += await purgeMatchingNotifications({
      admin,
      buildQuery: () => db.collectionGroup('notifications')
        .where('target.path', '>=', prefix)
        .where('target.path', '<', `${prefix}\uf8ff`),
      matches: (value) => typeof value?.target?.path === 'string'
        && value.target.path.startsWith(prefix),
    });
  }
  return deleted;
}

async function purgeNotificationsForActor({ admin, actorId }) {
  const id = cleanId(actorId, 'actorId');
  const db = admin.firestore();
  return purgeMatchingNotifications({
    admin,
    buildQuery: () => db.collectionGroup('notifications').where('actorId', '==', id),
    // Canonical grouped-like contributions have already been detached from
    // their source like documents before this final privacy sweep. Removing
    // any residual direct-actor row also guarantees progress over legacy rows.
    matches: (value) => value?.actorId === id,
  });
}

async function purgeNotificationsForActorForRecipient({ admin, uid, actorId }) {
  const recipientId = cleanId(uid, 'uid');
  const id = cleanId(actorId, 'actorId');
  const db = admin.firestore();
  return purgeMatchingNotifications({
    admin,
    buildQuery: () => db.collection(`users/${recipientId}/notifications`)
      .where('actorId', '==', id)
      .where('type', '==', 'comment'),
    matches: (value) => value?.actorId === id && value?.type === 'comment',
  });
}

async function purgeAdminNotificationsForUser({ admin, uid }) {
  const userId = cleanId(uid, 'uid');
  const db = admin.firestore();
  const deleted = await purgeMatchingNotifications({
    admin,
    buildQuery: () => db.collection(`users/${userId}/notifications`).where('channel', '==', 'admin'),
    matches: (value) => value?.channel === 'admin',
  });
  await db.runTransaction(async (transaction) => {
    const user = await transaction.get(db.doc(`users/${userId}`));
    if (!notificationRecipientEligible(user)) return;
    transaction.set(notificationStateRef(db, userId), {
      schemaVersion: NOTIFICATION_SCHEMA_VERSION,
      adminUnread: 0,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  return deleted;
}

async function detachGroupedLikeContribution({ admin, likeRef, deleteLike = true }) {
  const db = admin.firestore();
  const targetRef = likeRef?.parent?.parent;
  if (!targetRef) return { detached: false };
  return db.runTransaction(async (transaction) => {
    const [likeSnapshot, targetSnapshot] = await Promise.all([
      transaction.get(likeRef),
      transaction.get(targetRef),
    ]);
    if (!likeSnapshot.exists) return { detached: false };
    const like = likeSnapshot.data() || {};
    const ownerId = (targetSnapshot.exists ? targetSnapshot.data()?.ownerId : null)
      || like.notificationRecipientId
      || null;
    const notificationId = typeof like.notificationId === 'string' ? like.notificationId : null;
    const generation = typeof like.notificationGeneration === 'string'
      ? like.notificationGeneration
      : null;
    let notificationSnapshot = null;
    let notificationRef = null;
    if (ownerId && notificationId && generation) {
      notificationRef = db.doc(`users/${ownerId}/notifications/${notificationId}`);
      notificationSnapshot = await transaction.get(notificationRef);
    }
    if (deleteLike) {
      transaction.delete(likeRef);
    } else {
      transaction.update(likeRef, { notificationId: null, notificationGeneration: null });
    }
    if (!notificationSnapshot) return { detached: false };
    const transition = prepareGroupedLikeRemoval({
      existingSnapshot: notificationSnapshot,
      actorId: like.userId || likeRef.id,
      generation,
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
    return { detached: transition.action !== 'none' };
  });
}

async function detachBlockedActorLikeContributions({ admin, uid, actorId }) {
  const recipientId = cleanId(uid, 'uid');
  const blockedActorId = cleanId(actorId, 'actorId');
  const db = admin.firestore();
  let cursor = null;
  let detached = 0;
  while (true) {
    let query = db.collectionGroup('likes')
      .where('userId', '==', blockedActorId)
      .where('notificationRecipientId', '==', recipientId)
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(BLOCKED_LIKE_PAGE_SIZE);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    for (let offset = 0; offset < page.docs.length; offset += 10) {
      const results = await Promise.all(page.docs.slice(offset, offset + 10).map((entry) => (
        detachGroupedLikeContribution({ admin, likeRef: entry.ref, deleteLike: false })
      )));
      detached += results.filter((result) => result?.detached).length;
    }
    if (page.size < BLOCKED_LIKE_PAGE_SIZE) break;
    cursor = page.docs[page.docs.length - 1];
  }
  return detached;
}

function notificationDeliveryDescriptor({ userId, notificationId, before, after }) {
  if (!isV2Notification(after)) return null;
  const beforeVersion = Math.max(0, Math.trunc(Number(before?.push?.version) || 0));
  const afterVersion = Math.max(0, Math.trunc(Number(after?.push?.version) || 0));
  if (afterVersion <= beforeVersion) return null;
  return {
    userId: cleanId(userId, 'userId'),
    notificationId: cleanId(notificationId, 'notificationId'),
    channel: after.channel,
    type: after.type,
    subtype: after.subtype,
    priority: after.priority,
    version: afterVersion,
  };
}

module.exports = {
  BULK_DELETE_LIMIT,
  BULK_READ_LIMIT,
  MAX_ACTOR_PREVIEWS,
  MAX_COMMENT_EXCERPT,
  MAX_TARGET_THUMB_URLS,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_CLEANUP_JOB_SCHEMA_VERSION,
  NOTIFICATION_PRIORITIES,
  NOTIFICATION_SCHEMA_VERSION,
  NOTIFICATION_SUBTYPES,
  NOTIFICATION_TYPES,
  OWNER_NOTIFICATION_OUTBOX_SCHEMA_VERSION,
  PURGE_LIMIT,
  buildNotificationDocument,
  buildNotificationTarget,
  canonicalTarget,
  clearNotifications,
  commentNotificationId,
  completeOwnerNotificationOutbox,
  createNotificationGeneration,
  deleteNotification,
  destinationNotificationId,
  detachGroupedLikeContribution,
  detachBlockedActorLikeContributions,
  fanoutAdminNotification,
  groupedLikeNotificationId,
  handleOwnerNotificationOutboxWrite,
  handleNotificationCleanupJobWrite,
  markAllNotificationsRead,
  moderationNavigation,
  moderationNotificationId,
  navigationForTarget,
  notificationDeliveryDescriptor,
  notificationCleanupJobId,
  notificationCleanupJobRef,
  notificationRecipientEligible,
  notificationStateRef,
  ownerNotificationOutboxId,
  prepareGroupedLikeActivity,
  prepareGroupedLikeRemoval,
  prepareOwnerNotificationOutbox,
  processNotificationCleanupJob,
  purgeAdminNotificationsForUser,
  purgeNotificationsForActor,
  purgeNotificationsForActorForRecipient,
  purgeNotificationsForTarget,
  requestedChannel,
  sanitizeActorPreview,
  sanitizeNavigation,
  setNotificationRead,
  stageNotificationActivity,
  stageNotificationCleanupJob,
  stageNotificationDelete,
  systemNotificationId,
  upsertNotification,
};
