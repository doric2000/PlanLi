const crypto = require('crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { normalizeReportTarget } = require('./moderationService');
const { buildModerationPreview, hydrateModerationPreviews } = require('./moderationPreview');
const { deleteComment } = require('./socialService');
const { syncPublicProfile } = require('./publicProfiles');
const { setMediaAvailability } = require('./mediaModeration');
const {
  deleteAccountInternal,
  deleteContentInternal,
} = require('./deletionService');
const {
  buildNotificationTarget,
  completeOwnerNotificationOutbox,
  detachGroupedLikeContribution,
  navigationForTarget,
  notificationRecipientEligible,
  ownerNotificationOutboxId,
  prepareOwnerNotificationOutbox,
  purgeAdminNotificationsForUser,
  purgeNotificationsForActor,
  purgeNotificationsForTarget,
  stageNotificationActivity,
  systemNotificationId,
} = require('./notificationService');

const PAGE_SIZE = 30;
const RECENT_AUTH_SECONDS = 10 * 60;
// Only actions that can change account authority, account trust level, or
// suspend/remove content are marked sensitive. CRUD-like content-enrichment and
// destination maintenance actions stay non-sensitive to avoid unnecessary
// re-auth flow in normal moderation work.
const SENSITIVE_ADMIN_ACTIONS = Object.freeze({
  moderateContent: {
    recentSignIn: true,
    reason: 'content moderation and deletion (reports, holds, restores, deletions).',
  },
  setUserSuspension: {
    recentSignIn: true,
    reason: 'suspending/unsuspending a user affects account availability.',
  },
  setUserEmailVerified: {
    recentSignIn: true,
    reason: 'changing a user’s email verification state alters account trust level.',
  },
  setUserAdmin: {
    recentSignIn: true,
    reason: 'granting/removing admin rights changes system privileges.',
  },
  deleteUserAsAdmin: {
    recentSignIn: true,
    reason: 'full account deletion removes data and media and is irreversible.',
  },
  deactivateDestination: {
    recentSignIn: true,
    reason: 'deactivating a city affects public catalog and linked public content.',
  },
  setDestinationHebrewName: {
    recentSignIn: true,
    reason: 'renaming a destination updates public catalog and linked public content.',
  },
});

function isRecentSignInRequired(action) {
  return !!SENSITIVE_ADMIN_ACTIONS[action]?.recentSignIn;
}

function sensitiveAdminActions() {
  return Object.freeze({ ...SENSITIVE_ADMIN_ACTIONS });
}

function fail(code, message, reason) {
  throw new HttpsError(code, message, { reason });
}

function assertAdmin(auth) {
  if (!auth?.uid || auth.token?.admin !== true) fail('permission-denied', 'Admin access is required.', 'admin_required');
}

function assertRecentAuth(auth) {
  const authTime = Number(auth?.token?.auth_time || 0);
  if (!authTime || Date.now() / 1000 - authTime > RECENT_AUTH_SECONDS) {
    fail('failed-precondition', 'Recent sign-in is required.', 'recent_sign_in_required');
  }
}

function cleanText(value, field, maximum = 500) {
  const result = typeof value === 'string' ? value.trim() : '';
  if (!result || result.length > maximum) fail('invalid-argument', `${field} is invalid.`, 'invalid_input');
  return result;
}

function serialize(value) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(serialize);
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)]));
  return value;
}

function publicModerationReport(entry) {
  const report = entry?.data?.() || {};
  return {
    id: entry?.id || '',
    category: report.category || 'other',
    details: report.details || '',
    createdAt: report.createdAt || null,
    updatedAt: report.updatedAt || null,
  };
}

function publicModerationCase(item = {}) {
  return {
    id: item.id || '',
    caseId: item.caseId || item.id || '',
    target: item.target || null,
    targetOwnerId: item.targetOwnerId || null,
    targetPreview: item.targetPreview || null,
    status: item.status || 'open',
    priority: item.priority || 'normal',
    reportCount: Number(item.reportCount || 0),
    uniqueCount24h: Number(item.uniqueCount24h || 0),
    categoryCounts: item.categoryCounts || {},
    firstReportedAt: item.firstReportedAt || null,
    updatedAt: item.updatedAt || null,
    dueAtMs: Number(item.dueAtMs || 0) || null,
    resolvedAt: item.resolvedAt || null,
    resolvedBy: item.resolvedBy || null,
    resolutionReason: item.resolutionReason || '',
  };
}

async function assertActiveAdminRegistry({ admin, auth }) {
  const ref = admin.firestore().doc(`system/moderation/admins/${auth.uid}`);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data()?.active !== true) {
    fail('permission-denied', 'Admin access is required.', 'admin_required');
  }
}

async function audit({ admin, auth, action, target = null, reason, metadata = {} }) {
  const id = `${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  await admin.firestore().doc(`system/moderation/audit/${id}`).create({
    actorUid: auth.uid,
    actorName: typeof auth.token?.name === 'string' ? auth.token.name.trim().slice(0, 80) : '',
    action,
    target,
    reason,
    metadata,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return id;
}

async function prepareAdmin(admin, auth, { recent = false } = {}) {
  assertAdmin(auth);
  if (recent) assertRecentAuth(auth);
  await assertActiveAdminRegistry({ admin, auth });
}

async function prepareAdminAction(admin, auth, action) {
  await prepareAdmin(admin, auth, { recent: isRecentSignInRequired(action) });
}

async function getModerationDashboard({ admin, auth }) {
  await prepareAdminAction(admin, auth, 'getModerationDashboard');
  const db = admin.firestore();
  const cases = db.collection('system/moderation/cases');
  const [open, urgent, heldRecommendations, heldRoutes, heldTrips, pendingDestinations] = await Promise.all([
    cases.where('status', 'in', ['open', 'auto_held']).count().get(),
    cases.where('priority', '==', 'urgent').where('status', 'in', ['open', 'auto_held']).count().get(),
    db.collection('recommendations').where('status', '==', 'moderation_hold').count().get(),
    db.collection('routes').where('status', '==', 'moderation_hold').count().get(),
    db.collection('trips').where('status', '==', 'moderation_hold').count().get(),
    db.collection('system/moderation/destinationReviews')
      .where('status', 'in', ['blocked', 'open', 'ready'])
      .count()
      .get(),
  ]);
  return {
    openCases: open.data().count,
    urgentCases: urgent.data().count,
    heldContent: heldRecommendations.data().count + heldRoutes.data().count + heldTrips.data().count,
    pendingDestinations: pendingDestinations.data().count,
  };
}

async function listModerationCases({ admin, auth, data }) {
  await prepareAdminAction(admin, auth, 'listModerationCases');
  const requestedStatus = typeof data?.status === 'string' ? data.status : null;
  let query = admin.firestore().collection('system/moderation/cases')
    .orderBy('updatedAt', 'desc')
    .limit(PAGE_SIZE);
  if (requestedStatus === 'all') {
    // Explicitly requested history includes resolved cases.
  } else if (requestedStatus) {
    query = query.where('status', '==', requestedStatus);
  } else {
    query = query.where('status', 'in', ['open', 'auto_held']);
  }
  if (data?.cursor) {
    const cursor = await admin.firestore().doc(`system/moderation/cases/${cleanText(data.cursor, 'cursor', 180)}`).get();
    if (cursor.exists) query = query.startAfter(cursor);
  }
  const snapshot = await query.get();
  const items = await hydrateModerationPreviews(admin, snapshot.docs.map((entry) => ({
    id: entry.id,
    ...entry.data(),
  })));
  return {
    items: items.map((item) => serialize(publicModerationCase(item))),
    nextCursor: snapshot.size === PAGE_SIZE ? snapshot.docs[snapshot.docs.length - 1].id : null,
  };
}

async function getModerationCase({ admin, auth, data }) {
  await prepareAdminAction(admin, auth, 'getModerationCase');
  const caseId = cleanText(data?.caseId, 'caseId', 180);
  const ref = admin.firestore().doc(`system/moderation/cases/${caseId}`);
  const [snapshot, reports] = await Promise.all([
    ref.get(),
    ref.collection('reports').orderBy('updatedAt', 'desc').limit(50).get(),
  ]);
  if (!snapshot.exists) fail('not-found', 'Moderation case was not found.', 'case_missing');
  const [item] = await hydrateModerationPreviews(admin, [{
    id: snapshot.id,
    ...snapshot.data(),
  }]);
  return serialize({
    ...publicModerationCase(item),
    reports: reports.docs.map(publicModerationReport),
  });
}

async function listHeldContent({ admin, auth }) {
  await prepareAdminAction(admin, auth, 'listHeldContent');
  const db = admin.firestore();
  const groups = await Promise.all([
    ['recommendation', db.collection('recommendations').where('status', '==', 'moderation_hold').limit(PAGE_SIZE).get()],
    ['route', db.collection('routes').where('status', '==', 'moderation_hold').limit(PAGE_SIZE).get()],
    ['trip', db.collection('trips').where('status', '==', 'moderation_hold').limit(PAGE_SIZE).get()],
  ].map(async ([type, promise]) => [type, await promise]));
  const items = groups.flatMap(([type, snapshot]) => snapshot.docs.map((entry) => ({
    id: `content_${type}_${entry.id}`,
    target: { type, id: entry.id, path: entry.ref.path },
    targetOwnerId: entry.data()?.ownerId || null,
    title: entry.data()?.title || '',
    status: entry.data()?.status,
    priority: 'normal',
    updatedAt: entry.data()?.updatedAt || null,
    targetPreview: buildModerationPreview({
      target: { type, id: entry.id, path: entry.ref.path },
      data: entry.data(),
    }),
  })));
  items.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  return { items: items.slice(0, PAGE_SIZE).map(serialize), nextCursor: null };
}

async function moderateContent({ admin, auth, data, mediaBucket }) {
  await prepareAdminAction(admin, auth, 'moderateContent');
  const reason = cleanText(data?.reason, 'reason');
  const action = String(data?.action || '');
  if (!['dismiss', 'hold', 'restore', 'delete'].includes(action)) fail('invalid-argument', 'Invalid moderation action.', 'invalid_action');
  const target = normalizeReportTarget(data?.target);
  if (!['recommendation', 'route', 'trip', 'comment'].includes(target.type)) {
    fail('invalid-argument', 'Target cannot be moderated here.', 'invalid_target');
  }
  const db = admin.firestore();
  const caseId = data?.caseId ? cleanText(data.caseId, 'caseId', 180) : null;
  if (action === 'dismiss' && !caseId) {
    fail('invalid-argument', 'A moderation case is required to dismiss a report.', 'case_required');
  }
  let caseSnapshot = null;
  if (caseId) {
    caseSnapshot = await db.doc(`system/moderation/cases/${caseId}`).get();
    if (!caseSnapshot.exists) fail('not-found', 'Moderation case was not found.', 'case_missing');
    const caseTarget = normalizeReportTarget(caseSnapshot.data()?.target);
    if (caseTarget.path !== target.path) fail('invalid-argument', 'Moderation target does not match the case.', 'invalid_target');
  }
  const targetSnapshot = await db.doc(target.path).get();
  if (!targetSnapshot.exists) {
    if (action === 'delete') {
      const outboxId = ownerNotificationOutboxId('content_deleted', target.path);
      const outbox = await db.doc(
        `system/moderation/ownerNotifications/${outboxId}`
      ).get();
      let recovered = null;
      if (outbox.exists) {
        await purgeNotificationsForTarget({
          admin,
          targetPath: target.path,
          includeDescendants: true,
        });
        recovered = await completeOwnerNotificationOutbox({
          admin,
          subtype: 'content_deleted',
          targetPath: target.path,
        });
      }
      if (recovered) {
        if (caseId) {
          await db.doc(`system/moderation/cases/${caseId}`).set({
            status: 'resolved_deleted',
            resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
            resolvedBy: auth.uid,
            resolutionReason: reason,
          }, { merge: true });
        }
        await audit({ admin, auth, action: 'content_delete', target, reason });
        return { success: true, action, target, recovered: true };
      }
    }
    fail('not-found', 'Moderated content is no longer available.', 'content_missing');
  }
  const targetData = targetSnapshot.data() || {};
  const targetOwnerId = target.type === 'comment' ? targetData.authorId : targetData.ownerId;
  const casePreview = caseSnapshot?.data()?.targetPreview || null;
  const notificationTarget = buildNotificationTarget({
    target: {
      ...target,
      title: casePreview?.title,
      thumbUrls: [casePreview?.thumbUrl, casePreview?.imageUrl].filter(Boolean),
    },
    data: targetData,
    parentData: target.type === 'comment' ? casePreview : null,
  });
  if (action === 'dismiss' && targetSnapshot.data()?.status !== 'active') {
    fail('failed-precondition', 'Only published content can remain published.', 'content_not_active');
  }
  if (action === 'restore') {
    const restoredRetry = targetData.status === 'active'
      && targetData.moderation?.lastAction === 'restore';
    if (targetData.status !== 'moderation_hold' && !restoredRetry) {
      fail('failed-precondition', 'Only held content can be restored.', 'content_not_held');
    }
    const snapshot = targetSnapshot;
    const ownerId = target.type === 'comment' ? snapshot.data()?.authorId : snapshot.data()?.ownerId;
    if (ownerId) {
      const owner = await admin.firestore().doc(`users/${ownerId}`).get();
      if (owner.data()?.moderation?.status === 'suspended') {
        fail('failed-precondition', 'Suspended-user content cannot be restored.', 'owner_suspended');
      }
    }
  }
  if (action === 'dismiss') {
    // Dismissing a report deliberately leaves the already-published target unchanged.
  } else if (action === 'delete') {
    const deletionOutbox = targetOwnerId
      ? await prepareOwnerNotificationOutbox({
        admin,
        uid: targetOwnerId,
        subtype: 'content_deleted',
        target: notificationTarget,
      })
      : null;
    if (target.type === 'comment') {
      await deleteComment({
        admin,
        auth,
        data: { target: { type: target.parentType, id: target.parentId }, commentId: target.id },
      });
    } else {
      await deleteContentInternal({ admin, target, actorUid: auth.uid, isAdmin: true, mediaBucket });
    }
    if (deletionOutbox) {
      await completeOwnerNotificationOutbox({
        admin,
        subtype: 'content_deleted',
        targetPath: target.path,
        version: deletionOutbox.version,
      });
    }
  } else {
    await db.runTransaction(async (transaction) => {
      const current = await transaction.get(db.doc(target.path));
      if (!current.exists) fail('not-found', 'Moderated content is no longer available.', 'content_missing');
      const currentData = current.data() || {};
      const desiredStatus = action === 'restore' ? 'active' : 'moderation_hold';
      const alreadyApplied = currentData.status === desiredStatus;
      if (action === 'restore'
        && alreadyApplied
        && currentData.moderation?.lastAction !== 'restore') {
        fail('failed-precondition', 'Only held content can be restored.', 'content_not_held');
      }
      if (action === 'restore'
        && !alreadyApplied
        && currentData.status !== 'moderation_hold') {
        fail('failed-precondition', 'Only held content can be restored.', 'content_not_held');
      }
      if (action === 'hold'
        && !alreadyApplied
        && currentData.status !== 'active') {
        fail('failed-precondition', 'Only published content can be held.', 'content_not_active');
      }
      const currentOwnerId = target.type === 'comment'
        ? currentData.authorId
        : currentData.ownerId;
      const subtype = action === 'restore' ? 'content_restored' : 'content_held';
      const notificationRef = !alreadyApplied && currentOwnerId
        ? db.doc(
          `users/${currentOwnerId}/notifications/${systemNotificationId(subtype, target.path)}`
        )
        : null;
      const [notificationSnapshot, ownerSnapshot] = notificationRef
        ? await Promise.all([
          transaction.get(notificationRef),
          transaction.get(db.doc(`users/${currentOwnerId}`)),
        ])
        : [null, null];
      transaction.update(db.doc(target.path), {
        status: desiredStatus,
        moderation: {
          lastAction: action,
          reason,
          actorUid: auth.uid,
          at: admin.firestore.FieldValue.serverTimestamp(),
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      if (notificationRef && notificationSnapshot && notificationRecipientEligible(ownerSnapshot)) {
        stageNotificationActivity({
          transaction,
          admin,
          db,
          uid: currentOwnerId,
          notificationRef,
          existingSnapshot: notificationSnapshot,
          notification: {
            channel: 'personal',
            type: 'system',
            subtype,
            priority: 'normal',
            count: 1,
            target: notificationTarget,
            navigation: navigationForTarget(target),
          },
        });
      }
    });
    if (target.type !== 'comment') {
      await setMediaAvailability({
        admin,
        data: targetSnapshot.data(),
        mediaBucket,
        available: action === 'restore',
        reason: action === 'hold' ? reason : null,
      });
    }
  }
  if (target.type === 'comment' && action !== 'dismiss') {
    const parentRef = db.doc(`${target.path.split('/').slice(0, 2).join('/')}`);
    const activeComments = await parentRef.collection('comments').where('status', '==', 'active').count().get();
    await parentRef.update({
      'stats.commentCount': activeComments.data().count,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }).catch(() => {});
  }
  if (caseId) {
    await db.doc(`system/moderation/cases/${caseId}`).set({
      status: action === 'dismiss'
        ? 'resolved_dismissed'
        : action === 'restore'
          ? 'resolved_restored'
          : action === 'delete'
            ? 'resolved_deleted'
            : 'resolved_held',
      resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
      resolvedBy: auth.uid,
      resolutionReason: reason,
    }, { merge: true });
  }
  await audit({ admin, auth, action: `content_${action}`, target, reason });
  return { success: true, action, target };
}

async function resolveUser(admin, data) {
  const identifier = cleanText(data?.identifier, 'identifier', 320);
  try {
    return identifier.includes('@')
      ? await admin.auth().getUserByEmail(identifier.toLowerCase())
      : await admin.auth().getUser(identifier);
  } catch {
    fail('not-found', 'User was not found.', 'user_missing');
  }
}

function publicAdminUser(user) {
  return {
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || '',
    emailVerified: user.emailVerified,
    disabled: user.disabled,
    admin: user.customClaims?.admin === true,
    providers: (user.providerData || []).map((provider) => provider.providerId),
    createdAt: user.metadata?.creationTime || null,
    lastSignInAt: user.metadata?.lastSignInTime || null,
  };
}

async function listAdminUsers({ admin, auth, data }) {
  await prepareAdminAction(admin, auth, 'listAdminUsers');
  if (data?.query) {
    const identifier = cleanText(data.query, 'query', 320);
    if (identifier.includes('@')) {
      const user = await resolveUser(admin, { identifier });
      return { items: [publicAdminUser(user)], nextCursor: null };
    }
    if (!/\s/u.test(identifier) && identifier.length <= 128) {
      try {
        const user = await admin.auth().getUser(identifier);
        return { items: [publicAdminUser(user)], nextCursor: null };
      } catch (error) {
        if (!['auth/user-not-found', 'auth/invalid-uid'].includes(error?.code)) throw error;
      }
    }
    const profiles = await admin.firestore().collection('users')
      .where('displayName', '==', identifier)
      .limit(PAGE_SIZE)
      .get();
    if (profiles.empty) fail('not-found', 'User was not found.', 'user_missing');
    const result = await admin.auth().getUsers(profiles.docs.map((entry) => ({ uid: entry.id })));
    return { items: result.users.map(publicAdminUser), nextCursor: null };
  }
  const result = await admin.auth().listUsers(PAGE_SIZE, data?.cursor || undefined);
  return { items: result.users.map(publicAdminUser), nextCursor: result.pageToken || null };
}

async function getAdminUser({ admin, auth, data }) {
  await prepareAdminAction(admin, auth, 'getAdminUser');
  const user = await resolveUser(admin, data);
  const profile = await admin.firestore().doc(`users/${user.uid}`).get();
  return serialize({ ...publicAdminUser(user), profile: profile.exists ? profile.data() : null });
}

async function hideUserContent({ admin, uid, mediaBucket }) {
  const db = admin.firestore();
  let hidden = 0;
  for (const collectionName of ['recommendations', 'routes', 'trips']) {
    const snapshot = await db.collection(collectionName).where('ownerId', '==', uid).get();
    for (let offset = 0; offset < snapshot.docs.length; offset += 400) {
      const batch = db.batch();
      snapshot.docs.slice(offset, offset + 400).forEach((entry) => {
        if (entry.data()?.status !== 'deleting') {
          batch.update(entry.ref, { status: 'suspended', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
          hidden += 1;
        }
      });
      await batch.commit();
      await Promise.all(snapshot.docs.slice(offset, offset + 400).map((entry) => (
        setMediaAvailability({
          admin,
          data: entry.data(),
          mediaBucket,
          available: false,
          reason: 'owner_suspended',
        })
      )));
    }
  }
  const comments = await db.collectionGroup('comments').where('authorId', '==', uid).get();
  const affectedParents = new Map();
  comments.docs.forEach((entry) => {
    const parent = entry.ref.parent.parent;
    if (parent) affectedParents.set(parent.path, parent);
  });
  for (let offset = 0; offset < comments.docs.length; offset += 400) {
    const batch = db.batch();
    comments.docs.slice(offset, offset + 400).forEach((entry) => {
      batch.update(entry.ref, { status: 'suspended', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      hidden += 1;
    });
    await batch.commit();
  }
  for (const parent of affectedParents.values()) {
    const activeComments = await parent.collection('comments').where('status', '==', 'active').count().get();
    await parent.update({
      'stats.commentCount': activeComments.data().count,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }).catch(() => {});
  }
  const likes = await db.collectionGroup('likes').where('userId', '==', uid).get();
  for (let offset = 0; offset < likes.docs.length; offset += 10) {
    await Promise.all(likes.docs.slice(offset, offset + 10).map((entry) => (
      detachGroupedLikeContribution({ admin, likeRef: entry.ref, deleteLike: false })
    )));
  }
  await purgeNotificationsForActor({ admin, actorId: uid });
  await db.doc(`publicProfiles/${uid}`).set({ status: 'suspended' }, { merge: true });
  return hidden;
}

async function setUserSuspension({ admin, auth, data, mediaBucket }) {
  await prepareAdminAction(admin, auth, 'setUserSuspension');
  const user = await resolveUser(admin, data);
  if (user.uid === auth.uid) fail('failed-precondition', 'You cannot suspend yourself.', 'self_admin_action');
  const suspended = data?.suspended === true;
  const reason = cleanText(data?.reason, 'reason');
  await admin.auth().updateUser(user.uid, { disabled: suspended });
  await admin.auth().revokeRefreshTokens(user.uid);
  await admin.firestore().doc(`users/${user.uid}`).set({
    moderation: {
      status: suspended ? 'suspended' : 'active',
      reason,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      actorUid: auth.uid,
    },
  }, { merge: true });
  const privateProfile = await admin.firestore().doc(`users/${user.uid}`).get();
  if (privateProfile.exists) {
    await setMediaAvailability({
      admin,
      data: privateProfile.data(),
      mediaBucket,
      available: !suspended,
      reason: suspended ? 'owner_suspended' : null,
    });
  }
  const hidden = suspended ? await hideUserContent({ admin, uid: user.uid, mediaBucket }) : 0;
  if (suspended) {
    await admin.firestore().doc(`publicProfiles/${user.uid}`).delete().catch(() => {});
  } else {
    if (privateProfile.exists) await syncPublicProfile(admin, user.uid, privateProfile.data());
  }
  await audit({ admin, auth, action: suspended ? 'user_suspended' : 'user_unsuspended', target: { uid: user.uid }, reason, metadata: { hidden } });
  return { uid: user.uid, suspended, hidden };
}

async function setUserEmailVerified({ admin, auth, data }) {
  await prepareAdminAction(admin, auth, 'setUserEmailVerified');
  const user = await resolveUser(admin, data);
  if (user.uid === auth.uid) fail('failed-precondition', 'You cannot modify your own verification.', 'self_admin_action');
  const verified = data?.verified === true;
  const reason = cleanText(data?.reason, 'reason');
  await admin.auth().updateUser(user.uid, { emailVerified: verified });
  await admin.auth().revokeRefreshTokens(user.uid);
  await audit({ admin, auth, action: verified ? 'email_verified' : 'email_unverified', target: { uid: user.uid }, reason });
  return { uid: user.uid, verified };
}

async function setUserAdmin({ admin, auth, data }) {
  await prepareAdminAction(admin, auth, 'setUserAdmin');
  const user = await resolveUser(admin, data);
  if (user.uid === auth.uid) fail('failed-precondition', 'You cannot change your own admin access.', 'self_admin_action');
  const enabled = data?.admin === true;
  const reason = cleanText(data?.reason, 'reason');
  if (!enabled) {
    const registry = await admin.firestore().collection('system/moderation/admins').where('active', '==', true).count().get();
    if (registry.data().count <= 1) fail('failed-precondition', 'The last admin cannot be removed.', 'last_admin');
  }
  await admin.auth().setCustomUserClaims(user.uid, { ...(user.customClaims || {}), admin: enabled });
  await admin.auth().revokeRefreshTokens(user.uid);
  const ref = admin.firestore().doc(`system/moderation/admins/${user.uid}`);
  if (enabled) await ref.set({ uid: user.uid, active: true, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  else await ref.set({ active: false, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  const adminNotificationsPurged = enabled
    ? 0
    : await purgeAdminNotificationsForUser({ admin, uid: user.uid });
  await audit({ admin, auth, action: enabled ? 'admin_granted' : 'admin_removed', target: { uid: user.uid }, reason });
  return { uid: user.uid, admin: enabled, adminNotificationsPurged };
}

async function deleteUserAsAdmin({ admin, auth, data, mediaBucket }) {
  await prepareAdminAction(admin, auth, 'deleteUserAsAdmin');
  const user = await resolveUser(admin, data);
  if (user.uid === auth.uid) fail('failed-precondition', 'Use account settings to delete your own account.', 'self_admin_action');
  const reason = cleanText(data?.reason, 'reason');
  const db = admin.firestore();
  const deletionKey = crypto.createHash('sha256').update(`delete-user:${user.uid}`).digest('base64url');
  const jobRef = db.doc(`system/moderation/jobs/${deletionKey}`);
  await jobRef.set({ type: 'delete_user', uid: user.uid, status: 'running', step: 'content', createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  const deletion = await deleteAccountInternal({
    admin,
    uid: user.uid,
    mediaBucket,
  });
  await audit({
    admin,
    auth,
    action: 'user_deleted',
    target: { uid: 'deleted-user' },
    reason,
    metadata: {
      ownedContent: deletion.ownedContent,
      interactions: deletion.interactions,
      purgedReports: deletion.purgedReports,
    },
  });
  await jobRef.set({
    uid: admin.firestore.FieldValue.delete(),
    subjectHash: deletionKey,
    status: 'complete',
    step: 'complete',
    completedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    expireAt: admin.firestore.Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000),
  }, { merge: true });
  return { status: 'complete' };
}

async function listModerationAudit({ admin, auth, data }) {
  await prepareAdminAction(admin, auth, 'listModerationAudit');
  let query = admin.firestore().collection('system/moderation/audit').orderBy('createdAt', 'desc').limit(PAGE_SIZE);
  if (data?.cursor) {
    const cursor = await admin.firestore().doc(`system/moderation/audit/${cleanText(data.cursor, 'cursor', 180)}`).get();
    if (cursor.exists) query = query.startAfter(cursor);
  }
  const snapshot = await query.get();
  const items = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
  const missingNames = Array.from(new Set(items
    .filter((item) => !item.actorName && item.actorUid)
    .map((item) => item.actorUid)));
  const actorSnapshots = missingNames.length
    ? await admin.firestore().getAll(...missingNames.map((uid) => admin.firestore().doc(`users/${uid}`)))
    : [];
  const actorNames = new Map(actorSnapshots.map((entry) => [
    entry.id,
    typeof entry.data()?.displayName === 'string' ? entry.data().displayName.trim().slice(0, 80) : '',
  ]));
  return {
    items: items.map((item) => serialize({
      ...item,
      actorName: item.actorName || actorNames.get(item.actorUid) || 'מנהל מערכת',
    })),
    nextCursor: snapshot.size === PAGE_SIZE ? snapshot.docs[snapshot.docs.length - 1].id : null,
  };
}

module.exports = {
  audit,
  assertAdmin,
  assertRecentAuth,
  sensitiveAdminActions,
  deleteUserAsAdmin,
  getAdminUser,
  getModerationCase,
  getModerationDashboard,
  listAdminUsers,
  listHeldContent,
  listModerationAudit,
  listModerationCases,
  moderateContent,
  prepareAdmin,
  publicModerationCase,
  publicModerationReport,
  setUserAdmin,
  setUserEmailVerified,
  prepareAdminAction,
  setUserSuspension,
};
