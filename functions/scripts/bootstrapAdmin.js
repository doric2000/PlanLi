/* eslint-disable no-console */
const crypto = require('node:crypto');
const admin = require('firebase-admin');
const { initializeAdmin } = require('./localCredentials');

const PRODUCTION_PROJECT_ID = 'planli-f0b12';

function fail(message) {
  const error = new Error(message);
  error.code = 'BOOTSTRAP_ADMIN_PREFLIGHT_FAILED';
  throw error;
}

function parseArgs(argv) {
  const options = {
    apply: false,
    confirmProduction: '',
    identifier: '',
    manifestHash: '',
    projectId: '',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--apply') options.apply = true;
    else if (['--confirm-production', '--identifier', '--manifest-hash', '--project'].includes(value)) {
      const next = String(argv[index + 1] || '').trim();
      if (!next) fail(`${value} requires a value.`);
      index += 1;
      if (value === '--confirm-production') options.confirmProduction = next;
      if (value === '--identifier') options.identifier = next;
      if (value === '--manifest-hash') options.manifestHash = next.toLowerCase();
      if (value === '--project') options.projectId = next;
    } else fail(`Unknown argument: ${value}`);
  }
  if (!options.projectId) fail('--project is required.');
  if (!options.identifier) fail('--identifier is required.');
  return options;
}

function enrolledTotpFactors(user) {
  const factors = user?.multiFactor?.enrolledFactors;
  if (!Array.isArray(factors)) return [];
  return factors.filter((factor) => factor?.factorId === 'totp');
}

function assertEligibleUser(user) {
  if (user.disabled === true) fail('The target user is disabled.');
  if (user.emailVerified !== true) fail('The target user must have a verified email.');
  if (enrolledTotpFactors(user).length === 0) {
    fail('The target user must enroll a TOTP second factor before receiving admin access.');
  }
}

function canonicalManifest({ projectId, user, registry }) {
  const existingClaims = Object.fromEntries(
    Object.entries(user.customClaims || {}).sort(([left], [right]) => left.localeCompare(right))
  );
  return {
    action: 'bootstrap_admin',
    projectId,
    uid: user.uid,
    email: user.email || null,
    prerequisites: {
      disabled: user.disabled === true,
      emailVerified: user.emailVerified === true,
      totpFactors: enrolledTotpFactors(user).length,
    },
    before: {
      claims: existingClaims,
      registryActive: registry?.active === true,
    },
    after: {
      claims: { ...existingClaims, admin: true },
      registryActive: true,
    },
  };
}

function manifestHash(manifest) {
  return crypto.createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
}

function assertApplyAuthority(options, expectedHash) {
  if (!options.apply) return;
  if (!/^[0-9a-f]{64}$/.test(options.manifestHash) || options.manifestHash !== expectedHash) {
    fail('Apply requires --manifest-hash matching the current dry-run manifest.');
  }
  if (
    options.projectId === PRODUCTION_PROJECT_ID
    && options.confirmProduction !== PRODUCTION_PROJECT_ID
  ) {
    fail(`Production apply requires --confirm-production ${PRODUCTION_PROJECT_ID}.`);
  }
}

async function run(options, adminSdk = admin) {
  initializeAdmin(adminSdk, { projectId: options.projectId });
  const auth = adminSdk.auth();
  const firestore = adminSdk.firestore();
  const user = options.identifier.includes('@')
    ? await auth.getUserByEmail(options.identifier)
    : await auth.getUser(options.identifier);
  assertEligibleUser(user);

  const registryRef = firestore.doc(`system/moderation/admins/${user.uid}`);
  const registrySnapshot = await registryRef.get();
  const manifest = canonicalManifest({
    projectId: options.projectId,
    user,
    registry: registrySnapshot.exists ? registrySnapshot.data() : null,
  });
  const hash = manifestHash(manifest);
  assertApplyAuthority(options, hash);

  if (options.apply) {
    await registryRef.set({
      uid: user.uid,
      active: true,
      bootstrappedAt: adminSdk.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    await auth.setCustomUserClaims(user.uid, manifest.after.claims);

    const [updatedUser, updatedRegistry] = await Promise.all([
      auth.getUser(user.uid),
      registryRef.get(),
    ]);
    if (
      updatedUser.customClaims?.admin !== true
      || !updatedRegistry.exists
      || updatedRegistry.data()?.active !== true
    ) {
      fail('Post-apply read-back did not confirm both the admin claim and active registry.');
    }
  }

  return {
    applied: options.apply,
    changed: manifest.before.claims.admin !== true || manifest.before.registryActive !== true,
    hash,
    manifest,
    tokenRefreshRequired: options.apply,
  };
}

async function main() {
  const result = await run(parseArgs(process.argv.slice(2)));
  console.log(JSON.stringify(result, null, 2));
  if (!result.applied) {
    console.log(`DRY RUN ONLY. Re-run with --apply --manifest-hash ${result.hash}`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`bootstrapAdmin failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  assertApplyAuthority,
  assertEligibleUser,
  canonicalManifest,
  manifestHash,
  parseArgs,
  run,
};
