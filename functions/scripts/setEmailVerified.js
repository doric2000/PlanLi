/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

function initAdmin() {
  const keyPath = path.join(__dirname, '..', 'serviceAccountKey.json');

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
    return;
  }

  if (fs.existsSync(keyPath)) {
    // eslint-disable-next-line global-require
    const serviceAccount = require(keyPath);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    return;
  }

  throw new Error(
    'Missing credentials. Set GOOGLE_APPLICATION_CREDENTIALS or place functions/serviceAccountKey.json'
  );
}

function normalizeBoolean(value, defaultValue) {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return defaultValue;
}

async function main() {
  const identifier = process.argv[2];
  const verifiedArg = process.argv[3];

  if (!identifier) {
    console.error('Usage: node scripts/setEmailVerified.js <uid|email> [true|false]');
    process.exit(1);
  }

  const emailVerified = normalizeBoolean(verifiedArg, true);

  initAdmin();

  const isEmail = identifier.includes('@');
  const user = isEmail
    ? await admin.auth().getUserByEmail(identifier)
    : await admin.auth().getUser(identifier);

  await admin.auth().updateUser(user.uid, { emailVerified });

  console.log(`✅ Set emailVerified=${emailVerified} for uid=${user.uid} (${user.email || 'no-email'})`);
  console.log('User must sign out/in (or refresh token) to pick up email_verified in the ID token.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
