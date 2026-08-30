/* eslint-disable no-console */
const crypto = require('node:crypto');
const admin = require('firebase-admin');
const { initializeAdmin } = require('./localCredentials');

const PRODUCTION_PROJECT_ID = 'planli-f0b12';

function fail(message) {
  const error = new Error(message);
  error.code = 'SET_EMAIL_VERIFIED_PREFLIGHT_FAILED';
  throw error;
}

function parseBoolean(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  fail('--verified must be exactly true or false.');
}

function parseArgs(argv) {
  const options = {
    apply: false,
    confirmProduction: '',
    identifier: '',
    manifestHash: '',
    projectId: '',
    verified: undefined,
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
    } else if (value === '--verified') {
      options.verified = parseBoolean(String(argv[index + 1] || '').trim());
      index += 1;
    } else fail(`Unknown argument: ${value}`);
  }
  if (!options.projectId) fail('--project is required.');
  if (!options.identifier) fail('--identifier is required.');
  if (typeof options.verified !== 'boolean') fail('--verified is required and has no default.');
  return options;
}

function canonicalManifest({ projectId, user, emailVerified }) {
  return {
    action: 'set_email_verified',
    projectId,
    uid: user.uid,
    email: user.email || null,
    before: user.emailVerified === true,
    after: emailVerified,
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
  const user = options.identifier.includes('@')
    ? await auth.getUserByEmail(options.identifier)
    : await auth.getUser(options.identifier);
  const manifest = canonicalManifest({
    projectId: options.projectId,
    user,
    emailVerified: options.verified,
  });
  const hash = manifestHash(manifest);
  assertApplyAuthority(options, hash);
  if (options.apply && manifest.before !== manifest.after) {
    await auth.updateUser(user.uid, { emailVerified: manifest.after });
  }
  return { applied: options.apply, changed: manifest.before !== manifest.after, hash, manifest };
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
    console.error(`setEmailVerified failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  assertApplyAuthority,
  canonicalManifest,
  manifestHash,
  parseArgs,
  run,
};
