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
    output.push({
      countryId: countryRef.id,
      cityId: citySnapshot.id,
      query: destinationQuery(city, country),
      currentSource: city.destinationImage?.source?.type || 'none',
    });
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

if (require.main === module) {
  run({ apply: process.argv.includes('--apply') }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { candidates, run };
