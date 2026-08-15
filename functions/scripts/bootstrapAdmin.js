/* eslint-disable no-console */
const admin = require('firebase-admin');
const { initializeAdmin } = require('./localCredentials');

function initAdmin() {
  initializeAdmin(admin);
}

async function main() {
  const identifier = process.argv[2];
  if (!identifier) {
    console.error('Usage: node scripts/bootstrapAdmin.js <uid|email>');
    process.exit(1);
  }

  initAdmin();

  const isEmail = identifier.includes('@');
  const user = isEmail
    ? await admin.auth().getUserByEmail(identifier)
    : await admin.auth().getUser(identifier);

  const existing = user.customClaims || {};
  const nextClaims = { ...existing, admin: true };

  await admin.auth().setCustomUserClaims(user.uid, nextClaims);
  await admin.firestore().doc(`system/moderation/admins/${user.uid}`).set({
    uid: user.uid,
    active: true,
    bootstrappedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  console.log(`✅ Admin claim set for uid=${user.uid}`);
  console.log('User must sign out/in (or refresh token) to pick up the claim.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
