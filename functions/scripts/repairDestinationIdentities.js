/* eslint-disable no-await-in-loop, no-console */
const admin = require('firebase-admin');
const { initializeAdmin } = require('./localCredentials');
const {
  destinationJobRef,
  IDENTITY_STRATEGY_VERSION,
  resolveAndPersistDestinationIdentity,
  resolveAndPersistDestinationImage,
} = require('../destinationImageService');

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function candidates(db) {
  const snapshot = await db.collectionGroup('destinations').where('status', '==', 'active').get();
  const output = [];
  for (const citySnapshot of snapshot.docs) {
    if (citySnapshot.data()?.identity?.sourceId) continue;
    const countryRef = citySnapshot.ref.parent.parent;
    if (!countryRef) continue;
    const job = (await destinationJobRef(db, countryRef.id, citySnapshot.id).get()).data() || {};
    const sync = job.identitySync || {};
    if (sync.strategyVersion >= IDENTITY_STRATEGY_VERSION && sync.state === 'needs_review') continue;
    output.push({ countryId: countryRef.id, cityId: citySnapshot.id });
  }
  return output;
}

async function run({ apply = false } = {}) {
  const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;
  if (apply && !unsplashKey) throw new Error('Set UNSPLASH_ACCESS_KEY before applying the repair.');
  initializeAdmin(admin);
  const db = admin.firestore();
  const pending = await candidates(db);
  if (!apply) {
    const result = { mode: 'dry-run', candidates: pending.length };
    console.log('Destination identity repair preview.', result);
    return result;
  }
  const result = { mode: 'apply', candidates: pending.length, resolved: 0, needsReview: 0, paused: false };
  for (const entry of pending) {
    const identity = await resolveAndPersistDestinationIdentity({ admin, ...entry });
    if (identity.state === 'ready') {
      result.resolved += 1;
      await resolveAndPersistDestinationImage({ admin, ...entry, unsplashKey, force: true });
    } else if (identity.state === 'needs_review') {
      result.needsReview += 1;
    } else if (identity.error?.status === 429) {
      result.paused = true;
      break;
    }
  }
  console.log('Destination identity repair complete.', result);
  return result;
}

async function runContinuously() {
  while (true) {
    const result = await run({ apply: true });
    if (!result.paused) return result;
    console.log('Wikidata rate limit reached; identity repair will resume automatically in 60 minutes.');
    await sleep(60 * 60 * 1000);
  }
}

if (require.main === module) {
  const task = process.argv.includes('--continuous') ? runContinuously() : run({ apply: process.argv.includes('--apply') });
  task.catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { candidates, run, runContinuously };
