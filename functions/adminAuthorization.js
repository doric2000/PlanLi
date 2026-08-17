async function hasActiveAdminAccess({ admin, auth }) {
  if (!auth?.uid || auth.token?.admin !== true) return false;
  const registry = await admin.firestore().doc(`system/moderation/admins/${auth.uid}`).get();
  return registry.exists && registry.data()?.active === true;
}

module.exports = { hasActiveAdminAccess };
