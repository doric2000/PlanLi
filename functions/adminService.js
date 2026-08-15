const crypto = require('crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { normalizeReportTarget } = require('./moderationService');
const { deleteComment } = require('./socialService');
const { syncPublicProfile } = require('./publicProfiles');
const {
  deleteContentInternal,
  deleteOwnedContent,
  deleteQueryInBatches,
  removeAuthoredInteractions,
} = require('./deletionService');

const PAGE_SIZE = 30;
const RECENT_AUTH_SECONDS = 10 * 60;

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

async function ensureAdminRegistry({ admin, auth }) {
  const ref = admin.firestore().doc(`system/moderation/admins/${auth.uid}`);
  const snapshot = await ref.get();
  if (!snapshot.exists) await ref.set({ uid: auth.uid, active: true, syncedAt: admin.firestore.FieldValue.serverTimestamp() });
}

async function audit({ admin, auth, action, target = null, reason, metadata = {} }) {
  const id = `${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  await admin.firestore().doc(`system/moderation/audit/${id}`).create({
    actorUid: auth.uid,
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
  await ensureAdminRegistry({ admin, auth });
}

async function getModerationDashboard({ admin, auth }) {
  await prepareAdmin(admin, auth);
  const db = admin.firestore();
  const cases = db.collection('system/moderation/cases');
  const [open, urgent, heldRecommendations, heldRoutes, heldTrips, users] = await Promise.all([
    cases.where('status', 'in', ['open', 'auto_held']).count().get(),
    cases.where('priority', '==', 'urgent').where('status', 'in', ['open', 'auto_held']).count().get(),
    db.collection('recommendations').where('status', '==', 'moderation_hold').count().get(),
    db.collection('routes').where('status', '==', 'moderation_hold').count().get(),
    db.collection('trips').where('status', '==', 'moderation_hold').count().get(),
    admin.auth().listUsers(1),
  ]);
  return {
    openCases: open.data().count,
    urgentCases: urgent.data().count,
    heldContent: heldRecommendations.data().count + heldRoutes.data().count + heldTrips.data().count,
    hasUsers: users.users.length > 0,
  };
}

async function listModerationCases({ admin, auth, data }) {
  await prepareAdmin(admin, auth);
  const requestedStatus = typeof data?.status === 'string' ? data.status : null;
  let query = admin.firestore().collection('system/moderation/cases')
    .orderBy('updatedAt', 'desc')
    .limit(PAGE_SIZE);
  if (requestedStatus && requestedStatus !== 'all') query = query.where('status', '==', requestedStatus);
  if (data?.cursor) {
    const cursor = await admin.firestore().doc(`system/moderation/cases/${cleanText(data.cursor, 'cursor', 180)}`).get();
    if (cursor.exists) query = query.startAfter(cursor);
  }
  const snapshot = await query.get();
  return {
    items: snapshot.docs.map((entry) => serialize({ id: entry.id, ...entry.data() })),
    nextCursor: snapshot.size === PAGE_SIZE ? snapshot.docs[snapshot.docs.length - 1].id : null,
  };
}

async function getModerationCase({ admin, auth, data }) {
  await prepareAdmin(admin, auth);
  const caseId = cleanText(data?.caseId, 'caseId', 180);
  const ref = admin.firestore().doc(`system/moderation/cases/${caseId}`);
  const [snapshot, reports] = await Promise.all([
    ref.get(),
    ref.collection('reports').orderBy('updatedAt', 'desc').limit(50).get(),
  ]);
  if (!snapshot.exists) fail('not-found', 'Moderation case was not found.', 'case_missing');
  return serialize({
    id: snapshot.id,
    ...snapshot.data(),
    reports: reports.docs.map((entry) => ({ id: entry.id, ...entry.data() })),
  });
}

async function listHeldContent({ admin, auth }) {
  await prepareAdmin(admin, auth);
  const db = admin.firestore();
  const groups = await Promise.all([
    ['recommendation', db.collection('recommendations').where('status', '==', 'moderation_hold').limit(PAGE_SIZE).get()],
    ['route', db.collection('routes').where('status', '==', 'moderation_hold').limit(PAGE_SIZE).get()],
    ['trip', db.collection('trips').where('status', '==', 'moderation_hold').limit(PAGE_SIZE).get()],
  ].map(async ([type, promise]) => [type, await promise]));
  const items = groups.flatMap(([type, snapshot]) => snapshot.docs.map((entry) => serialize({
    id: `content_${type}_${entry.id}`,
    target: { type, id: entry.id, path: entry.ref.path },
    targetOwnerId: entry.data()?.ownerId || null,
    title: entry.data()?.title || '',
    status: entry.data()?.status,
    priority: 'normal',
    updatedAt: entry.data()?.updatedAt || null,
  })));
  items.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  return { items: items.slice(0, PAGE_SIZE), nextCursor: null };
}

async function moderateContent({ admin, auth, data, mediaBucket }) {
  await prepareAdmin(admin, auth, { recent: true });
  const reason = cleanText(data?.reason, 'reason');
  const action = String(data?.action || '');
  if (!['hold', 'restore', 'delete'].includes(action)) fail('invalid-argument', 'Invalid moderation action.', 'invalid_action');
  const target = normalizeReportTarget(data?.target);
  if (!['recommendation', 'route', 'trip', 'comment'].includes(target.type)) {
    fail('invalid-argument', 'Target cannot be moderated here.', 'invalid_target');
  }
  if (action === 'restore') {
    const snapshot = await admin.firestore().doc(target.path).get();
    const ownerId = target.type === 'comment' ? snapshot.data()?.authorId : snapshot.data()?.ownerId;
    if (ownerId) {
      const owner = await admin.firestore().doc(`users/${ownerId}`).get();
      if (owner.data()?.moderation?.status === 'suspended') {
        fail('failed-precondition', 'Suspended-user content cannot be restored.', 'owner_suspended');
      }
    }
  }
  if (action === 'delete') {
    if (target.type === 'comment') {
      await deleteComment({
        admin,
        auth,
        data: { target: { type: target.parentType, id: target.parentId }, commentId: target.id },
      });
    } else {
      await deleteContentInternal({ admin, target, actorUid: auth.uid, isAdmin: true, mediaBucket });
    }
  } else {
    await admin.firestore().doc(target.path).update({
      status: action === 'restore' ? 'active' : 'moderation_hold',
      moderation: {
        lastAction: action,
        reason,
        actorUid: auth.uid,
        at: admin.firestore.FieldValue.serverTimestamp(),
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  if (target.type === 'comment') {
    const parentRef = admin.firestore().doc(`${target.path.split('/').slice(0, 2).join('/')}`);
    const activeComments = await parentRef.collection('comments').where('status', '==', 'active').count().get();
    await parentRef.update({
      'stats.commentCount': activeComments.data().count,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }).catch(() => {});
  }
  if (data?.caseId) {
    await admin.firestore().doc(`system/moderation/cases/${cleanText(data.caseId, 'caseId', 180)}`).set({
      status: action === 'restore' ? 'resolved_restored' : action === 'delete' ? 'resolved_deleted' : 'resolved_held',
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
  await prepareAdmin(admin, auth);
  if (data?.query) {
    const user = await resolveUser(admin, { identifier: data.query });
    return { items: [publicAdminUser(user)], nextCursor: null };
  }
  const result = await admin.auth().listUsers(PAGE_SIZE, data?.cursor || undefined);
  return { items: result.users.map(publicAdminUser), nextCursor: result.pageToken || null };
}

async function getAdminUser({ admin, auth, data }) {
  await prepareAdmin(admin, auth);
  const user = await resolveUser(admin, data);
  const profile = await admin.firestore().doc(`users/${user.uid}`).get();
  return serialize({ ...publicAdminUser(user), profile: profile.exists ? profile.data() : null });
}

async function hideUserContent({ admin, uid }) {
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
  await deleteQueryInBatches(db, () => db.collectionGroup('notifications').where('actorId', '==', uid));
  await db.doc(`publicProfiles/${uid}`).set({ status: 'suspended' }, { merge: true });
  return hidden;
}

async function setUserSuspension({ admin, auth, data }) {
  await prepareAdmin(admin, auth, { recent: true });
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
  const hidden = suspended ? await hideUserContent({ admin, uid: user.uid }) : 0;
  if (suspended) {
    await admin.firestore().doc(`publicProfiles/${user.uid}`).delete().catch(() => {});
  } else {
    const profile = await admin.firestore().doc(`users/${user.uid}`).get();
    if (profile.exists) await syncPublicProfile(admin, user.uid, profile.data());
  }
  await audit({ admin, auth, action: suspended ? 'user_suspended' : 'user_unsuspended', target: { uid: user.uid }, reason, metadata: { hidden } });
  return { uid: user.uid, suspended, hidden };
}

async function setUserEmailVerified({ admin, auth, data }) {
  await prepareAdmin(admin, auth, { recent: true });
  const user = await resolveUser(admin, data);
  if (user.uid === auth.uid) fail('failed-precondition', 'You cannot modify your own verification.', 'self_admin_action');
  const verified = data?.verified === true;
  await admin.auth().updateUser(user.uid, { emailVerified: verified });
  await admin.auth().revokeRefreshTokens(user.uid);
  const reason = cleanText(data?.reason, 'reason');
  await audit({ admin, auth, action: verified ? 'email_verified' : 'email_unverified', target: { uid: user.uid }, reason });
  return { uid: user.uid, verified };
}

async function setUserAdmin({ admin, auth, data }) {
  await prepareAdmin(admin, auth, { recent: true });
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
  await audit({ admin, auth, action: enabled ? 'admin_granted' : 'admin_removed', target: { uid: user.uid }, reason });
  return { uid: user.uid, admin: enabled };
}

async function deleteUserAsAdmin({ admin, auth, data, mediaBucket }) {
  await prepareAdmin(admin, auth, { recent: true });
  const user = await resolveUser(admin, data);
  if (user.uid === auth.uid) fail('failed-precondition', 'Use account settings to delete your own account.', 'self_admin_action');
  const reason = cleanText(data?.reason, 'reason');
  const db = admin.firestore();
  const deletionKey = crypto.createHash('sha256').update(`delete-user:${user.uid}`).digest('base64url');
  const jobRef = db.doc(`system/moderation/jobs/${deletionKey}`);
  await jobRef.set({ type: 'delete_user', uid: user.uid, status: 'running', step: 'content', createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  const ownedContent = await deleteOwnedContent({ admin, uid: user.uid, mediaBucket });
  await jobRef.set({ step: 'interactions', ownedContent, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  const interactions = await removeAuthoredInteractions({ admin, uid: user.uid });
  const reports = await db.collectionGroup('reports').where('reporterId', '==', user.uid).get();
  for (const entry of reports.docs) {
    const caseRef = entry.ref.parent.parent;
    await db.runTransaction(async (transaction) => {
      const caseSnapshot = caseRef ? await transaction.get(caseRef) : null;
      if (caseSnapshot?.exists) {
        const caseData = caseSnapshot.data() || {};
        const category = entry.data()?.category;
        transaction.update(caseRef, {
          reportCount: Math.max(0, Number(caseData.reportCount || 0) - 1),
          uniqueCount24h: Math.max(0, Number(caseData.uniqueCount24h || 0) - (caseData.recentReporters?.[user.uid] ? 1 : 0)),
          [`recentReporters.${user.uid}`]: admin.firestore.FieldValue.delete(),
          ...(category ? { [`categoryCounts.${category}`]: Math.max(0, Number(caseData.categoryCounts?.[category] || 0) - 1) } : {}),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      transaction.delete(entry.ref);
    });
  }
  const userRef = db.doc(`users/${user.uid}`);
  if (typeof db.recursiveDelete === 'function') await db.recursiveDelete(userRef);
  else {
    await Promise.all([
      deleteQueryInBatches(db, () => userRef.collection('favorites')),
      deleteQueryInBatches(db, () => userRef.collection('notifications')),
      deleteQueryInBatches(db, () => userRef.collection('blockedUsers')),
      deleteQueryInBatches(db, () => userRef.collection('serverState')),
    ]);
    await userRef.delete().catch(() => {});
  }
  await db.doc(`publicProfiles/${user.uid}`).delete().catch(() => {});
  if (mediaBucket) {
    const bucket = admin.storage().bucket(mediaBucket);
    await Promise.all([
      bucket.deleteFiles({ prefix: `media/${user.uid}/`, force: true }),
      bucket.deleteFiles({ prefix: `media-staging/${user.uid}/`, force: true }),
    ]);
  }
  await admin.auth().deleteUser(user.uid);
  await audit({ admin, auth, action: 'user_deleted', target: { uid: 'deleted-user' }, reason, metadata: { ownedContent, interactions, purgedReports: reports.size } });
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
  await prepareAdmin(admin, auth);
  let query = admin.firestore().collection('system/moderation/audit').orderBy('createdAt', 'desc').limit(PAGE_SIZE);
  if (data?.cursor) {
    const cursor = await admin.firestore().doc(`system/moderation/audit/${cleanText(data.cursor, 'cursor', 180)}`).get();
    if (cursor.exists) query = query.startAfter(cursor);
  }
  const snapshot = await query.get();
  return { items: snapshot.docs.map((entry) => serialize({ id: entry.id, ...entry.data() })), nextCursor: snapshot.size === PAGE_SIZE ? snapshot.docs[snapshot.docs.length - 1].id : null };
}

module.exports = {
  audit,
  assertAdmin,
  assertRecentAuth,
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
  setUserAdmin,
  setUserEmailVerified,
  setUserSuspension,
};
