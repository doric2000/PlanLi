/* eslint-disable no-await-in-loop, no-console */
const admin = require('firebase-admin');
const { initializeAdmin } = require('./localCredentials');

const USER_PAGE_SIZE = 100;
const SOURCE_READ_BATCH_SIZE = 200;
const DELETE_BATCH_SIZE = 400;

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
  };
}

function initAdmin() {
  initializeAdmin(admin);
}

function resolveFavoriteSourcePath(data) {
  const id =
    typeof data?.id === 'string' && data.id.trim() ? data.id : null;
  if (!id) {
    return { status: 'malformed', reason: 'missing-id' };
  }

  if (data.type === 'recommendations') {
    return { status: 'known', path: `recommendations/${id}` };
  }
  if (data.type === 'routes') {
    return { status: 'known', path: `routes/${id}` };
  }
  if (data.type === 'cities') {
    const countryId =
      typeof data.countryId === 'string' && data.countryId.trim()
        ? data.countryId
        : null;
    if (!countryId) {
      return { status: 'malformed', reason: 'missing-country-id' };
    }
    return {
      status: 'known',
      path: `countries/${countryId}/destinations/${id}`,
    };
  }

  return { status: 'unknown', reason: 'unsupported-type' };
}

async function deleteFavoriteRefs(firestore, refs) {
  let deleted = 0;
  for (let offset = 0; offset < refs.length; offset += DELETE_BATCH_SIZE) {
    const batch = firestore.batch();
    const page = refs.slice(offset, offset + DELETE_BATCH_SIZE);
    page.forEach((ref) => batch.delete(ref));
    await batch.commit();
    deleted += page.length;
  }
  return deleted;
}

async function inspectFavoriteRecords({
  firestore,
  records,
  apply = false,
  log = console,
}) {
  const known = [];
  let malformed = 0;
  let unknown = 0;

  records.forEach((record) => {
    const source = resolveFavoriteSourcePath(record.data);
    if (source.status === 'known') {
      known.push({ ...record, sourcePath: source.path });
    } else {
      if (source.status === 'malformed') malformed += 1;
      if (source.status === 'unknown') unknown += 1;
      log.warn('Skipped favorite with no supported source.', {
        favoritePath: record.ref.path,
        reason: source.reason,
        type: record.data?.type || null,
      });
    }
  });

  const sourcePaths = Array.from(
    new Set(known.map((record) => record.sourcePath))
  );
  const sourceSnapshots = sourcePaths.length
    ? await firestore.getAll(
        ...sourcePaths.map((sourcePath) => firestore.doc(sourcePath))
      )
    : [];
  const existsByPath = new Map(
    sourceSnapshots.map((snapshot) => [
      snapshot.ref.path,
      snapshot.exists,
    ])
  );
  const orphaned = known.filter(
    (record) => existsByPath.get(record.sourcePath) === false
  );

  orphaned.forEach((record) => {
    log.log('Orphan favorite found.', {
      favoritePath: record.ref.path,
      sourcePath: record.sourcePath,
    });
  });

  const deleted = apply
    ? await deleteFavoriteRefs(
        firestore,
        orphaned.map((record) => record.ref)
      )
    : 0;

  return {
    scanned: records.length,
    known: known.length,
    malformed,
    unknown,
    orphaned: orphaned.length,
    deleted,
  };
}

function addSummary(target, source) {
  Object.keys(target).forEach((key) => {
    target[key] += source[key] || 0;
  });
}

async function scanOrphanFavorites({
  firestore,
  apply = false,
  limit = Number.POSITIVE_INFINITY,
  log = console,
}) {
  const summary = {
    scanned: 0,
    known: 0,
    malformed: 0,
    unknown: 0,
    orphaned: 0,
    deleted: 0,
  };
  let lastUser = null;
  let pending = [];

  const flush = async () => {
    if (!pending.length) return;
    const result = await inspectFavoriteRecords({
      firestore,
      records: pending,
      apply,
      log,
    });
    addSummary(summary, result);
    pending = [];
  };

  while (summary.scanned + pending.length < limit) {
    let usersQuery = firestore
      .collection('users')
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(USER_PAGE_SIZE);
    if (lastUser) usersQuery = usersQuery.startAfter(lastUser);
    const usersSnapshot = await usersQuery.get();
    if (usersSnapshot.empty) break;

    for (const userDoc of usersSnapshot.docs) {
      const favoritesSnapshot = await userDoc.ref
        .collection('favorites')
        .get();
      for (const favoriteDoc of favoritesSnapshot.docs) {
        if (summary.scanned + pending.length >= limit) break;
        pending.push({
          ref: favoriteDoc.ref,
          data: favoriteDoc.data() || {},
        });
        if (pending.length >= SOURCE_READ_BATCH_SIZE) await flush();
      }
      if (summary.scanned + pending.length >= limit) break;
    }

    lastUser = usersSnapshot.docs[usersSnapshot.docs.length - 1];
  }

  await flush();
  return summary;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  initAdmin();
  const mode = options.apply ? 'APPLY' : 'DRY RUN';
  console.log(`Favorite integrity cleanup: ${mode}`);
  const summary = await scanOrphanFavorites({
    firestore: admin.firestore(),
    apply: options.apply,
    limit: options.limit,
  });
  console.log('Favorite integrity cleanup complete.', summary);
  if (!options.apply && summary.orphaned > 0) {
    console.log('No data changed. Re-run with --apply to delete these orphans.');
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Favorite integrity cleanup failed.', error);
    process.exitCode = 1;
  });
}

module.exports = {
  inspectFavoriteRecords,
  parseArgs,
  resolveFavoriteSourcePath,
  scanOrphanFavorites,
};
