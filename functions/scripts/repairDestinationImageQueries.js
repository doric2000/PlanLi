/* eslint-disable no-await-in-loop, no-console */
const admin = require('firebase-admin');
const { initializeAdmin } = require('./localCredentials');
const {
  destinationJobRef,
  destinationQuery,
  resolveAndPersistDestinationImage,
} = require('../destinationImageService');

async function candidates(db) {
  const snapshot = await db.collectionGroup('cities').where('status', '==', 'active').get();
  const output = [];
  for (const citySnapshot of snapshot.docs) {
    const city = citySnapshot.data() || {};
    if (!city.identity?.names?.en || city.destinationImage?.source?.type === 'unsplash') continue;
    const countryRef = citySnapshot.ref.parent.parent;
    if (!countryRef) continue;
    const country = (await countryRef.get()).data() || {};
    const query = destinationQuery(city, country);
    const job = (await destinationJobRef(db, countryRef.id, citySnapshot.id).get()).data() || {};
    const imageSync = job.imageSync || {};
    if (imageSync.query === query && imageSync.unsplashOutcome === 'no_match') continue;
    output.push({
      countryId: countryRef.id,
      cityId: citySnapshot.id,
      query,
      currentSource: city.destinationImage?.source?.type || 'none',
    });
  }
  return output;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function run({ apply = false } = {}) {
  const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;
  if (apply && !unsplashKey) throw new Error('Set UNSPLASH_ACCESS_KEY before applying the repair.');
  initializeAdmin(admin);
  const db = admin.firestore();
  const pending = await candidates(db);
  if (!apply) {
    const result = { mode: 'dry-run', candidates: pending.length, queries: pending };
    console.log('Destination image query repair preview.', result);
    return result;
  }
  const result = { mode: 'apply', candidates: pending.length, unsplash: 0, recommendation: 0, none: 0, paused: false };
  for (const entry of pending) {
    await destinationJobRef(db, entry.countryId, entry.cityId).set({
      imageSync: {
        state: 'pending',
        attempts: 0,
        query: entry.query,
        lastErrorCode: admin.firestore.FieldValue.delete(),
        nextAttemptAt: admin.firestore.FieldValue.delete(),
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    const selection = await resolveAndPersistDestinationImage({
      admin,
      countryId: entry.countryId,
      cityId: entry.cityId,
      unsplashKey,
      force: true,
    });
    if (selection?.image?.source?.type === 'unsplash') result.unsplash += 1;
    else if (selection?.image?.source?.type === 'recommendation') result.recommendation += 1;
    else result.none += 1;
    if (selection?.error?.status === 429) {
      result.paused = true;
      break;
    }
  }
  console.log('Destination image query repair complete.', result);
  return result;
}

async function runContinuously() {
  while (true) {
    const result = await run({ apply: true });
    if (!result.paused) return result;
    const delayMs = 60 * 60 * 1000;
    console.log('Unsplash rate limit reached; repair will resume automatically in 60 minutes.');
    await sleep(delayMs);
  }
}

if (require.main === module) {
  const task = process.argv.includes('--continuous')
    ? runContinuously()
    : run({ apply: process.argv.includes('--apply') });
  task.catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { candidates, run, runContinuously };
