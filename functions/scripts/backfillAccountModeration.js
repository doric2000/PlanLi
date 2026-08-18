/* eslint-disable no-console */
const admin = require('firebase-admin');
const { initializeAdmin } = require('./localCredentials');

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : null;
}

function parseArgs(argv) {
  const parsedLimit = Number.parseInt(valueAfter(argv, '--limit'), 10);
  return {
    apply: argv.includes('--apply'),
    after: valueAfter(argv, '--after'),
    // Firebase Admin Auth getUsers() accepts at most 100 identifiers per request.
    limit: Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 100,
  };
}

async function runBackfill({ apply, after, limit }) {
  const db = admin.firestore();
  let query = db.collection('users')
    .orderBy(admin.firestore.FieldPath.documentId())
    .limit(limit);
  if (after) query = query.startAfter(after);
  const snapshot = await query.get();
  if (snapshot.empty) return { mode: apply ? 'apply' : 'dry-run', inspected: 0, changed: 0, nextAfter: null };

  const authResult = await admin.auth().getUsers(snapshot.docs.map((entry) => ({ uid: entry.id })));
  const authUsers = new Map(authResult.users.map((user) => [user.uid, user]));
  const changes = snapshot.docs.filter((entry) => !['active', 'suspended'].includes(entry.data()?.moderation?.status));
  if (apply && changes.length) {
    const batch = db.batch();
    changes.forEach((entry) => {
      const authUser = authUsers.get(entry.id);
      batch.set(entry.ref, {
        moderation: {
          status: !authUser || authUser.disabled ? 'suspended' : 'active',
          migratedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    });
    await batch.commit();
  }
  return {
    mode: apply ? 'apply' : 'dry-run',
    inspected: snapshot.size,
    changed: changes.length,
    nextAfter: snapshot.size === limit ? snapshot.docs.at(-1).id : null,
  };
}

async function main() {
  initializeAdmin(admin);
  console.log(JSON.stringify(await runBackfill(parseArgs(process.argv.slice(2))), null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { parseArgs, runBackfill };
