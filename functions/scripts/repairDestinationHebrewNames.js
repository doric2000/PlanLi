/* eslint-disable no-await-in-loop, no-console */
const admin = require('firebase-admin');
const { initializeAdmin } = require('./localCredentials');
const { hasHebrewName, resolveHebrewDestinationName } = require('../destinationLocalizationService');
const { syncDestinationCatalog } = require('../destinationCatalogService');

function plannedHebrewRepair(document) {
  const destination = document.data() || {};
  const existing = destination.googleCache?.names?.he || destination.identity?.names?.he || '';
  if (hasHebrewName(existing)) return null;
  const localized = resolveHebrewDestinationName({
    countryCode: destination.googleCache?.countryCode || destination.identity?.countryCode || destination.countryId,
    googleHebrewName: destination.googleCache?.names?.he,
    englishName: destination.googleCache?.names?.en || destination.identity?.names?.en || destination.name,
    existingHebrewName: destination.identity?.names?.he,
  });
  if (!hasHebrewName(localized.name)) return { path: document.ref.path, state: 'unresolved' };
  return {
    path: document.ref.path,
    state: 'repair',
    name: localized.name,
    source: localized.source,
    destination,
  };
}

async function run({ apply = false, adminImpl = admin, syncCatalog = syncDestinationCatalog } = {}) {
  initializeAdmin(adminImpl);
  const snapshot = await adminImpl.firestore().collectionGroup('destinations')
    .where('status', '==', 'active').get();
  const plans = snapshot.docs.map(plannedHebrewRepair).filter(Boolean);
  const repairs = plans.filter((entry) => entry.state === 'repair');
  const unresolved = plans.filter((entry) => entry.state === 'unresolved');
  const result = {
    mode: apply ? 'apply' : 'dry-run',
    scanned: snapshot.size,
    repairCount: repairs.length,
    unresolvedCount: unresolved.length,
    sources: repairs.reduce((counts, entry) => ({
      ...counts,
      [entry.source]: Number(counts[entry.source] || 0) + 1,
    }), {}),
  };
  if (!apply) {
    console.log('Destination Hebrew-name repair preview.', result);
    return result;
  }
  if (unresolved.length) throw new Error(`Cannot apply: ${unresolved.length} destination names remain unresolved.`);
  for (const repair of repairs) {
    const ref = adminImpl.firestore().doc(repair.path);
    await ref.update({
      'googleCache.names.he': repair.name,
      'googleCache.nameSources.he': repair.source,
      updatedAt: adminImpl.firestore.FieldValue.serverTimestamp(),
    });
    const segments = repair.path.split('/');
    const city = {
      ...repair.destination,
      googleCache: {
        ...(repair.destination.googleCache || {}),
        names: { ...(repair.destination.googleCache?.names || {}), he: repair.name },
        nameSources: {
          ...(repair.destination.googleCache?.nameSources || {}),
          he: repair.source,
        },
      },
    };
    await syncCatalog({
      admin: adminImpl,
      countryId: segments[1],
      cityId: segments[3],
      city,
    });
  }
  console.log('Destination Hebrew-name repair complete.', result);
  return result;
}

if (require.main === module) {
  run({ apply: process.argv.includes('--apply') }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { plannedHebrewRepair, run };
