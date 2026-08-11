/* eslint-disable no-await-in-loop, no-console */
const admin = require('firebase-admin');
const { initializeAdmin } = require('./localCredentials');
const { syncDestinationCatalog } = require('../destinationCatalogService');

async function run({ apply = false } = {}) {
  initializeAdmin(admin);
  const snapshot = await admin.firestore()
    .collectionGroup('cities')
    .where('status', '==', 'active')
    .get();
  if (!apply) {
    const result = { mode: 'dry-run', activeCities: snapshot.size };
    console.log('Destination catalog backfill preview.', result);
    return result;
  }
  let updated = 0;
  for (const citySnapshot of snapshot.docs) {
    const countryRef = citySnapshot.ref.parent.parent;
    if (!countryRef) continue;
    await syncDestinationCatalog({
      admin,
      countryId: countryRef.id,
      cityId: citySnapshot.id,
      city: citySnapshot.data(),
    });
    updated += 1;
  }
  const result = { mode: 'apply', activeCities: snapshot.size, updated };
  console.log('Destination catalog backfill complete.', result);
  return result;
}

if (require.main === module) {
  run({ apply: process.argv.includes('--apply') }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { run };
