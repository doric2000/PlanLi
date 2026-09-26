/* eslint-disable no-await-in-loop, no-console */
const crypto = require('node:crypto');
const admin = require('firebase-admin');

const { initializeAdmin } = require('./localCredentials');
const {
  contentReviewOutboxRef,
  stageContentReviewOutbox,
  validContentReviewOutbox,
} = require('../notificationService');

const PROJECT_ID = 'planli-f0b12';
const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 5000;

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

function timestampMillis(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function heldEventTime(snapshot) {
  const value = snapshot.data() || {};
  return [value?.moderation?.heldAt, value.updatedAt, value.createdAt, snapshot.updateTime, snapshot.createTime]
    .find((candidate) => timestampMillis(candidate) > 0) || null;
}

function deterministicBackfillVersion(path, eventTime) {
  const eventMillis = timestampMillis(eventTime);
  if (!path || eventMillis <= 0) fail('A stable held-content event time is required.');
  const digest = crypto.createHash('sha256').update(`${path}\n${eventMillis}`).digest();
  return (digest.readUInt32BE(0) % 1_000_000_000) + 1;
}

function backfillManifest(records, { limit, after, nextAfter }) {
  return {
    version: 1,
    projectId: PROJECT_ID,
    limit,
    after,
    nextAfter,
    records: records.map((record) => ({
      path: record.snapshot.ref.path,
      ownerUid: record.ownerUid,
      eventTime: timestampMillis(record.eventTime),
      updateTime: timestampMillis(record.snapshot.updateTime),
      outboxPath: record.outboxRef.path,
      version: record.version,
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

async function loadPendingBackfill(db, limit, after = '') {
  let query = db.collection('recommendations')
    .where('status', '==', 'moderation_hold')
    .orderBy(admin.firestore.FieldPath.documentId());
  if (after) query = query.startAfter(after);
  const page = await query.limit(limit + 1).get();
  const held = page.docs.slice(0, limit);
  const inspected = await Promise.all(held.map(async (snapshot) => {
    const value = snapshot.data() || {};
    if (typeof value.ownerId !== 'string' || !value.ownerId.trim()) {
      fail(`Held recommendation ${snapshot.ref.path} has no ownerId.`);
    }
    const eventTime = heldEventTime(snapshot);
    if (!eventTime) fail(`Held recommendation ${snapshot.ref.path} has no stable event time.`);
    const outboxRef = contentReviewOutboxRef(db, snapshot.ref.path);
    const outboxSnapshot = await outboxRef.get();
    const existing = outboxSnapshot.exists ? outboxSnapshot.data() || {} : null;
    if (validContentReviewOutbox(existing) && existing.target.path === snapshot.ref.path) return null;
    return {
      snapshot,
      ownerUid: value.ownerId.trim(),
      eventTime,
      outboxRef,
      version: deterministicBackfillVersion(snapshot.ref.path, eventTime),
    };
  }));
  return {
    records: inspected.filter(Boolean),
    scanned: held.length,
    alreadyPresent: inspected.filter((record) => !record).length,
    truncated: page.size > limit,
    nextAfter: page.size > limit ? held[held.length - 1].id : '',
  };
}

async function applyRecord(db, record) {
  return db.runTransaction(async (transaction) => {
    const [current, outbox] = await Promise.all([
      transaction.get(record.snapshot.ref),
      transaction.get(record.outboxRef),
    ]);
    const value = current.exists ? current.data() || {} : null;
    if (!value || value.status !== 'moderation_hold' || value.ownerId !== record.ownerUid ||
        timestampMillis(current.updateTime) !== timestampMillis(record.snapshot.updateTime)) {
      fail(`Backfill stopped because ${record.snapshot.ref.path} changed after the dry run.`);
    }
    const existing = outbox.exists ? outbox.data() || {} : null;
    if (validContentReviewOutbox(existing) && existing.target.path === current.ref.path) return false;
    const eventTime = heldEventTime(current);
    if (timestampMillis(eventTime) !== timestampMillis(record.eventTime)) {
      fail(`Backfill stopped because the held event time changed for ${current.ref.path}.`);
    }
    stageContentReviewOutbox({
      transaction,
      admin,
      outboxRef: record.outboxRef,
      existingSnapshot: outbox,
      ownerUid: record.ownerUid,
      target: { type: 'recommendation', id: current.id },
      data: value,
      occurredAt: eventTime,
      version: record.version,
    });
    return true;
  });
}

async function runHeldRecommendationNotificationBackfill({ db, options }) {
  const after = options.after || '';
  const loaded = await loadPendingBackfill(db, options.limit, after);
  const manifest = backfillManifest(loaded.records, {
    limit: options.limit,
    after,
    nextAfter: loaded.nextAfter,
  });
  const fingerprint = manifestFingerprint(manifest);
  const report = {
    mode: options.apply ? 'apply' : 'dry-run',
    projectId: PROJECT_ID,
    scanned: loaded.scanned,
    pending: loaded.records.length,
    alreadyPresent: loaded.alreadyPresent,
    truncated: loaded.truncated,
    after,
    nextAfter: loaded.nextAfter,
    fingerprint,
  };
  if (!options.apply) return report;

  assertApplyAllowed({ options, fingerprint });
  let applied = 0;
  for (const record of loaded.records) {
    if (await applyRecord(db, record)) applied += 1;
  }
  const verification = await Promise.all(loaded.records.map((record) => record.outboxRef.get()));
  const invalid = verification.filter((snapshot, index) => {
    const value = snapshot.exists ? snapshot.data() || {} : null;
    return !validContentReviewOutbox(value)
      || value.target.path !== loaded.records[index].snapshot.ref.path
      || value.version !== loaded.records[index].version;
  });
  if (invalid.length) fail('Post-apply verification found missing or stale content-review outboxes.');
  return { ...report, applied, verified: true };
}

async function main() {
  const options = parseOptions();
  initializeAdmin(admin, { projectId: PROJECT_ID });
  if (admin.app().options.projectId !== PROJECT_ID) fail(`Active Firebase project must be ${PROJECT_ID}.`);
  const result = await runHeldRecommendationNotificationBackfill({ db: admin.firestore(), options });
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
  backfillManifest,
  deterministicBackfillVersion,
  heldEventTime,
  loadPendingBackfill,
  manifestFingerprint,
  parseOptions,
  runHeldRecommendationNotificationBackfill,
  timestampMillis,
};
