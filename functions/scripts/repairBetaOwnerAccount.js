/* eslint-disable no-console */
const crypto = require('crypto');
const admin = require('firebase-admin');

const {
  PRIVACY_VERSION,
  PROFILE_DETAILS_VERSION,
  TERMS_VERSION,
} = require('../authPolicy');
const { initializeAdmin } = require('./localCredentials');

const CONFIRMATION = 'REPAIR_BETA_OWNER_ACCOUNT';

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : null;
}

function parseArgs(argv) {
  return {
    apply: argv.includes('--apply'),
    confirmation: valueAfter(argv, '--confirm'),
    expectedFingerprint: valueAfter(argv, '--fingerprint'),
    email: String(valueAfter(argv, '--email') || '').trim().toLowerCase(),
  };
}

function fingerprintScope(manifest) {
  return {
    projectId: manifest.projectId,
    uid: manifest.uid,
    email: manifest.email,
    auth: manifest.auth,
    userDocument: manifest.userDocument,
    target: manifest.target,
  };
}

function manifestFingerprint(manifest) {
  return crypto.createHash('sha256')
    .update(JSON.stringify(fingerprintScope(manifest)))
    .digest('hex');
}

async function buildManifest(adminApi, email) {
  if (!email || !email.includes('@')) throw new Error('Pass the exact owner email with --email.');
  const authUser = await adminApi.auth().getUserByEmail(email);
  const db = adminApi.firestore();
  const [userDocument, adminRegistry] = await Promise.all([
    db.doc(`users/${authUser.uid}`).get(),
    db.doc(`system/moderation/admins/${authUser.uid}`).get(),
  ]);
  if (!userDocument.exists) throw new Error('The owner private profile does not exist.');
  if (authUser.customClaims?.admin !== true || adminRegistry.data()?.active !== true) {
    throw new Error('The repair target is not the active beta owner admin.');
  }
  const data = userDocument.data() || {};
  const displayName = String(data.displayName || '').trim();
  if (displayName.length < 2) throw new Error('The owner profile has no valid display name.');
  if (data.smartProfile?.setupRequired !== false || !data.smartProfile?.completedAt) {
    throw new Error('The owner preference wizard is not complete.');
  }
  return {
    projectId: adminApi.app().options.projectId,
    uid: authUser.uid,
    email,
    auth: {
      emailVerified: Boolean(authUser.emailVerified),
      tokensValidAfterTime: authUser.tokensValidAfterTime || null,
      adminClaim: true,
    },
    userDocument: {
      updateTime: userDocument.updateTime?.toDate?.().toISOString() || null,
      displayName,
      profileDetailsVersion: data.onboarding?.profileDetailsVersion || null,
      profileDetailsCompleted: Boolean(data.onboarding?.profileDetailsCompletedAt),
      termsVersion: data.legal?.termsVersion || null,
      privacyVersion: data.legal?.privacyVersion || null,
      legalAccepted: Boolean(data.legal?.acceptedAt),
      preferencesComplete: true,
      moderationStatus: data.moderation?.status || null,
    },
    target: {
      emailVerified: true,
      profileDetailsVersion: PROFILE_DETAILS_VERSION,
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
    },
  };
}

async function run({ adminApi = admin, options }) {
  const manifest = await buildManifest(adminApi, options.email);
  const fingerprint = manifestFingerprint(manifest);
  const summary = {
    mode: options.apply ? 'apply' : 'dry-run',
    ...manifest,
    fingerprint,
  };
  if (!options.apply) return summary;
  if (options.confirmation !== CONFIRMATION) {
    throw new Error(`Apply requires --confirm ${CONFIRMATION}.`);
  }
  if (!options.expectedFingerprint || options.expectedFingerprint !== fingerprint) {
    throw new Error('Apply fingerprint does not match the current owner account. Run dry-run again.');
  }

  const db = adminApi.firestore();
  const timestamp = adminApi.firestore.FieldValue.serverTimestamp();
  await adminApi.auth().updateUser(manifest.uid, { emailVerified: true });
  await adminApi.auth().revokeRefreshTokens(manifest.uid);
  await db.doc(`users/${manifest.uid}`).set({
    onboarding: {
      profileDetailsVersion: PROFILE_DETAILS_VERSION,
      profileDetailsCompletedAt: timestamp,
    },
    legal: {
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
      acceptedAt: timestamp,
    },
    updatedAt: timestamp,
  }, { merge: true });
  return {
    ...summary,
    repaired: true,
    tokenRefreshRequired: true,
  };
}

async function main() {
  initializeAdmin(admin, { projectId: 'planli-f0b12' });
  const result = await run({ options: parseArgs(process.argv.slice(2)) });
  console.log(JSON.stringify(result, null, 2));
  if (result.mode === 'dry-run') {
    console.log(`No data changed. Apply requires --apply --confirm ${CONFIRMATION} --fingerprint <value>.`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}

module.exports = {
  CONFIRMATION,
  fingerprintScope,
  manifestFingerprint,
  parseArgs,
  run,
};
