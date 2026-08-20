/* eslint-disable no-await-in-loop, no-console */
const admin = require('firebase-admin');
const { initializeAdmin } = require('./localCredentials');
const { hasHebrewName, resolveHebrewDestinationName } = require('../destinationLocalizationService');
const { startDestinationRename } = require('../destinationRenameService');

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

async function linkedContentPreview(db, countryId, cityId) {
  const [recommendations, routes, trips] = await Promise.all([
    db.collection('recommendations')
      .where('destination.countryId', '==', countryId)
      .where('destination.cityId', '==', cityId).count().get(),
    db.collection('routes')
      .where('destinationKeys', 'array-contains', `${countryId}:${cityId}`).count().get(),
    db.collection('trips')
      .where('destination.countryId', '==', countryId)
      .where('destination.cityId', '==', cityId).count().get(),
  ]);
  return {
    recommendations: recommendations.data().count,
    routes: routes.data().count,
    trips: trips.data().count,
  };
}

async function run({
  apply = false,
  adminImpl = admin,
  countryId,
  cityId,
  nameHe,
  reason = 'Destination Hebrew-name recovery',
  startRename = startDestinationRename,
  initialize = initializeAdmin,
} = {}) {
  initialize(adminImpl);
  const snapshot = await adminImpl.firestore().collectionGroup('destinations')
    .where('status', '==', 'active').get();
  const plans = snapshot.docs.map(plannedHebrewRepair).filter(Boolean)
    .filter((entry) => {
      const segments = entry.path.split('/');
      return (!countryId || segments[1] === countryId) && (!cityId || segments[3] === cityId);
    })
    .map((entry) => ({ ...entry, ...(nameHe ? { name: nameHe, source: 'admin' } : {}) }));
  const repairs = plans.filter((entry) => entry.state === 'repair');
  const unresolved = plans.filter((entry) => entry.state === 'unresolved');
  const plannedUpdates = [];
  for (const repair of repairs) {
    const segments = repair.path.split('/');
    plannedUpdates.push({
      countryId: segments[1],
      cityId: segments[3],
      nameHe: repair.name,
      source: apply ? 'admin' : repair.source,
      linked: await linkedContentPreview(adminImpl.firestore(), segments[1], segments[3]),
    });
  }
  const result = {
    mode: apply ? 'apply' : 'dry-run',
    scanned: snapshot.size,
    repairCount: repairs.length,
    unresolvedCount: unresolved.length,
    sources: repairs.reduce((counts, entry) => ({
      ...counts,
      [entry.source]: Number(counts[entry.source] || 0) + 1,
    }), {}),
    plannedUpdates,
  };
  if (!apply) {
    console.log('Destination Hebrew-name repair preview.', result);
    return result;
  }
  if (unresolved.length) throw new Error(`Cannot apply: ${unresolved.length} destination names remain unresolved.`);
  for (const repair of repairs) {
    const segments = repair.path.split('/');
    await startRename({
      admin: adminImpl,
      countryId: segments[1],
      cityId: segments[3],
      nameHe: repair.name,
      reason,
      requestedBy: 'maintenance_script',
    });
  }
  console.log('Destination Hebrew-name repair complete.', result);
  return result;
}

if (require.main === module) {
  const valueFor = (flag) => {
    const index = process.argv.indexOf(flag);
    return index >= 0 ? process.argv[index + 1] : undefined;
  };
  run({
    apply: process.argv.includes('--apply'),
    countryId: valueFor('--country'),
    cityId: valueFor('--city'),
    nameHe: valueFor('--name'),
    reason: valueFor('--reason') || 'Destination Hebrew-name recovery',
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { linkedContentPreview, plannedHebrewRepair, run };
