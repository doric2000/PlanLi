/* eslint-disable no-console */
const admin = require('firebase-admin');
const { initializeAdmin } = require('./localCredentials');

function initAdmin() {
  initializeAdmin(admin);
}

function parseArgs(argv) {
  return {
    identifier: argv.find((value) => !value.startsWith('--')) || null,
    apply: argv.includes('--apply'),
  };
}

async function bootstrapAdmin({ adminApi, identifier, apply }) {
  if (!identifier) {
    throw new Error('Usage: node scripts/bootstrapAdmin.js <uid|email> [--apply]');
  }
  const isEmail = identifier.includes('@');
  const user = isEmail
    ? await adminApi.auth().getUserByEmail(identifier)
    : await adminApi.auth().getUser(identifier);

  const existing = user.customClaims || {};
  const nextClaims = { ...existing, admin: true };
  if (apply) {
    await adminApi.auth().setCustomUserClaims(user.uid, nextClaims);
    await adminApi.firestore().doc(`system/moderation/admins/${user.uid}`).set({
      uid: user.uid,
      active: true,
      bootstrappedAt: adminApi.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  return {
    mode: apply ? 'apply' : 'dry-run',
    uid: user.uid,
    adminClaim: true,
    registryActive: true,
    tokenRefreshRequired: apply,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  initAdmin();
  const result = await bootstrapAdmin({ adminApi: admin, ...options });
  console.log(JSON.stringify(result, null, 2));
  if (!options.apply) console.log('No data changed. Re-run with --apply after reviewing the UID.');
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { bootstrapAdmin, parseArgs };
