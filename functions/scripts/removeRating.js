/* eslint-disable no-await-in-loop, no-console */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const { initializeAdmin } = require('./localCredentials');

const DEFAULT_STATE_DIR = path.join(__dirname, '..', '.rating-removal');

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : null;
}

function parseArgs(argv) {
  const parsedLimit = Number.parseInt(valueAfter(argv, '--limit'), 10);
  return {
    apply: argv.includes('--apply'),
    limit:
      Number.isFinite(parsedLimit) && parsedLimit > 0
        ? parsedLimit
        : Number.POSITIVE_INFINITY,
    stateDir: path.resolve(valueAfter(argv, '--state-dir') || DEFAULT_STATE_DIR),
  };
}

function isAtomicValue(value) {
  if (!value || typeof value !== 'object') return false;
  if (value instanceof Date || Buffer.isBuffer(value)) return true;
  const constructorName = value.constructor?.name;
  return [
    'Timestamp',
    'GeoPoint',
    'DocumentReference',
    'FieldValue',
  ].includes(constructorName);
}

function displayPath(parts) {
  return parts.reduce((result, part) => {
    if (typeof part === 'number') return `${result}[${part}]`;
    return result ? `${result}.${part}` : part;
  }, '');
}

function manifestValue(value) {
  if (value instanceof Date) return { __type: 'date', value: value.toISOString() };
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(manifestValue);
  if (typeof value.toDate === 'function') {
    return { __type: value.constructor?.name || 'timestamp', value: value.toDate().toISOString() };
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, manifestValue(entry)])
  );
}

function stripRatingKeys(value, parts = [], removed = []) {
  if (Array.isArray(value)) {
    return value.map((entry, index) =>
      stripRatingKeys(entry, [...parts, index], removed)
    );
  }
  if (!value || typeof value !== 'object' || isAtomicValue(value)) return value;

  const cleaned = {};
  Object.entries(value).forEach(([key, entry]) => {
    const nextParts = [...parts, key];
    if (key === 'rating') {
      removed.push({ path: displayPath(nextParts), value: manifestValue(entry) });
      return;
    }
    cleaned[key] = stripRatingKeys(entry, nextParts, removed);
  });
  return cleaned;
}

async function collectAllDocuments(firestore, limit = Number.POSITIVE_INFINITY) {
  const documents = [];
  const roots = await firestore.listCollections();

  async function visitCollection(collection) {
    if (documents.length >= limit) return;
    const snapshot = await collection.get();
    for (const document of snapshot.docs) {
      if (documents.length >= limit) return;
      documents.push(document);
      const children = await document.ref.listCollections();
      for (const child of children) await visitCollection(child);
    }
  }

  for (const root of roots) await visitCollection(root);
  return documents;
}

function createManifestWriter(stateDir) {
  return (manifest) => {
    fs.mkdirSync(stateDir, { recursive: true });
    const stamp = manifest.createdAt.replace(/[:.]/g, '-');
    const manifestPath = path.join(stateDir, `rating-removal-${stamp}.json`);
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    return manifestPath;
  };
}

async function scanRatingFields({
  firestore,
  apply = false,
  limit = Number.POSITIVE_INFINITY,
  stateDir = DEFAULT_STATE_DIR,
  documents,
  writeManifest = createManifestWriter(stateDir),
}) {
  const snapshots = documents || await collectAllDocuments(firestore, limit);
  const affected = [];
  const byRootCollection = {};

  snapshots.forEach((snapshot) => {
    const removed = [];
    const cleaned = stripRatingKeys(snapshot.data() || {}, [], removed);
    if (!removed.length) return;
    const rootCollection = snapshot.ref.path.split('/')[0];
    byRootCollection[rootCollection] = (byRootCollection[rootCollection] || 0) + removed.length;
    affected.push({ snapshot, cleaned, removed });
  });

  const summary = {
    mode: apply ? 'apply' : 'dry-run',
    scanned: snapshots.length,
    documentsAffected: affected.length,
    fieldsFound: affected.reduce((total, entry) => total + entry.removed.length, 0),
    fieldsRemoved: 0,
    conflicts: 0,
    byRootCollection,
    manifestPath: null,
  };

  if (!apply || !affected.length) return summary;

  const manifest = {
    createdAt: new Date().toISOString(),
    projectId: firestore.projectId || null,
    documents: affected.map(({ snapshot, removed }) => ({
      path: snapshot.ref.path,
      updateTime: snapshot.updateTime?.toDate?.().toISOString?.() || null,
      removed,
    })),
  };
  summary.manifestPath = writeManifest(manifest);

  for (const candidate of affected) {
    const removedCount = await firestore.runTransaction(async (transaction) => {
      const current = await transaction.get(candidate.snapshot.ref);
      if (!current.exists) return 0;
      if (
        candidate.snapshot.updateTime?.isEqual &&
        !candidate.snapshot.updateTime.isEqual(current.updateTime)
      ) {
        return -1;
      }
      const currentRemoved = [];
      const cleaned = stripRatingKeys(current.data() || {}, [], currentRemoved);
      if (!currentRemoved.length) return 0;
      transaction.set(current.ref, cleaned, { merge: false });
      return currentRemoved.length;
    });
    if (removedCount < 0) summary.conflicts += 1;
    else summary.fieldsRemoved += removedCount;
  }

  return summary;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  initializeAdmin(admin);
  const firestore = admin.firestore();
  console.log(`Rating removal: ${options.apply ? 'APPLY' : 'DRY RUN'}`);
  const summary = await scanRatingFields({ firestore, ...options });
  console.log(JSON.stringify(summary, null, 2));
  if (!options.apply && summary.fieldsFound) {
    console.log('No data changed. Re-run with --apply after reviewing the summary.');
  }
  if (summary.conflicts) {
    console.error('Some documents changed after the scan. Re-run the migration to finish cleanup.');
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Rating removal failed.', error);
    process.exitCode = 1;
  });
}

module.exports = {
  collectAllDocuments,
  parseArgs,
  scanRatingFields,
  stripRatingKeys,
};
