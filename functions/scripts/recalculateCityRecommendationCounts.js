/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

function initAdmin() {
  // Prefer env var GOOGLE_APPLICATION_CREDENTIALS, fallback to a local file for convenience.
  const keyPath = path.join(__dirname, '..', 'serviceAccountKey.json');

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
    return;
  }

  if (fs.existsSync(keyPath)) {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    const serviceAccount = require(keyPath);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    return;
  }

  throw new Error(
    'Missing credentials. Set GOOGLE_APPLICATION_CREDENTIALS to a service-account JSON path, or place functions/serviceAccountKey.json'
  );
}

async function main() {
  initAdmin();

  const snap = await admin.firestore().collection('recommendations').get();
  const counts = new Map();

  snap.forEach((doc) => {
    const data = doc.data() || {};
    const countryId = data.countryId;
    const cityId = data.cityId;
    if (!countryId || !cityId) return;

    const key = `${countryId}/${cityId}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  console.log(`Found ${snap.size} recommendations across ${counts.size} city keys.`);

  const entries = Array.from(counts.entries());
  const batchSize = 400;

  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = admin.firestore().batch();
    const slice = entries.slice(i, i + batchSize);

    slice.forEach(([key, count]) => {
      const [countryId, cityId] = key.split('/');
      const cityRef = admin.firestore().doc(`countries/${countryId}/cities/${cityId}`);
      batch.set(
        cityRef,
        {
          recommendationsCount: count,
          recommendationsCountUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
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
