/* eslint-disable no-await-in-loop, no-console */
const crypto = require('node:crypto');
const admin = require('firebase-admin');

const { initializeAdmin } = require('./localCredentials');

const PROJECT_ID = 'planli-f0b12';
const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 1000;
const SCAN_PAGE_SIZE = 500;

function fail(message) {
  throw new Error(message);
}

function optionValue(argv, flag) {
  const inline = argv.find((argument) => argument.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : '';
}

function parseOptions(argv = process.argv.slice(2)) {
  const known = new Set(['--apply', '--limit', '--after', '--fingerprint', '--confirm-project']);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const flag = argument.split('=')[0];
    if (!known.has(flag)) fail(`Unknown argument: ${argument}`);
    if (flag === '--apply' && argument !== '--apply') fail('--apply does not accept a value.');
    if (flag !== '--apply' && !argument.includes('=')) {
      if (!argv[index + 1] || argv[index + 1].startsWith('--')) fail(`${flag} requires a value.`);
      index += 1;
    }
  }
  const limit = Number(optionValue(argv, '--limit') || DEFAULT_LIMIT);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    fail(`--limit must be an integer between 1 and ${MAX_LIMIT}.`);
  }
  return {
    apply: argv.includes('--apply'),
    limit,
    after: String(optionValue(argv, '--after') || '').trim(),
    fingerprint: String(optionValue(argv, '--fingerprint') || '').trim(),
    confirmProject: String(optionValue(argv, '--confirm-project') || '').trim(),
  };
}

function isEmptyPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null) && Object.keys(value).length === 0;
}

function hasMalformedCreatedAt(data) {
  return Number(data?.schemaVersion) === 2
    && ['personal', 'admin'].includes(data?.channel)
    && isEmptyPlainObject(data?.createdAt);
}

function timestampMillis(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function repairManifest(records, { limit, after, nextAfter }) {
  return {
    version: 1,
    projectId: PROJECT_ID,
    limit,
    after,
    nextAfter,
    records: records.map((snapshot) => ({
      path: snapshot.ref.path,
      createTime: timestampMillis(snapshot.createTime),
      updateTime: timestampMillis(snapshot.updateTime),
    })).sort((left, right) => left.path.localeCompare(right.path)),
  };
}

function manifestFingerprint(manifest) {
  return crypto.createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
}

function assertApplyAllowed({ options, fingerprint }) {
  if (options.confirmProject !== PROJECT_ID) {
    fail(`Apply refused. Pass --confirm-project=${PROJECT_ID}.`);
  }
  if (!/^[0-9a-f]{64}$/.test(options.fingerprint) || options.fingerprint !== fingerprint) {
    fail('Apply refused. The dry-run fingerprint is missing or no longer matches.');
  }
}

async function loadMalformedNotifications(db, limit, after = '') {
  const records = [];
  let scanned = 0;
  let cursor = after || null;
  while (records.length <= limit) {
    let query = db.collectionGroup('notifications')
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(SCAN_PAGE_SIZE);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    scanned += page.size;
    for (const entry of page.docs) {
      if (hasMalformedCreatedAt(entry.data() || {})) records.push(entry);
      if (records.length > limit) break;
    }
    if (records.length > limit || page.size < SCAN_PAGE_SIZE) break;
    cursor = page.docs[page.docs.length - 1];
  }
  return {
    records: records.slice(0, limit),
    truncated: records.length > limit,
    scanned,
    nextAfter: records.length > limit ? records[limit - 1].ref.path : '',
  };
}

async function repairChunk(db, records) {
  await db.runTransaction(async (transaction) => {
    const currentSnapshots = await Promise.all(records.map((record) => transaction.get(record.ref)));
    currentSnapshots.forEach((current, index) => {
      const original = records[index];
      if (!current.exists || !hasMalformedCreatedAt(current.data() || {}) ||
          timestampMillis(current.updateTime) !== timestampMillis(original.updateTime)) {
        fail('Repair stopped because a notification changed after the dry-run manifest was built.');
      }
      if (!current.createTime || typeof current.createTime.toMillis !== 'function') {
        fail('Repair stopped because Firestore did not provide the notification creation time.');
      }
    });
    currentSnapshots.forEach((current) => {
      transaction.update(current.ref, { createdAt: current.createTime });
    });
  });
}

async function runNotificationCreatedAtRepair({ db, options }) {
  const after = options.after || '';
  const loaded = await loadMalformedNotifications(db, options.limit, after);
  const manifest = repairManifest(loaded.records, {
    limit: options.limit,
    after,
    nextAfter: loaded.nextAfter,
  });
  const fingerprint = manifestFingerprint(manifest);
  const report = {
    mode: options.apply ? 'apply' : 'dry-run',
    projectId: PROJECT_ID,
    scanned: loaded.scanned,
    malformed: loaded.records.length,
    truncated: loaded.truncated,
    after,
    nextAfter: loaded.nextAfter,
    fingerprint,
  };
  if (!options.apply) return report;

  assertApplyAllowed({ options, fingerprint });
  for (let offset = 0; offset < loaded.records.length; offset += 100) {
    await repairChunk(db, loaded.records.slice(offset, offset + 100));
  }
  const verification = await Promise.all(loaded.records.map((record) => record.ref.get()));
  const remaining = verification.filter((snapshot) => hasMalformedCreatedAt(snapshot.data() || {})).length;
  if (remaining > 0) fail('Post-apply verification found notifications that still have a malformed createdAt.');
  return { ...report, applied: loaded.records.length, verified: true };
}

async function main() {
  const options = parseOptions();
  initializeAdmin(admin, { projectId: PROJECT_ID });
  if (admin.app().options.projectId !== PROJECT_ID) fail(`Active Firebase project must be ${PROJECT_ID}.`);
  const result = await runNotificationCreatedAtRepair({ db: admin.firestore(), options });
  console.log(JSON.stringify(result, null, 2));
  if (!options.apply) {
    const afterArgument = result.after ? ` --after=${result.after}` : '';
    console.log(`DRY RUN ONLY. Apply requires --apply --confirm-project=${PROJECT_ID}${afterArgument} --fingerprint=${result.fingerprint}`);
    if (result.nextAfter) console.log(`After applying this page, continue with --after=${result.nextAfter}`);
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
  hasMalformedCreatedAt,
  isEmptyPlainObject,
  loadMalformedNotifications,
  manifestFingerprint,
  parseOptions,
  repairManifest,
  runNotificationCreatedAtRepair,
};
