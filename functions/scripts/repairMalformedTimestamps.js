/* eslint-disable no-await-in-loop, no-console */
const admin = require('firebase-admin');
const fs = require('node:fs');
const path = require('node:path');
const { initializeAdmin } = require('./localCredentials');

const PROJECT_ID = 'planli-f0b12';
const MIN_SECONDS = -62135596800;
const MAX_SECONDS = 253402300799;
const STATE_DIRECTORY = path.join(__dirname, '..', '.database-canonical-migration', 'timestamp-repair');

function parseArgs(argv) {
  return { apply: argv.includes('--apply') };
}

function isMalformedTimestamp(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (value instanceof admin.firestore.Timestamp) return false;
  const keys = Object.keys(value).sort();
  if (keys.length !== 2 || keys[0] !== '_nanoseconds' || keys[1] !== '_seconds') return false;
  return Number.isInteger(value._seconds) &&
    value._seconds >= MIN_SECONDS &&
    value._seconds <= MAX_SECONDS &&
    Number.isInteger(value._nanoseconds) &&
    value._nanoseconds >= 0 &&
    value._nanoseconds < 1000000000;
}

function isFirestoreAtomic(value) {
  return value instanceof Date ||
    value instanceof admin.firestore.Timestamp ||
    value instanceof admin.firestore.GeoPoint ||
    value instanceof admin.firestore.DocumentReference;
}

function repairValue(value) {
  if (isFirestoreAtomic(value)) return { value, repaired: 0 };
  if (isMalformedTimestamp(value)) {
    return {
      value: new admin.firestore.Timestamp(value._seconds, value._nanoseconds),
      repaired: 1,
    };
  }
  if (!value || typeof value !== 'object') {
    return { value, repaired: 0 };
  }
  if (Array.isArray(value)) {
    let repaired = 0;
    const next = value.map((entry) => {
      const result = repairValue(entry);
      repaired += result.repaired;
      return result.value;
    });
    return { value: repaired ? next : value, repaired };
  }

  let repaired = 0;
  const next = {};
  for (const [key, entry] of Object.entries(value)) {
    const result = repairValue(entry);
    repaired += result.repaired;
    next[key] = result.value;
  }
  return { value: repaired ? next : value, repaired };
}

function repairDocumentData(data) {
  const updates = {};
  let repaired = 0;
  for (const [field, value] of Object.entries(data || {})) {
    const result = repairValue(value);
    if (result.repaired) updates[field] = result.value;
    repaired += result.repaired;
  }
  return { updates, repaired };
}

async function collectDocuments(db) {
  const documents = [];
  const roots = await db.listCollections();

  async function visit(collection) {
    const snapshot = await collection.get();
    for (const document of snapshot.docs) {
      documents.push(document);
      const children = await document.ref.listCollections();
      for (const child of children) await visit(child);
    }
  }

  for (const root of roots) await visit(root);
  return documents;
}

async function run(options = parseArgs(process.argv.slice(2))) {
  initializeAdmin(admin, { projectId: PROJECT_ID });
  const db = admin.firestore();
  const documents = await collectDocuments(db);
  const repairs = documents.map((document) => ({
    document,
    ...repairDocumentData(document.data()),
  })).filter((entry) => entry.repaired > 0);
  const counts = repairs.reduce((result, entry) => {
    const root = entry.document.ref.path.split('/')[0];
    result.set(root, (result.get(root) || 0) + entry.repaired);
    return result;
  }, new Map());
  const summary = {
    mode: options.apply ? 'apply' : 'dry-run',
    scannedDocuments: documents.length,
    affectedDocuments: repairs.length,
    repairedFields: repairs.reduce((total, entry) => total + entry.repaired, 0),
    byRoot: Object.fromEntries([...counts.entries()].sort()),
  };

  if (!options.apply) {
    console.log(JSON.stringify(summary, null, 2));
    return summary;
  }

  fs.mkdirSync(STATE_DIRECTORY, { recursive: true });
  const backupPath = path.join(STATE_DIRECTORY, `backup-${Date.now()}.json`);
  const backup = repairs.map((entry) => {
    const source = entry.document.data();
    return {
      path: entry.document.ref.path,
      fields: Object.fromEntries(
        Object.keys(entry.updates).map((field) => [field, source[field]])
      ),
    };
  });
  fs.writeFileSync(backupPath, `${JSON.stringify({ createdAt: new Date().toISOString(), documents: backup }, null, 2)}\n`);

  for (let offset = 0; offset < repairs.length; offset += 350) {
    const batch = db.batch();
    for (const entry of repairs.slice(offset, offset + 350)) {
      batch.update(entry.document.ref, entry.updates);
    }
    await batch.commit();
  }

  const result = { ...summary, applied: true, backupPath };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (require.main === module) {
  run()
    .catch((error) => {
      console.error(error.message || error);
      process.exitCode = 1;
    })
    .finally(() => admin.apps.length ? admin.app().delete() : undefined);
}

module.exports = {
  isMalformedTimestamp,
  parseArgs,
  repairDocumentData,
  repairValue,
  run,
};
