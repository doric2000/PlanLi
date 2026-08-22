/* eslint-disable no-console */
const admin = require('firebase-admin');
const { initializeAdmin } = require('./localCredentials');

const PAGE_SIZE = 400;

function parseArgs(argv) {
  const limitIndex = argv.indexOf('--limit');
  const parsedLimit = limitIndex >= 0 ? Number.parseInt(argv[limitIndex + 1], 10) : NaN;
  return {
    apply: argv.includes('--apply'),
    limit: Number.isFinite(parsedLimit) && parsedLimit > 0
      ? parsedLimit
      : Number.POSITIVE_INFINITY,
  };
}

function canonicalRootPatch(entry) {
  const value = entry.data() || {};
  const hasValidCount = Number.isInteger(value.replyCount) && value.replyCount >= 0;
  const canonicalRoot = (
    value.threadType === 'root'
    && value.threadRootId === entry.id
    && value.replyToCommentId === null
    && hasValidCount
  );
  const canonicalReply = (
    value.threadType === 'reply'
    && typeof value.threadRootId === 'string'
    && value.threadRootId.length > 0
    && typeof value.replyToCommentId === 'string'
    && value.replyToCommentId.length > 0
    && hasValidCount
  );
  if (canonicalRoot || canonicalReply) return null;
  return {
    threadType: 'root',
    threadRootId: entry.id,
    replyToCommentId: null,
    replyCount: 0,
    threadMigratedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

async function runBackfill({ apply = false, limit = Number.POSITIVE_INFINITY, db = admin.firestore() }) {
  let scanned = 0;
  let missing = 0;
  let updated = 0;
  let cursor = null;
  while (scanned < limit) {
    let query = db.collectionGroup('comments')
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(Math.min(PAGE_SIZE, limit - scanned));
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    if (snapshot.empty) break;
    const candidates = snapshot.docs
      .map((entry) => ({ entry, patch: canonicalRootPatch(entry) }))
      .filter(({ patch }) => patch);
    scanned += snapshot.size;
    missing += candidates.length;
    if (apply && candidates.length) {
      const batch = db.batch();
      candidates.forEach(({ entry, patch }) => batch.update(entry.ref, patch));
      await batch.commit();
      updated += candidates.length;
    }
    cursor = snapshot.docs[snapshot.docs.length - 1];
    if (snapshot.size < PAGE_SIZE) break;
  }
  return { mode: apply ? 'apply' : 'dry-run', scanned, missing, updated };
}

async function main() {
  initializeAdmin(admin);
  console.log(JSON.stringify(await runBackfill(parseArgs(process.argv.slice(2))), null, 2));
}

if (require.main === module) main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

module.exports = { canonicalRootPatch, parseArgs, runBackfill };
