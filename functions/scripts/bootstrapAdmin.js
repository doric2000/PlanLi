/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

function initAdmin() {
  // Prefer env var GOOGLE_APPLICATION_CREDENTIALS, fallback to a local file for convenience.
  const keyPath = path.join(__dirname, '..', 'serviceAccountKey.json');

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
    return;
  }

  if (fs.existsSync(keyPath)) {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    const serviceAccount = require(keyPath);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    return;
  }

  throw new Error(
    'Missing credentials. Set GOOGLE_APPLICATION_CREDENTIALS to a service-account JSON path, or place functions/serviceAccountKey.json'
  );
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
  console.log(`✅ Admin claim set for uid=${user.uid}`);
  console.log('User must sign out/in (or refresh token) to pick up the claim.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
