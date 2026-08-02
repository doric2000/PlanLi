/* eslint-disable no-await-in-loop, no-console */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const { Storage } = require('@google-cloud/storage');
const { googleAuthOptions, initializeAdmin } = require('./localCredentials');

const PROJECT_ID = 'planli-f0b12';
const DEFAULT_SOURCE = 'planli-f0b12.firebasestorage.app';
const DEFAULT_TARGET = 'planli-f0b12-media-eu';
const STATE_DIR = path.join(__dirname, '..', '.storage-eu-migration');

function valueAfter(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : null;
}

function parseArgs(argv) {
  const parsedLimit = Number.parseInt(valueAfter(argv, '--limit'), 10);
  return {
    apply: argv.includes('--apply'),
    createTarget: argv.includes('--create-target'),
    configure: argv.includes('--configure'),
    updateFirestore: argv.includes('--update-firestore'),
    restoreSource: argv.includes('--restore-source'),
    resume: argv.includes('--resume'),
    source: valueAfter(argv, '--source') || process.env.SOURCE_MEDIA_BUCKET || DEFAULT_SOURCE,
    target: valueAfter(argv, '--target') || process.env.MEDIA_STORAGE_BUCKET || DEFAULT_TARGET,
    limit: Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : Infinity,
    stateDir: path.resolve(valueAfter(argv, '--state-dir') || STATE_DIR),
  };
}

function initialize() {
  initializeAdmin(admin, { projectId: PROJECT_ID });
  return new Storage(googleAuthOptions({ projectId: PROJECT_ID }));
}

function ensureStateDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function atomicJson(filePath, value) {
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  try {
    fs.renameSync(temporary, filePath);
  } catch (error) {
    if (!['EEXIST', 'EPERM'].includes(error.code)) throw error;
    // Windows cannot atomically rename over an existing destination. The state is
    // reconstructable from target checksums, so an overwrite fallback is safe.
    fs.copyFileSync(temporary, filePath);
    fs.unlinkSync(temporary);
  }
}

async function getAllFiles(bucket) {
  const files = [];
  let pageToken;
  do {
    const [page, , response] = await bucket.getFiles({
      autoPaginate: false,
      maxResults: 1000,
      ...(pageToken ? { pageToken } : {}),
    });
    files.push(...page);
    pageToken = response?.nextPageToken;
  } while (pageToken);
  return files;
}

function manifestEntry(file) {
  const metadata = file.metadata || {};
  return {
    name: file.name,
    size: String(metadata.size || '0'),
    contentType: metadata.contentType || null,
    cacheControl: metadata.cacheControl || null,
    crc32c: metadata.crc32c || null,
    md5Hash: metadata.md5Hash || null,
    generation: metadata.generation || null,
    customMetadata: metadata.metadata || {},
  };
}

function sameChecksum(source, target) {
  if (String(source.size) !== String(target.size)) return false;
  if (source.crc32c && target.crc32c) return source.crc32c === target.crc32c;
  if (source.md5Hash && target.md5Hash) return source.md5Hash === target.md5Hash;
  return false;
}

async function configureTarget(target) {
  const cors = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', '..', 'storage.cors.json'), 'utf8')
  );
  const lifecycle = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', '..', 'storage.lifecycle.json'), 'utf8')
  );
  await target.setMetadata({
    cors,
    lifecycle,
    iamConfiguration: { uniformBucketLevelAccess: { enabled: true } },
    softDeletePolicy: { retentionDurationSeconds: '604800' },
  });
}

async function ensureTarget(storage, options) {
  const target = storage.bucket(options.target);
  const [exists] = await target.exists();
  if (!exists) {
    if (!(options.apply && options.createTarget)) {
      throw new Error(
        `Target bucket ${options.target} does not exist. Re-run with --apply --create-target.`
      );
    }
    await storage.createBucket(options.target, {
      location: 'europe-west1',
      storageClass: 'STANDARD',
      uniformBucketLevelAccess: true,
    });
  }
  const [metadata] = await target.getMetadata();
  const location = String(metadata.location || '').toUpperCase();
  if (location !== 'EUROPE-WEST1') {
    throw new Error(`Target bucket location is ${location || 'unknown'}, expected EUROPE-WEST1.`);
  }
  if (options.apply && (options.configure || options.createTarget)) {
    await configureTarget(target);
  }
  return target;
}

async function copyAndVerify(sourceBucket, targetBucket, entry) {
  const sourceFile = sourceBucket.file(entry.name);
  const targetFile = targetBucket.file(entry.name);
  const [targetExists] = await targetFile.exists();
  if (!targetExists) {
    try {
      await sourceFile.copy(targetFile, { preconditionOpts: { ifGenerationMatch: 0 } });
    } catch (error) {
      // Another resumed worker may have completed this create after our exists
      // check. Treat that race as success only after the checksum check below.
      if (![412, '412'].includes(error?.code)) throw error;
    }
  }
  const [targetMetadata] = await targetFile.getMetadata();
  const targetEntry = manifestEntry({ name: entry.name, metadata: targetMetadata });
  if (!sameChecksum(entry, targetEntry)) {
    throw new Error(`Checksum mismatch for ${entry.name}.`);
  }
  return targetEntry;
}

function rewriteBucketString(value, source, target) {
  return value
    .split(source).join(target)
    .split(encodeURIComponent(source)).join(encodeURIComponent(target));
}

function rewriteBucketReferences(value, source, target) {
  if (typeof value === 'string') {
    const rewritten = rewriteBucketString(value, source, target);
    return { value: rewritten, changed: rewritten !== value };
  }
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((entry) => {
      const result = rewriteBucketReferences(entry, source, target);
      changed ||= result.changed;
      return result.value;
    });
    return { value: next, changed };
  }
  if (!value || typeof value !== 'object') return { value, changed: false };
  if (
    value instanceof admin.firestore.Timestamp ||
    value instanceof admin.firestore.GeoPoint ||
    typeof value.path === 'string' && value.firestore
  ) {
    return { value, changed: false };
  }
  let changed = false;
  const next = Object.fromEntries(Object.entries(value).map(([key, entry]) => {
    const result = rewriteBucketReferences(entry, source, target);
    changed ||= result.changed;
    return [key, result.value];
  }));
  return { value: next, changed };
}

async function collectFirestoreDocuments(db) {
  const documents = [];
  const walkCollection = async (collection) => {
    const snapshot = await collection.get();
    for (const entry of snapshot.docs) {
      documents.push(entry);
      const subcollections = await entry.ref.listCollections();
      for (const subcollection of subcollections) await walkCollection(subcollection);
    }
  };
  const roots = await db.listCollections();
  for (const root of roots) await walkCollection(root);
  return documents;
}

async function updateFirestoreReferences({ options, statePath, completed, firestoreCompleted }) {
  if (!options.updateFirestore) return { scanned: 0, rewritten: 0 };
  const db = admin.firestore();
  const documents = await collectFirestoreDocuments(db);
  const planned = [];
  for (const entry of documents) {
    const result = rewriteBucketReferences(entry.data(), options.source, options.target);
    if (result.changed) planned.push({ ref: entry.ref, data: result.value });
  }
  if (!options.apply) return { scanned: documents.length, rewritten: planned.length };

  let rewritten = 0;
  for (let offset = 0; offset < planned.length; offset += 300) {
    const chunk = planned.slice(offset, offset + 300).filter(
      (entry) => !firestoreCompleted[entry.ref.path]
    );
    if (!chunk.length) continue;
    const batch = db.batch();
    chunk.forEach((entry) => batch.set(entry.ref, entry.data));
    await batch.commit();
    chunk.forEach((entry) => {
      firestoreCompleted[entry.ref.path] = true;
      rewritten += 1;
    });
    atomicJson(statePath, {
      sourceBucket: options.source,
      targetBucket: options.target,
      completed,
      firestoreCompleted,
      updatedAt: new Date().toISOString(),
    });
  }
  return { scanned: documents.length, rewritten };
}

async function restoreRollbackSource({ options, sourceBucket, targetBucket }) {
  const allTargetFiles = await getAllFiles(targetBucket);
  // The original US snapshot used these legacy top-level prefixes. The
  // canonical `media/` tree was generated in Europe and is intentionally not
  // copied back as part of the rollback snapshot.
  const originalFiles = allTargetFiles.filter((file) => !file.name.startsWith('media/'));
  const manifest = originalFiles.map(manifestEntry).sort((a, b) => a.name.localeCompare(b.name));
  const sourceFiles = await getAllFiles(sourceBucket);
  const sourceByName = new Map(sourceFiles.map((file) => [file.name, manifestEntry(file)]));
  const missing = manifest.filter((entry) => !sourceByName.has(entry.name));
  const mismatched = manifest.filter((entry) =>
    sourceByName.has(entry.name) && !sameChecksum(entry, sourceByName.get(entry.name)));
  const reportPath = path.join(options.stateDir, 'rollback-source-report.json');
  const statePath = path.join(options.stateDir, 'rollback-source-state.json');
  const previous = options.resume && fs.existsSync(statePath)
    ? JSON.parse(fs.readFileSync(statePath, 'utf8'))
    : { completed: {} };
  const completed = previous.completed || {};
  const failures = mismatched.map((entry) => ({
    name: entry.name,
    error: 'Existing US object does not match the verified EU copy.',
  }));
  let copied = 0;
  let verified = manifest.length - missing.length - mismatched.length;
  let sinceCheckpoint = 0;

  if (options.apply) {
    const pending = missing.slice(0, options.limit);
    for (let offset = 0; offset < pending.length; offset += 5) {
      const batch = pending.slice(offset, offset + 5);
      const results = await Promise.all(batch.map(async (entry) => {
        try {
          await copyAndVerify(targetBucket, sourceBucket, entry);
          return { entry };
        } catch (error) {
          return { entry, error };
        }
      }));
      for (const result of results) {
        if (result.error) {
          failures.push({ name: result.entry.name, error: result.error.message });
        } else {
          completed[result.entry.name] =
            result.entry.crc32c || result.entry.md5Hash || result.entry.size;
          copied += 1;
          verified += 1;
          sinceCheckpoint += 1;
        }
      }
      if (sinceCheckpoint >= 25) {
        atomicJson(statePath, { completed, updatedAt: new Date().toISOString() });
        sinceCheckpoint = 0;
      }
    }
    atomicJson(statePath, { completed, updatedAt: new Date().toISOString() });
  }

  const report = {
    mode: options.apply ? 'restore-source' : 'restore-source-dry-run',
    sourceBucket: options.source,
    verifiedEuropeanBucket: options.target,
    originalObjectCount: manifest.length,
    presentBeforeRestore: sourceFiles.length,
    missingBeforeRestore: missing.length,
    copied,
    verified,
    failures,
    completedAt: new Date().toISOString(),
  };
  atomicJson(reportPath, report);
  console.log(JSON.stringify(report, null, 2));
  if (failures.length) process.exitCode = 1;
  return report;
}

async function run(options) {
  if (options.source === options.target) throw new Error('Source and target buckets must differ.');
  ensureStateDirectory(options.stateDir);
  const storage = initialize();
  const sourceBucket = storage.bucket(options.source);
  const [sourceExists] = await sourceBucket.exists();
  if (!sourceExists) throw new Error(`Source bucket ${options.source} does not exist.`);
  const targetBucket = await ensureTarget(storage, options);
  if (options.restoreSource) {
    return restoreRollbackSource({ options, sourceBucket, targetBucket });
  }

  const sourceFiles = await getAllFiles(sourceBucket);
  const manifest = sourceFiles.map(manifestEntry).sort((a, b) => a.name.localeCompare(b.name));
  const totalBytes = manifest.reduce((sum, entry) => sum + Number(entry.size || 0), 0);
  atomicJson(path.join(options.stateDir, 'manifest.json'), {
    generatedAt: new Date().toISOString(),
    sourceBucket: options.source,
    targetBucket: options.target,
    objectCount: manifest.length,
    totalBytes,
    objects: manifest,
  });

  const statePath = path.join(options.stateDir, 'state.json');
  const previous = options.resume && fs.existsSync(statePath)
    ? JSON.parse(fs.readFileSync(statePath, 'utf8'))
    : { completed: {} };
  const completed = previous.completed || {};
  const firestoreCompleted = previous.firestoreCompleted || {};
  const failures = [];
  let copied = 0;
  let verified = 0;
  let sinceCheckpoint = 0;

  if (options.apply) {
    for (const entry of manifest.slice(0, options.limit)) {
      if (completed[entry.name] === (entry.crc32c || entry.md5Hash || entry.size)) {
        verified += 1;
        continue;
      }
      try {
        await copyAndVerify(sourceBucket, targetBucket, entry);
        completed[entry.name] = entry.crc32c || entry.md5Hash || entry.size;
        copied += 1;
        verified += 1;
        sinceCheckpoint += 1;
        if (sinceCheckpoint >= 25) {
          atomicJson(statePath, {
            sourceBucket: options.source,
            targetBucket: options.target,
            completed,
            firestoreCompleted,
            updatedAt: new Date().toISOString(),
          });
          sinceCheckpoint = 0;
        }
      } catch (error) {
        failures.push({ name: entry.name, error: error.message });
      }
    }
    atomicJson(statePath, {
      sourceBucket: options.source,
      targetBucket: options.target,
      completed,
      firestoreCompleted,
      updatedAt: new Date().toISOString(),
    });
  } else {
    const targetFiles = await getAllFiles(targetBucket);
    const targetByName = new Map(targetFiles.map((file) => [file.name, manifestEntry(file)]));
    for (const entry of manifest.slice(0, options.limit)) {
      if (targetByName.has(entry.name) && sameChecksum(entry, targetByName.get(entry.name))) {
        verified += 1;
      }
    }
  }

  const firestore = await updateFirestoreReferences({
    options,
    statePath,
    completed,
    firestoreCompleted,
  });

  const report = {
    mode: options.apply ? 'apply' : 'dry-run',
    sourceBucket: options.source,
    targetBucket: options.target,
    sourceObjects: manifest.length,
    sourceBytes: totalBytes,
    considered: Math.min(manifest.length, options.limit),
    copied,
    verified,
    firestore,
    failures,
    completedAt: new Date().toISOString(),
  };
  atomicJson(path.join(options.stateDir, 'report.json'), report);
  console.log(JSON.stringify(report, null, 2));
  if (failures.length) process.exitCode = 1;
  return report;
}

if (require.main === module) {
  run(parseArgs(process.argv.slice(2))).catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}

module.exports = {
  manifestEntry,
  parseArgs,
  rewriteBucketReferences,
  run,
  sameChecksum,
};
