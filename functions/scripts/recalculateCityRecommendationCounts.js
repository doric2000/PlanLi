/* eslint-disable no-console */
const admin = require('firebase-admin');
const { initializeAdmin } = require('./localCredentials');

function initAdmin() {
  initializeAdmin(admin);
}

async function main() {
  initAdmin();

  const snap = await admin.firestore().collection('recommendations').get();
  const apply = process.argv.includes('--apply');
  const counts = new Map();

  snap.forEach((doc) => {
    const data = doc.data() || {};
    if (data.status !== 'active') return;
    const countryId = data.destination?.countryId;
    const cityId = data.destination?.cityId;
    if (!countryId || !cityId) return;

    const key = `${countryId}/${cityId}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  console.log(`Found ${snap.size} recommendations across ${counts.size} city keys.`);

  const countrySnapshot = await admin.firestore().collection('countries').get();
  const cityDocuments = [];
  for (const country of countrySnapshot.docs) {
    // eslint-disable-next-line no-await-in-loop
    const citySnapshot = await country.ref.collection('destinations').get();
    cityDocuments.push(...citySnapshot.docs);
  }
  const entries = cityDocuments.map((city) => {
    const key = `${city.ref.parent.parent.id}/${city.id}`;
    return [key, counts.get(key) || 0];
  });
  console.log(`${apply ? 'APPLY' : 'DRY RUN'}: ${entries.length} city counters.`);
  if (!apply) return;
  const batchSize = 400;

  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = admin.firestore().batch();
    const slice = entries.slice(i, i + batchSize);

    slice.forEach(([key, count]) => {
      const [countryId, cityId] = key.split('/');
      const cityRef = admin.firestore().doc(`countries/${countryId}/destinations/${cityId}`);
      batch.set(
        cityRef,
        {
          'stats.recommendationCount': count,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });

    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
    console.log(`Updated ${slice.length} cities (${Math.min(i + batchSize, entries.length)}/${entries.length})`);
  }

  console.log('✅ Done');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
