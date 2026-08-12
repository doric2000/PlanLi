const admin = require('firebase-admin');

const { syncDestinationCatalog } = require('../destinationCatalogService');
const { resolveAndPersistDestinationImage } = require('../destinationImageService');
const { initializeAdmin } = require('./localCredentials');

function argumentValues(name, argv = process.argv.slice(2)) {
  return argv.flatMap((value, index) => value === name && argv[index + 1] ? [argv[index + 1]] : []);
}

function parseOptions(argv = process.argv.slice(2)) {
  const limitIndex = argv.indexOf('--limit');
  const rawLimit = limitIndex >= 0 ? Number(argv[limitIndex + 1]) : 25;
  if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 100) {
    throw new Error('--limit must be an integer between 1 and 100.');
  }
  return {
    apply: argv.includes('--apply'),
    cityIds: new Set(argumentValues('--city', argv)),
    limit: rawLimit,
  };
}

function missingDestinationEntries(snapshot, cityIds = new Set()) {
  return (snapshot?.docs || []).filter((document) => {
    const data = document.data() || {};
    return (!cityIds.size || cityIds.has(document.id)) &&
      data.status === 'active' &&
      !data.destinationImage?.urls?.thumb;
  });
}

async function repairMissingDestinationImages({ db, options, unsplashKey, log = console.log }) {
  const snapshot = await db.collectionGroup('destinations').where('status', '==', 'active').get();
  const entries = missingDestinationEntries(snapshot, options.cityIds).slice(0, options.limit);
  const preview = entries.map((document) => ({
    path: document.ref.path,
    name: document.data()?.googleCache?.names?.en || document.data()?.googleCache?.names?.he || document.id,
  }));
  log('Missing destination image repair preview.', { apply: options.apply, count: preview.length, destinations: preview });
  if (!options.apply) return { scanned: snapshot.size, matched: entries.length, repaired: 0, results: [] };
  if (!unsplashKey) throw new Error('Set UNSPLASH_ACCESS_KEY before applying the repair.');

  const results = [];
  for (const document of entries) {
    const countryRef = document.ref.parent.parent;
    if (!countryRef) continue;
    const result = await resolveAndPersistDestinationImage({
      admin,
      countryId: countryRef.id,
      cityId: document.id,
      unsplashKey,
      force: true,
    });
    if (result.state === 'ready' && result.image?.urls?.thumb) {
      const updated = await document.ref.get();
      await syncDestinationCatalog({
        admin,
        countryId: countryRef.id,
        cityId: document.id,
        city: updated.data(),
      });
    }
    results.push({
      path: document.ref.path,
      state: result.state,
      outcome: result.outcome || null,
      source: result.image?.source?.type || null,
    });
  }
  return {
    scanned: snapshot.size,
    matched: entries.length,
    repaired: results.filter((entry) => entry.state === 'ready' && entry.source).length,
    results,
  };
}

async function main() {
  initializeAdmin(admin);
  const options = parseOptions();
  const result = await repairMissingDestinationImages({
    db: admin.firestore(),
    options,
    unsplashKey: process.env.UNSPLASH_ACCESS_KEY,
  });
  console.log('Missing destination image repair complete.', result);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  argumentValues,
  missingDestinationEntries,
  parseOptions,
  repairMissingDestinationImages,
};
