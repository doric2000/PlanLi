/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const { sanitizePublicProfile } = require('../publicProfiles');

const MIGRATION_DOC = '_migrations/publicProfilesV1';
const PAGE_SIZE = 400;

function parseArgs(argv) {
  const args = new Set(argv);
  const limitIndex = argv.indexOf('--limit');
  const parsedLimit =
    limitIndex >= 0
      ? Number.parseInt(argv[limitIndex + 1], 10)
      : Number.POSITIVE_INFINITY;
  return {
    apply: args.has('--apply'),
    resume: args.has('--resume'),
    limit:
      Number.isFinite(parsedLimit) && parsedLimit > 0
        ? parsedLimit
        : Number.POSITIVE_INFINITY,
  };
}

function initAdmin() {
  const keyPath = path.join(__dirname, '..', 'serviceAccountKey.json');
  const options = {};

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    options.credential = admin.credential.applicationDefault();
  } else if (fs.existsSync(keyPath)) {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    options.credential = admin.credential.cert(require(keyPath));
  } else {
    throw new Error(
      'Missing credentials. Set GOOGLE_APPLICATION_CREDENTIALS or place functions/serviceAccountKey.json'
    );
  }

  admin.initializeApp(options);
}

async function runBackfill({ apply, resume, limit }) {
  const db = admin.firestore();
  const migrationRef = db.doc(MIGRATION_DOC);
  let lastId = null;
  let processed = 0;

  if (resume) {
    const checkpoint = await migrationRef.get();
    lastId = checkpoint.exists ? checkpoint.data()?.lastUserId || null : null;
  }

  console.log(
    `${apply ? 'APPLY' : 'DRY RUN'} publicProfiles backfill` +
      `${lastId ? ` from ${lastId}` : ''}`
  );

  while (processed < limit) {
    const pageLimit = Math.min(PAGE_SIZE, limit - processed);
    let query = db
      .collection('users')
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(pageLimit);
    if (lastId) query = query.startAfter(lastId);

    const snapshot = await query.get();
    if (snapshot.empty) break;

    if (apply) {
      const batch = db.batch();
      for (const userDoc of snapshot.docs) {
        batch.set(
          db.doc(`publicProfiles/${userDoc.id}`),
          {
            ...sanitizePublicProfile(userDoc.id, userDoc.data()),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: false }
        );
      }
      const pageLastId = snapshot.docs[snapshot.docs.length - 1].id;
      batch.set(
        migrationRef,
        {
          lastUserId: pageLastId,
          processed: admin.firestore.FieldValue.increment(snapshot.size),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          complete: snapshot.size < pageLimit,
        },
        { merge: true }
      );
      await batch.commit();
    }

    processed += snapshot.size;
    lastId = snapshot.docs[snapshot.docs.length - 1].id;
    console.log(`${apply ? 'Wrote' : 'Would write'} ${processed} public profile(s)`);
    if (snapshot.size < pageLimit) break;
  }

  if (apply) {
    await migrationRef.set(
      {
        lastUserId: lastId,
        complete: processed < limit,
        finishedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  console.log(`Finished: ${processed} user(s) ${apply ? 'processed' : 'inspected'}.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  initAdmin();
  await runBackfill(options);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  runBackfill,
};
