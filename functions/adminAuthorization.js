const { HttpsError } = require('firebase-functions/v2/https');

const RECENT_ADMIN_AUTH_SECONDS = 10 * 60;

function authorizationError(code, message, reason) {
  return new HttpsError(code, message, { reason });
}

function assertRecentTotpAdminAuthentication(auth, nowMs = Date.now()) {
  const authTime = Number(auth?.token?.auth_time || 0);
  if (!authTime || nowMs / 1000 - authTime > RECENT_ADMIN_AUTH_SECONDS) {
    throw authorizationError(
      'failed-precondition',
      'Recent sign-in is required.',
      'recent_sign_in_required'
    );
  }
  if (auth?.token?.firebase?.sign_in_second_factor !== 'totp') {
    throw authorizationError(
      'failed-precondition',
      'TOTP multi-factor authentication is required.',
      'totp_required'
    );
  }
}

async function hasActiveAdminAccess({ admin, auth, requireRecentTotp = false, nowMs }) {
  if (!auth?.uid || auth.token?.admin !== true) return false;
  const registry = await admin.firestore().doc(`system/moderation/admins/${auth.uid}`).get();
  const active = registry.exists && registry.data()?.active === true;
  if (active && requireRecentTotp) assertRecentTotpAdminAuthentication(auth, nowMs);
  return active;
}

async function deactivateAdminRegistryInTransaction({
  admin,
  transaction,
  uid,
  actorUid = null,
  requireActiveActor = false,
  rejectActiveTarget = false,
}) {
  const db = admin.firestore();
  const activeQuery = db.collection('system/moderation/admins').where('active', '==', true);
  const activeSnapshot = await transaction.get(activeQuery);
  const activeIds = new Set(activeSnapshot.docs.map((entry) => entry.id));

  if (requireActiveActor && (!actorUid || !activeIds.has(actorUid))) {
    throw authorizationError('permission-denied', 'Admin access is required.', 'admin_required');
  }

  const targetWasActive = activeIds.has(uid);
  if (!targetWasActive) return { targetWasActive: false, activeCount: activeSnapshot.size };
  if (rejectActiveTarget) {
    throw authorizationError(
      'failed-precondition',
      'Admin access must be removed before deleting this account.',
      'admin_access_active'
    );
  }
  if (activeSnapshot.size <= 1) {
    throw authorizationError(
      'failed-precondition',
      'The last admin cannot be removed.',
      'last_admin'
    );
  }

  transaction.set(db.doc(`system/moderation/admins/${uid}`), {
    active: false,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  return { targetWasActive: true, activeCount: activeSnapshot.size };
}

async function activateAdminRegistry({ admin, uid, actorUid }) {
  const db = admin.firestore();
  const userRef = db.doc(`users/${uid}`);
  const registryRef = db.doc(`system/moderation/admins/${uid}`);
  return db.runTransaction(async (transaction) => {
    const activeQuery = db.collection('system/moderation/admins').where('active', '==', true);
    const [userSnapshot, activeSnapshot] = await Promise.all([
      transaction.get(userRef),
      transaction.get(activeQuery),
    ]);
    const activeIds = new Set(activeSnapshot.docs.map((entry) => entry.id));
    if (!actorUid || !activeIds.has(actorUid)) {
      throw authorizationError('permission-denied', 'Admin access is required.', 'admin_required');
    }
    const user = userSnapshot.exists ? userSnapshot.data() || {} : null;
    if (!user || user.status === 'deleting' || user.moderation?.status === 'deleting') {
      throw authorizationError(
        'failed-precondition',
        'Admin access cannot be granted while account deletion is in progress.',
        'user_deleting'
      );
    }
    transaction.set(registryRef, {
      uid,
      active: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return { activeCount: activeSnapshot.size + (activeIds.has(uid) ? 0 : 1) };
  });
}

async function deactivateAdminRegistry({ admin, uid, actorUid, requireActiveActor = true }) {
  return admin.firestore().runTransaction((transaction) => (
    deactivateAdminRegistryInTransaction({
      admin,
      transaction,
      uid,
      actorUid,
      requireActiveActor,
    })
  ));
}

module.exports = {
  RECENT_ADMIN_AUTH_SECONDS,
  activateAdminRegistry,
  assertRecentTotpAdminAuthentication,
  deactivateAdminRegistry,
  deactivateAdminRegistryInTransaction,
  hasActiveAdminAccess,
};
