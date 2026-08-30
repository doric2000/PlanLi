/* eslint-disable no-await-in-loop, no-console */
const crypto = require('crypto');
const admin = require('firebase-admin');

const { deleteAccountInternal } = require('../deletionService');
const { initializeAdmin } = require('./localCredentials');
const { ACTIVE_MEDIA_BUCKET, assertActiveMediaBucket } = require('./storageTargetPolicy');

const CONFIRMATION = 'DELETE_NON_ADMIN_USERS';
const DEFAULT_MEDIA_BUCKET = ACTIVE_MEDIA_BUCKET;

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : null;
}

function parseArgs(argv) {
  const keepEmail = String(valueAfter(argv, '--keep-email') || '').trim().toLowerCase();
  if (!keepEmail) throw new Error('--keep-email is required.');
  return {
    apply: argv.includes('--apply'),
    confirmation: valueAfter(argv, '--confirm'),
    expectedFingerprint: valueAfter(argv, '--fingerprint'),
    keepEmail,
    mediaBucket: assertActiveMediaBucket(
      valueAfter(argv, '--media-bucket') || DEFAULT_MEDIA_BUCKET
    ),
  };
}

async function listAllAuthUsers(authApi) {
  const users = [];
  let pageToken;
  do {
    const page = await authApi.listUsers(1000, pageToken);
    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
}

function fingerprintScope(manifest) {
  return {
    projectId: manifest.projectId,
    keep: manifest.keep,
    delete: manifest.delete,
  };
}

function manifestFingerprint(manifest) {
  return crypto.createHash('sha256')
    .update(JSON.stringify(fingerprintScope(manifest)))
    .digest('hex');
}

function documentEntry(document) {
  return {
    path: document.ref.path,
    updateTime: document.updateTime?.toDate?.().toISOString() || null,
  };
}

async function buildManifest(adminApi, keepEmail) {
  const db = adminApi.firestore();
  const [authUsers, users, profiles, adminRegistry] = await Promise.all([
    listAllAuthUsers(adminApi.auth()),
    db.collection('users').get(),
    db.collection('publicProfiles').get(),
    db.collection('system/moderation/admins').get(),
  ]);
  const matching = authUsers.filter(
    (user) => String(user.email || '').trim().toLowerCase() === keepEmail
  );
  if (matching.length !== 1) {
    throw new Error(`Expected exactly one Firebase Auth user for ${keepEmail}; found ${matching.length}.`);
  }
  const keeper = matching[0];
  const registry = adminRegistry.docs.find((entry) => entry.id === keeper.uid);
  if (keeper.customClaims?.admin !== true || registry?.data()?.active !== true) {
    throw new Error('The retained account must have both the admin claim and an active admin registry entry.');
  }
  const authEntries = authUsers
    .filter((user) => user.uid !== keeper.uid)
    .map((user) => ({
      uid: user.uid,
      disabled: Boolean(user.disabled),
      emailVerified: Boolean(user.emailVerified),
      providers: (user.providerData || []).map((provider) => provider.providerId).sort(),
      adminClaim: user.customClaims?.admin === true,
      tokensValidAfterTime: user.tokensValidAfterTime || null,
    }))
    .sort((left, right) => left.uid.localeCompare(right.uid));
  return {
    projectId: adminApi.app().options.projectId,
    keep: {
      uid: keeper.uid,
      email: keepEmail,
      emailVerified: Boolean(keeper.emailVerified),
      adminClaim: true,
      registryActive: true,
    },
    delete: {
      authUsers: authEntries,
      userDocuments: users.docs.filter((entry) => entry.id !== keeper.uid).map(documentEntry)
        .sort((left, right) => left.path.localeCompare(right.path)),
      publicProfiles: profiles.docs.filter((entry) => entry.id !== keeper.uid).map(documentEntry)
        .sort((left, right) => left.path.localeCompare(right.path)),
      adminRegistry: adminRegistry.docs.filter((entry) => entry.id !== keeper.uid).map(documentEntry)
        .sort((left, right) => left.path.localeCompare(right.path)),
    },
  };
}

function assertSafeManifest(manifest) {
  const appleUsers = manifest.delete.authUsers.filter((entry) => entry.providers.includes('apple.com'));
  if (appleUsers.length) {
    throw new Error(`Refusing maintenance deletion for ${appleUsers.length} Apple-linked account(s).`);
  }
  if (!manifest.keep.adminClaim || !manifest.keep.registryActive) {
    throw new Error('The retained account is not an active admin.');
  }
}

async function deleteEmptyModerationCases(db) {
  const cases = await db.collection('system/moderation/cases').get();
  let deleted = 0;
  for (const entry of cases.docs) {
    const reports = await entry.ref.collection('reports').limit(1).get();
    if (!reports.empty) continue;
    await db.recursiveDelete(entry.ref);
    deleted += 1;
  }
  return deleted;
}

async function recursiveDeleteEntries(db, entries) {
  for (const entry of entries) await db.recursiveDelete(db.doc(entry.path));
}

async function deleteBlockedUserReferences(db, deletedUids) {
  const deleted = new Set(deletedUids);
  const snapshot = await db.collectionGroup('blockedUsers').get();
  const references = snapshot.docs.filter((entry) => deleted.has(entry.data()?.blockedUid));
  for (let offset = 0; offset < references.length; offset += 400) {
    const batch = db.batch();
    references.slice(offset, offset + 400).forEach((entry) => batch.delete(entry.ref));
    await batch.commit();
  }
  return references.length;
}

async function run({ adminApi = admin, options }) {
  const manifest = await buildManifest(adminApi, options.keepEmail);
  assertSafeManifest(manifest);
  const fingerprint = manifestFingerprint(manifest);
  const summary = {
    mode: options.apply ? 'apply' : 'dry-run',
    keep: manifest.keep,
    delete: {
      authUsers: manifest.delete.authUsers,
      userDocuments: manifest.delete.userDocuments.length,
      publicProfiles: manifest.delete.publicProfiles.length,
      adminRegistry: manifest.delete.adminRegistry.length,
    },
    fingerprint,
  };
  if (!options.apply) return summary;
  if (options.confirmation !== CONFIRMATION) {
    throw new Error(`Apply requires --confirm ${CONFIRMATION}.`);
  }
  if (!options.expectedFingerprint || options.expectedFingerprint !== fingerprint) {
    throw new Error('Apply fingerprint does not match the current account snapshot. Run dry-run again.');
  }

  for (const entry of manifest.delete.authUsers) {
    await deleteAccountInternal({
      admin: adminApi,
      uid: entry.uid,
      mediaBucket: options.mediaBucket,
    });
  }
  const db = adminApi.firestore();
  await recursiveDeleteEntries(db, manifest.delete.userDocuments);
  await recursiveDeleteEntries(db, manifest.delete.publicProfiles);
  await recursiveDeleteEntries(db, manifest.delete.adminRegistry);
  const deletedBlockedUserReferences = await deleteBlockedUserReferences(
    db,
    manifest.delete.authUsers.map((entry) => entry.uid)
  );
  const deletedEmptyModerationCases = await deleteEmptyModerationCases(db);

  const verification = await buildManifest(adminApi, options.keepEmail);
  const remaining = verification.delete;
  if (remaining.authUsers.length || remaining.userDocuments.length ||
      remaining.publicProfiles.length || remaining.adminRegistry.length) {
    throw new Error('Non-admin account deletion did not finish; run a new dry-run before retrying.');
  }
  return {
    ...summary,
    deletedAuthUsers: manifest.delete.authUsers.length,
    deletedBlockedUserReferences,
    deletedEmptyModerationCases,
    remainingAuthUsers: 1,
  };
}

async function main() {
  initializeAdmin(admin, { projectId: 'planli-f0b12', storageBucket: DEFAULT_MEDIA_BUCKET });
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
  assertSafeManifest,
  deleteBlockedUserReferences,
  fingerprintScope,
  manifestFingerprint,
  parseArgs,
  run,
};
