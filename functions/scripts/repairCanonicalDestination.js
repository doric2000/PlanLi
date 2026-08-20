/* eslint-disable no-await-in-loop, no-console */
const { execFileSync } = require('child_process');
const admin = require('firebase-admin');
const { initializeAdmin } = require('./localCredentials');
const { buildDestinationV3, destinationClaimId } = require('../destinationV3Service');
const { fetchBilingualPlace } = require('../placesProviderAdapter');
const { syncDestinationCatalog } = require('../destinationCatalogService');
const { hasHebrewName } = require('../destinationLocalizationService');

const DEFAULT_PROJECT_ID = 'planli-f0b12';
const MAX_REPAIR_WRITES = 350;

function parseArguments(argv) {
  const valueFor = (flag) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? String(argv[index + 1] || '').trim() : '';
  };
  return {
    apply: argv.includes('--apply'),
    countryId: valueFor('--country'),
    sourceCityId: valueFor('--source-city'),
    targetPlaceId: valueFor('--target-place-id'),
  };
}

function coordinatesFor(value) {
  const lat = Number(value?.lat ?? value?.latitude);
  const lng = Number(value?.lng ?? value?.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function pointInsideViewport(coordinates, viewport) {
  const point = coordinatesFor(coordinates);
  const southwest = coordinatesFor(viewport?.southwest);
  const northeast = coordinatesFor(viewport?.northeast);
  if (!point || !southwest || !northeast) return false;
  const insideLatitude = point.lat >= Math.min(southwest.lat, northeast.lat) &&
    point.lat <= Math.max(southwest.lat, northeast.lat);
  const insideLongitude = southwest.lng <= northeast.lng
    ? point.lng >= southwest.lng && point.lng <= northeast.lng
    : point.lng >= southwest.lng || point.lng <= northeast.lng;
  return insideLatitude && insideLongitude;
}

function destinationCoordinates(document) {
  const data = document.data() || {};
  return data.place?.coordinates || data.place?.googleCache?.coordinates || data.coordinates || null;
}

function referencePlan({ recommendations, stops, routes, trips, favorites, viewport }) {
  const validRecommendations = recommendations.filter((document) =>
    pointInsideViewport(destinationCoordinates(document), viewport)
  );
  const validStops = stops.filter((document) =>
    pointInsideViewport(destinationCoordinates(document), viewport)
  );
  const routeIdsWithStops = new Set(validStops.map((document) => document.ref.path.split('/')[1]));
  const invalidRoutes = routes.filter((document) => !routeIdsWithStops.has(document.id));
  return {
    validRecommendations,
    invalidRecommendations: recommendations.filter((document) => !validRecommendations.includes(document)),
    validStops,
    invalidStops: stops.filter((document) => !validStops.includes(document)),
    routes,
    invalidRoutes,
    trips,
    favorites,
    canRetireSource: trips.length === 0 && favorites.length === 0,
  };
}

function firebaseSecret(name, projectId = DEFAULT_PROJECT_ID) {
  if (!/^[A-Z0-9_]+$/.test(name) || !/^[a-z0-9-]+$/.test(projectId)) {
    throw new Error('Secret name or project ID is invalid.');
  }
  const output = process.platform === 'win32'
    ? execFileSync(process.env.ComSpec || 'cmd.exe', [
        '/d', '/s', '/c',
        `firebase.cmd functions:secrets:access ${name} --project ${projectId} --non-interactive`,
      ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    : execFileSync('firebase', [
        'functions:secrets:access', name, '--project', projectId, '--non-interactive',
      ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const value = output.split(/\r?\n/).map((line) => line.trim())
    .findLast((line) => /^AIza[0-9A-Za-z_-]+$/.test(line));
  if (!value) throw new Error(`Secret ${name} did not return an API key.`);
  return value;
}

function targetDestinationSummary(countryId, cityId, country, city) {
  return {
    countryId,
    cityId,
    countryName: country?.names?.he || country?.name || countryId,
    cityName: city?.googleCache?.names?.he || city?.name || cityId,
  };
}

function updatedRoute(route, countryId, sourceCityId, target) {
  const oldKey = `${countryId}:${sourceCityId}`;
  const newKey = `${countryId}:${target.cityId}`;
  const destinations = [];
  const seen = new Set();
  (route.destinations || []).forEach((destination) => {
    const next = destination?.countryId === countryId && destination?.cityId === sourceCityId
      ? { ...destination, ...target }
      : destination;
    const key = `${next?.countryId}:${next?.cityId}`;
    if (!seen.has(key)) {
      seen.add(key);
      destinations.push(next);
    }
  });
  return {
    destinations,
    destinationKeys: Array.from(new Set((route.destinationKeys || [])
      .map((key) => key === oldKey ? newKey : key))),
  };
}

function destinationStatsUpdate(city, recommendationCount, updatedAt) {
  return {
    stats: {
      ...(city?.stats || {}),
      recommendationCount,
    },
    updatedAt,
  };
}

async function removeLegacyDottedCountField(ref, snapshot, adminImpl) {
  if (!Object.prototype.hasOwnProperty.call(snapshot.data() || {}, 'stats.recommendationCount')) {
    return;
  }
  await ref.update(
    new adminImpl.firestore.FieldPath('stats.recommendationCount'),
    adminImpl.firestore.FieldValue.delete()
  );
}

async function commitUpdates(db, writes) {
  for (let offset = 0; offset < writes.length; offset += 400) {
    const batch = db.batch();
    writes.slice(offset, offset + 400).forEach(({ ref, data, options }) => {
      if (options?.create) batch.create(ref, data);
      else batch.set(ref, data, { merge: true });
    });
    await batch.commit();
  }
}

async function run({
  apply = false,
  countryId,
  sourceCityId,
  targetPlaceId,
  adminImpl = admin,
  newPlacesKey,
  fetchImpl = global.fetch,
  syncCatalog = syncDestinationCatalog,
} = {}) {
  if (!countryId || !sourceCityId || !targetPlaceId) {
    throw new Error('Provide --country, --source-city, and --target-place-id.');
  }
  initializeAdmin(adminImpl);
  const db = adminImpl.firestore();
  const providerKey = newPlacesKey || process.env.GOOGLE_PLACES_NEW_KEY ||
    firebaseSecret('GOOGLE_PLACES_NEW_KEY');
  const bilingual = await fetchBilingualPlace({
    provider: 'new', placeId: targetPlaceId, newPlacesKey: providerKey, fetchImpl,
  });
  const built = buildDestinationV3({ countryId, he: bilingual.he, en: bilingual.en });
  if (!['city', 'town', 'village'].includes(built.data.destinationType)) {
    throw new Error(`Target Google place is ${built.data.destinationType}, not a settlement.`);
  }
  if (String(built.data.googleCache.countryCode || '').toUpperCase() !== countryId.toUpperCase()) {
    throw new Error('Target Google place belongs to a different country.');
  }
  if (built.id === sourceCityId) throw new Error('Source and target destination are identical.');

  const sourcePath = `countries/${countryId}/destinations/${sourceCityId}`;
  const targetPath = `countries/${countryId}/destinations/${built.id}`;
  const [countrySnapshot, sourceSnapshot, targetSnapshot, recommendationSnapshot,
    stopSnapshot, routeSnapshot, tripSnapshot, favoriteSnapshot] = await Promise.all([
    db.doc(`countries/${countryId}`).get(),
    db.doc(sourcePath).get(),
    db.doc(targetPath).get(),
    db.collection('recommendations').where('destination.cityId', '==', sourceCityId).get(),
    // Route stops are nested below revisions. The beta corpus is bounded, and
    // scanning it avoids introducing a permanent single-field collection-group
    // index solely for this one-time repair path.
    db.collectionGroup('stops').get(),
    db.collection('routes').where('destinationKeys', 'array-contains', `${countryId}:${sourceCityId}`).get(),
    db.collection('trips').where('destination.cityId', '==', sourceCityId).get(),
    db.collectionGroup('favorites').where('target.path', '==', sourcePath).get(),
  ]);
  if (!countrySnapshot.exists || !sourceSnapshot.exists) throw new Error('Country or source destination does not exist.');
  if (targetSnapshot.exists && targetSnapshot.data()?.providerRefs?.googlePlaceId !== targetPlaceId) {
    throw new Error('Stable target destination ID already belongs to another Google place.');
  }
  const sameCountry = (document) => document.data()?.destination?.countryId === countryId;
  const plan = referencePlan({
    recommendations: recommendationSnapshot.docs.filter(sameCountry),
    stops: stopSnapshot.docs.filter((document) =>
      sameCountry(document) && document.data()?.destination?.cityId === sourceCityId
    ),
    routes: routeSnapshot.docs,
    trips: tripSnapshot.docs.filter(sameCountry),
    favorites: favoriteSnapshot.docs,
    viewport: built.data.googleCache.viewport,
  });
  const writeCount = plan.validRecommendations.length + plan.validStops.length +
    plan.routes.length + 4;
  const result = {
    mode: apply ? 'apply' : 'dry-run',
    countryId,
    sourceCityId,
    targetCityId: built.id,
    targetNameHe: built.data.googleCache.names.he,
    targetNameSource: built.data.googleCache.nameSources.he,
    recommendations: plan.validRecommendations.length,
    stops: plan.validStops.length,
    routes: plan.routes.length,
    blockingTrips: plan.trips.length,
    blockingFavorites: plan.favorites.length,
    invalidCoordinateReferences: plan.invalidRecommendations.length + plan.invalidStops.length,
    routesWithoutValidatedStops: plan.invalidRoutes.length,
    retireSource: plan.canRetireSource,
  };
  console.log('Canonical destination repair preview.', result);
  if (!apply) return result;
  if (plan.invalidRecommendations.length || plan.invalidStops.length || plan.invalidRoutes.length) {
    throw new Error('Cannot apply: one or more source references could not be coordinate-validated.');
  }
  if (writeCount > MAX_REPAIR_WRITES) {
    throw new Error(`Cannot apply more than ${MAX_REPAIR_WRITES} writes in one reviewed repair.`);
  }

  const now = adminImpl.firestore.FieldValue.serverTimestamp();
  const country = countrySnapshot.data() || {};
  const savedTarget = targetSnapshot.exists ? targetSnapshot.data() || {} : {};
  const keepSavedHebrew = hasHebrewName(savedTarget.googleCache?.names?.he);
  const targetCity = targetSnapshot.exists ? {
    ...savedTarget,
    googleCache: {
      ...(savedTarget.googleCache || {}),
      names: {
        ...(savedTarget.googleCache?.names || {}),
        he: keepSavedHebrew
          ? savedTarget.googleCache.names.he
          : built.data.googleCache.names.he,
        en: savedTarget.googleCache?.names?.en || built.data.googleCache.names.en,
      },
      nameSources: {
        ...(savedTarget.googleCache?.nameSources || {}),
        he: keepSavedHebrew
          ? savedTarget.googleCache?.nameSources?.he || 'existing'
          : built.data.googleCache.nameSources.he,
        en: savedTarget.googleCache?.nameSources?.en || 'google',
      },
    },
  } : built.data;
  const target = targetDestinationSummary(countryId, built.id, country, targetCity);
  const writes = [];
  if (!targetSnapshot.exists) {
    writes.push({
      ref: db.doc(targetPath),
      data: { ...built.data, createdAt: now, updatedAt: now },
      options: { create: true },
    });
    const claimId = destinationClaimId({
      countryId, type: built.data.destinationType, nameEn: built.data.googleCache.names.en,
    });
    writes.push({
      ref: db.doc(`system/runtime/destinationClaims/${claimId}`),
      data: {
        countryId,
        destinationType: built.data.destinationType,
        nameEn: built.data.googleCache.names.en,
        entries: { [built.id]: { providerPlaceId: targetPlaceId } },
        createdAt: now,
        updatedAt: now,
      },
    });
  } else if (!keepSavedHebrew) {
    writes.push({
      ref: db.doc(targetPath),
      data: {
        'googleCache.names.he': targetCity.googleCache.names.he,
        'googleCache.nameSources.he': targetCity.googleCache.nameSources.he,
        updatedAt: now,
      },
    });
  }
  plan.validRecommendations.forEach((document) => writes.push({
    ref: document.ref,
    data: {
      destination: { ...(document.data()?.destination || {}), ...target },
      updatedAt: now,
    },
  }));
  plan.validStops.forEach((document) => writes.push({
    ref: document.ref,
    data: {
      destination: { ...(document.data()?.destination || {}), ...target },
      updatedAt: now,
    },
  }));
  plan.routes.forEach((document) => writes.push({
    ref: document.ref,
    data: { ...updatedRoute(document.data() || {}, countryId, sourceCityId, target), updatedAt: now },
  }));
  await commitUpdates(db, writes);

  const [sourceActiveRecommendations, targetActiveRecommendations] = await Promise.all([
    db.collection('recommendations').where('destination.cityId', '==', sourceCityId)
      .where('status', '==', 'active').get(),
    db.collection('recommendations').where('destination.cityId', '==', built.id)
      .where('status', '==', 'active').get(),
  ]);
  const remainingSourceRecommendations = sourceActiveRecommendations.docs.filter(sameCountry).length;
  const targetRecommendationCount = targetActiveRecommendations.docs.filter(sameCountry).length;
  const retireSource = plan.canRetireSource && remainingSourceRecommendations === 0;
  const targetRef = db.doc(targetPath);
  const sourceRef = db.doc(sourcePath);
  await targetRef.set(
    destinationStatsUpdate(targetCity, targetRecommendationCount, now),
    { merge: true }
  );
  await sourceRef.set({
    ...destinationStatsUpdate(
      sourceSnapshot.data(),
      remainingSourceRecommendations,
      now
    ),
    ...(retireSource ? { status: 'inactive' } : {}),
  }, { merge: true });
  await removeLegacyDottedCountField(targetRef, targetSnapshot, adminImpl);
  await removeLegacyDottedCountField(sourceRef, sourceSnapshot, adminImpl);
  await syncCatalog({
    admin: adminImpl, countryId, cityId: built.id,
    city: { ...targetCity, stats: { ...(targetCity.stats || {}), recommendationCount: targetRecommendationCount } },
  });
  await syncCatalog({
    admin: adminImpl, countryId, cityId: sourceCityId,
    city: {
      ...(sourceSnapshot.data() || {}),
      stats: { ...(sourceSnapshot.data()?.stats || {}), recommendationCount: remainingSourceRecommendations },
      ...(retireSource ? { status: 'inactive' } : {}),
    },
  });
  const applied = { ...result, retireSource, targetRecommendationCount, remainingSourceRecommendations };
  console.log('Canonical destination repair complete.', applied);
  return applied;
}

if (require.main === module) {
  const args = parseArguments(process.argv.slice(2));
  run(args).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  destinationStatsUpdate,
  parseArguments,
  pointInsideViewport,
  referencePlan,
  run,
  updatedRoute,
};
