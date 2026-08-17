/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const { isPublicProfileEligible, sanitizePublicProfile } = require('../publicProfiles');
const { initializeAdmin } = require('./localCredentials');

const PAGE_SIZE = 400;
const DEFAULT_STATE_DIR = path.join(__dirname, '..', '.public-profiles-backfill');

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : null;
}

function parseArgs(argv) {
  const parsedLimit = Number.parseInt(valueAfter(argv, '--limit'), 10);
  return {
    apply: argv.includes('--apply'),
    resume: argv.includes('--resume'),
    limit: Number.isFinite(parsedLimit) && parsedLimit > 0
      ? parsedLimit
      : Number.POSITIVE_INFINITY,
    stateDir: path.resolve(valueAfter(argv, '--state-dir') || DEFAULT_STATE_DIR),
  };
}

function initAdmin() {
  initializeAdmin(admin);
}

function writeState(stateDir, value) {
  fs.mkdirSync(stateDir, { recursive: true });
  const filePath = path.join(stateDir, 'state.json');
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  try {
    fs.renameSync(temporary, filePath);
  } catch (error) {
    if (!['EEXIST', 'EPERM'].includes(error.code)) throw error;
    fs.copyFileSync(temporary, filePath);
    fs.unlinkSync(temporary);
  }
}

async function runBackfill({ apply, resume, limit, stateDir }) {
  const db = admin.firestore();
  const statePath = path.join(stateDir, 'state.json');
  const state = resume && fs.existsSync(statePath)
    ? JSON.parse(fs.readFileSync(statePath, 'utf8'))
    : {};
  let lastId = state.lastUserId || null;
  let processed = 0;

  while (processed < limit) {
    const pageLimit = Math.min(PAGE_SIZE, limit - processed);
    let query = db.collection('users')
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(pageLimit);
    if (lastId) query = query.startAfter(lastId);
    const snapshot = await query.get();
    if (snapshot.empty) break;

    if (apply) {
      const batch = db.batch();
      snapshot.docs.forEach((userDoc) => {
        const publicRef = db.doc(`publicProfiles/${userDoc.id}`);
        const data = userDoc.data();
        if (isPublicProfileEligible(data)) {
          batch.set(publicRef, {
            ...sanitizePublicProfile(userDoc.id, data),
            status: 'active',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        } else {
          batch.delete(publicRef);
        }
      });
      await batch.commit();
    }

    processed += snapshot.size;
    lastId = snapshot.docs[snapshot.docs.length - 1].id;
    if (apply) writeState(stateDir, {
      lastUserId: lastId,
      processed: Number(state.processed || 0) + processed,
      complete: snapshot.size < pageLimit,
      updatedAt: new Date().toISOString(),
    });
    if (snapshot.size < pageLimit) break;
  }

  return { mode: apply ? 'apply' : 'dry-run', processed, lastUserId: lastId };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  initAdmin();
  console.log(JSON.stringify(await runBackfill(options), null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { parseArgs, runBackfill };
