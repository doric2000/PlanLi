/* eslint-disable no-console */
const crypto = require('node:crypto');
const admin = require('firebase-admin');

const {
  destinationAcceptsNewReferences,
  heldForPendingDestination,
  releaseDestinationPendingContent,
} = require('../destinationAdminService');
const { initializeAdmin } = require('./localCredentials');

const PROJECT_ID = 'planli-f0b12';
const CONTENT_PATH_PATTERN = /^(recommendations|routes|trips)\/[^/]+$/;

function fail(message) {
  throw new Error(message);
}

function parseOptions(argv = process.argv.slice(2)) {
  const options = {
    apply: false,
    countryId: '',
    cityId: '',
    expectedContentPath: '',
    fingerprint: '',
    confirmProject: '',
  };
  const valueFlags = new Map([
    ['--country', 'countryId'],
    ['--city', 'cityId'],
    ['--expected-content', 'expectedContentPath'],
    ['--fingerprint', 'fingerprint'],
    ['--confirm-project', 'confirmProject'],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--apply') {
      options.apply = true;
      continue;
    }
    const inline = [...valueFlags.keys()].find((flag) => argument.startsWith(`${flag}=`));
    const flag = inline || argument;
    const field = valueFlags.get(flag);
    if (!field) fail(`Unknown argument: ${argument}`);
    const value = String(inline ? argument.slice(flag.length + 1) : argv[++index] || '').trim();
    if (!value) fail(`${flag} requires a value.`);
    options[field] = value;
  }
  const invalidId = (value) => !value || value.length > 180 || value.includes('/');
  if (invalidId(options.countryId)) fail('--country must be a Firestore document ID.');
  if (invalidId(options.cityId)) fail('--city must be a Firestore document ID.');
  if (!CONTENT_PATH_PATTERN.test(options.expectedContentPath)) {
    fail('--expected-content must be one recommendations/{id}, routes/{id}, or trips/{id} path.');
  }
  return options;
}

function timestampMillis(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function snapshotVersion(snapshot) {
  return snapshot?.exists ? timestampMillis(snapshot.updateTime) : 0;
}

function candidateRecord(snapshot) {
  const data = snapshot.data() || {};
  return {
    path: snapshot.ref.path,
    version: snapshotVersion(snapshot),
    status: data.status || null,
    holdReason: data.moderation?.holdReason || null,
    systemGate: data.moderation?.systemGate || null,
  };
}

function buildManifest({ options, countrySnapshot, destinationSnapshot, candidates }) {
  const country = countrySnapshot.data() || {};
  const destination = destinationSnapshot.data() || {};
  return {
    version: 1,
    projectId: PROJECT_ID,
    destination: {
      countryId: options.countryId,
      cityId: options.cityId,
      countryExists: countrySnapshot.exists === true,
      countryStatus: country.status || null,
      destinationExists: destinationSnapshot.exists === true,
      destinationStatus: destination.status || null,
      destinationVersion: snapshotVersion(destinationSnapshot),
      approved: destination.canonicalPolicy?.approved === true,
      approvalRevision: destination.canonicalPolicy?.approvalRevision || null,
    },
    expectedContentPath: options.expectedContentPath,
    candidates: candidates.map(candidateRecord).sort((left, right) => left.path.localeCompare(right.path)),
  };
}

function manifestFingerprint(manifest) {
  return crypto.createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
}

function assertApplyAllowed({ options, manifest, fingerprint }) {
  if (options.confirmProject !== PROJECT_ID) {
    fail(`Apply refused. Pass --confirm-project=${PROJECT_ID}.`);
  }
  if (!/^[0-9a-f]{64}$/.test(options.fingerprint) || options.fingerprint !== fingerprint) {
    fail('Apply refused. The dry-run fingerprint is missing or no longer matches.');
  }
  if (!manifest.candidates.some((candidate) => candidate.path === options.expectedContentPath)) {
    fail('Apply refused. The expected content is not currently an eligible destination-review hold.');
  }
}

async function loadCandidates(db, countryId, cityId) {
  const key = `${countryId}:${cityId}`;
  const [recommendations, trips, routes] = await Promise.all([
    db.collection('recommendations').where('destination.cityId', '==', cityId).get(),
    db.collection('trips').where('destination.cityId', '==', cityId).get(),
    db.collection('routes').where('destinationKeys', 'array-contains', key).get(),
  ]);
  return [...recommendations.docs, ...trips.docs, ...routes.docs]
    .filter((snapshot) => heldForPendingDestination(snapshot.data() || {}, countryId, cityId));
}

async function runDestinationApprovalRepair({
  db,
  adminImpl = admin,
  options,
  releaseImpl = releaseDestinationPendingContent,
}) {
  const [countrySnapshot, destinationSnapshot, candidates] = await Promise.all([
    db.doc(`countries/${options.countryId}`).get(),
    db.doc(`countries/${options.countryId}/destinations/${options.cityId}`).get(),
    loadCandidates(db, options.countryId, options.cityId),
  ]);
  const manifest = buildManifest({ options, countrySnapshot, destinationSnapshot, candidates });
  const fingerprint = manifestFingerprint(manifest);
  const report = {
    mode: options.apply ? 'apply' : 'dry-run',
    projectId: PROJECT_ID,
    countryId: options.countryId,
    cityId: options.cityId,
    eligibleContent: manifest.candidates.length,
    expectedContentEligible: manifest.candidates.some(({ path }) => path === options.expectedContentPath),
    destinationActive: countrySnapshot.data()?.status === 'active' &&
      destinationAcceptsNewReferences(destinationSnapshot.data() || {}, options.countryId),
    fingerprint,
  };
  if (!options.apply) return report;

  assertApplyAllowed({ options, manifest, fingerprint });
  const release = await releaseImpl({
    admin: adminImpl,
    countryId: options.countryId,
    cityId: options.cityId,
  });
  const verification = await db.doc(options.expectedContentPath).get();
  if (!verification.exists || verification.data()?.status !== 'active' ||
      verification.data()?.moderation?.systemGate === 'destination_pending_approval') {
    fail('Post-apply verification did not confirm that the expected content is active.');
  }
  return { ...report, applied: true, release, verified: true };
}

async function main() {
  const options = parseOptions();
  initializeAdmin(admin, { projectId: PROJECT_ID });
  if (admin.app().options.projectId !== PROJECT_ID) fail(`Active Firebase project must be ${PROJECT_ID}.`);
  const result = await runDestinationApprovalRepair({ db: admin.firestore(), options });
  console.log(JSON.stringify(result, null, 2));
  if (!options.apply) {
    console.log(`DRY RUN ONLY. Apply requires --apply --confirm-project=${PROJECT_ID} --fingerprint=${result.fingerprint}`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  }).finally(() => admin.apps.length ? admin.app().delete() : undefined);
}

module.exports = {
  assertApplyAllowed,
  buildManifest,
  manifestFingerprint,
  parseOptions,
  runDestinationApprovalRepair,
};
