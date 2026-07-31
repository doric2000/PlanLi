/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const {
  legacyDestinationId,
} = require('../recommendationService');
const {
  resolveCountryMetadata,
} = require('../countryMetadata');

const MIGRATION_PATH = '_migrations/destinationSchemaCompatibilityV1';
const COUNTRY_FIELDS = ['name', 'code', 'region', 'currencyCode'];
const CITY_FIELDS = [
  'name',
  'description',
  'googlePlaceId',
  'rating',
  'travelers',
  'imageUrl',
  'coordinates',
];

function initializeAdmin() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
    return;
  }

  const keyPath = path.join(__dirname, '..', 'serviceAccountKey.json');
  if (!fs.existsSync(keyPath)) {
    throw new Error(
      'Missing Admin credentials. Set GOOGLE_APPLICATION_CREDENTIALS or provide functions/serviceAccountKey.json.'
    );
  }
  // eslint-disable-next-line import/no-dynamic-require, global-require
  admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) });
}

function pickDefined(data, fields) {
  return Object.fromEntries(
    fields
      .filter(
        (field) =>
          data &&
          Object.prototype.hasOwnProperty.call(data, field) &&
          data[field] !== undefined
      )
      .map((field) => [field, data[field]])
  );
}

function hasNewSchemaMarker(data) {
  return (
    Object.prototype.hasOwnProperty.call(data || {}, 'createdAt') ||
    Object.prototype.hasOwnProperty.call(data || {}, 'createdBy')
  );
}

async function listAffectedFavorites(db, mappings) {
  const sourceCountryIds = new Set(
    mappings.map((mapping) => mapping.sourceCountryId)
  );
  const sourceCityIds = new Set(
    mappings.flatMap((mapping) =>
      mapping.cities.map((city) => city.sourceCityId)
    )
  );
  const users = await db.collection('users').get();
  const favorites = [];
  for (const userDoc of users.docs) {
    // eslint-disable-next-line no-await-in-loop
    const snapshot = await userDoc.ref.collection('favorites').get();
    snapshot.docs.forEach((favoriteDoc) => {
      const data = favoriteDoc.data() || {};
      if (
        sourceCountryIds.has(data.countryId) ||
        sourceCityIds.has(data.id) ||
        sourceCityIds.has(favoriteDoc.id)
      ) {
        favorites.push({
          path: favoriteDoc.ref.path,
          data,
        });
      }
    });
  }
  return favorites;
}

function containsAffectedStructuredReference(value, mappings) {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) {
    return value.some((entry) =>
      containsAffectedStructuredReference(entry, mappings)
    );
  }
  return mappings.some((mapping) => {
    if (value.countryId === mapping.sourceCountryId) return true;
    return mapping.cities.some(
      (city) => value.cityId === city.sourceCityId
    );
  }) || Object.values(value).some((entry) =>
    containsAffectedStructuredReference(entry, mappings)
  );
}

async function buildMigrationPlan(db) {
  const countries = await db.collection('countries').get();
  const mappings = [];
  for (const countryDoc of countries.docs) {
    const countryData = countryDoc.data() || {};
    const targetCountryId = legacyDestinationId(countryData.name, 'country');
    if (
      !hasNewSchemaMarker(countryData) ||
      !targetCountryId ||
      targetCountryId === countryDoc.id
    ) {
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const metadata = await resolveCountryMetadata({
      countryCode: countryData.code,
      currentCurrencyCode: countryData.currencyCode,
      apiKey: process.env.REST_COUNTRIES_KEY || null,
    });
    // eslint-disable-next-line no-await-in-loop
    const citiesSnapshot = await countryDoc.ref.collection('cities').get();
    const cities = citiesSnapshot.docs.map((cityDoc) => {
      const cityData = cityDoc.data() || {};
      return {
        sourceCityId: cityDoc.id,
        targetCityId: legacyDestinationId(cityData.name, 'city'),
        sourceData: cityData,
        targetData: pickDefined(cityData, CITY_FIELDS),
      };
    });
    if (cities.some((city) => !city.targetCityId)) {
      throw new Error(`A city under ${countryDoc.ref.path} has no usable name.`);
    }

    // eslint-disable-next-line no-await-in-loop
    const recommendations = await db
      .collection('recommendations')
      .where('countryId', '==', countryDoc.id)
      .get();
    mappings.push({
      sourceCountryId: countryDoc.id,
      targetCountryId,
      sourceData: countryData,
      targetData: {
        ...pickDefined(countryData, COUNTRY_FIELDS),
        region: metadata.region,
        currencyCode: metadata.currencyCode,
      },
      metadataSource: metadata.source,
      cities,
      recommendations: recommendations.docs.map((recommendationDoc) => ({
        path: recommendationDoc.ref.path,
        sourceCityId: recommendationDoc.data()?.cityId || null,
      })),
    });
  }

  const favorites = await listAffectedFavorites(db, mappings);
  const routes = await db.collection('routes').get();
  const affectedRoutePaths = routes.docs
    .filter((routeDoc) =>
      containsAffectedStructuredReference(routeDoc.data(), mappings)
    )
    .map((routeDoc) => routeDoc.ref.path);

  return { mappings, favorites, affectedRoutePaths };
}

function summarize(plan) {
  return {
    countries: plan.mappings.map((mapping) => ({
      from: mapping.sourceCountryId,
      to: mapping.targetCountryId,
      metadataSource: mapping.metadataSource,
      cities: mapping.cities.map((city) => ({
        from: city.sourceCityId,
        to: city.targetCityId,
      })),
      recommendations: mapping.recommendations.length,
    })),
    favorites: plan.favorites.length,
    affectedRoutes: plan.affectedRoutePaths,
  };
}

async function validateTargets(db, plan) {
  for (const mapping of plan.mappings) {
    // eslint-disable-next-line no-await-in-loop
    const countryTarget = await db
      .doc(`countries/${mapping.targetCountryId}`)
      .get();
    if (
      countryTarget.exists &&
      countryTarget.data()?.code !== mapping.targetData.code
    ) {
      throw new Error(
        `Target countries/${mapping.targetCountryId} has a different ISO code.`
      );
    }
    for (const city of mapping.cities) {
      // eslint-disable-next-line no-await-in-loop
      const cityTarget = await db
        .doc(
          `countries/${mapping.targetCountryId}/cities/${city.targetCityId}`
        )
        .get();
      if (
        cityTarget.exists &&
        cityTarget.data()?.googlePlaceId &&
        city.targetData.googlePlaceId &&
        cityTarget.data().googlePlaceId !== city.targetData.googlePlaceId
      ) {
        throw new Error(
          `Target city ${mapping.targetCountryId}/${city.targetCityId} has a different Google Place ID.`
        );
      }
    }
  }
  if (plan.affectedRoutePaths.length > 0) {
    throw new Error(
      `Routes require a manual structured migration: ${plan.affectedRoutePaths.join(', ')}`
    );
  }
}

function findMappingForFavorite(plan, favorite) {
  const data = favorite.data || {};
  for (const mapping of plan.mappings) {
    if (data.countryId === mapping.sourceCountryId) {
      const city = mapping.cities.find(
        (candidate) =>
          candidate.sourceCityId === data.id ||
          favorite.path.endsWith(`/${candidate.sourceCityId}`)
      );
      return { mapping, city: city || null };
    }
  }
  return null;
}

async function applyMigration(db, plan, migrationRef, resume) {
  await validateTargets(db, plan);
  const existing = await migrationRef.get();
  if (existing.exists && !resume) {
    throw new Error(
      `Migration state already exists with status ${existing.data()?.status}. Use --resume.`
    );
  }

  await migrationRef.set(
    {
      version: 1,
      status: 'applying',
      plan,
      startedAt:
        existing.data()?.startedAt ||
        admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  const batch = db.batch();
  for (const mapping of plan.mappings) {
    const targetCountryRef = db.doc(`countries/${mapping.targetCountryId}`);
    batch.set(targetCountryRef, mapping.targetData, { merge: false });
    for (const city of mapping.cities) {
      const targetCityRef = targetCountryRef
        .collection('cities')
        .doc(city.targetCityId);
      batch.set(
        targetCityRef,
        {
          ...city.targetData,
          recommendationsCount: 0,
          recommendationsCountUpdatedAt:
            admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: false }
      );
    }
    for (const recommendation of mapping.recommendations) {
      const city = mapping.cities.find(
        (candidate) =>
          candidate.sourceCityId === recommendation.sourceCityId
      );
      if (!city) {
        throw new Error(
          `${recommendation.path} references an unknown city ${recommendation.sourceCityId}.`
        );
      }
      batch.update(db.doc(recommendation.path), {
        countryId: mapping.targetCountryId,
        cityId: city.targetCityId,
      });
    }
  }

  for (const favorite of plan.favorites) {
    const resolved = findMappingForFavorite(plan, favorite);
    if (!resolved) continue;
    const { mapping, city } = resolved;
    const sourceRef = db.doc(favorite.path);
    if (favorite.data.type === 'cities' && city) {
      const userPath = favorite.path.split('/').slice(0, 2).join('/');
      const targetRef = db.doc(
        `${userPath}/favorites/${city.targetCityId}`
      );
      batch.set(targetRef, {
        ...favorite.data,
        id: city.targetCityId,
        countryId: mapping.targetCountryId,
      });
      batch.delete(sourceRef);
    } else {
      batch.update(sourceRef, { countryId: mapping.targetCountryId });
    }
  }

  await batch.commit();
  await migrationRef.set(
    {
      status: 'applied',
      appliedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function verifyCleanupReady(db, plan) {
  const failures = [];
  for (const mapping of plan.mappings) {
    // eslint-disable-next-line no-await-in-loop
    const sourceRecommendations = await db
      .collection('recommendations')
      .where('countryId', '==', mapping.sourceCountryId)
      .get();
    if (!sourceRecommendations.empty) {
      failures.push(
        `${sourceRecommendations.size} recommendations still reference ${mapping.sourceCountryId}`
      );
    }

    for (const city of mapping.cities) {
      // eslint-disable-next-line no-await-in-loop
      const targetRecommendations = await db
        .collection('recommendations')
        .where('countryId', '==', mapping.targetCountryId)
        .get();
      const expectedCount = targetRecommendations.docs.filter(
        (doc) => doc.data()?.cityId === city.targetCityId
      ).length;
      // eslint-disable-next-line no-await-in-loop
      const targetCity = await db
        .doc(
          `countries/${mapping.targetCountryId}/cities/${city.targetCityId}`
        )
        .get();
      // eslint-disable-next-line no-await-in-loop
      const sourceCity = await db
        .doc(
          `countries/${mapping.sourceCountryId}/cities/${city.sourceCityId}`
        )
        .get();
      if (!targetCity.exists) {
        failures.push(`Target city ${city.targetCityId} is missing.`);
      } else if (targetCity.data()?.recommendationsCount !== expectedCount) {
        failures.push(
          `Target city ${city.targetCityId} count is ${targetCity.data()?.recommendationsCount}; expected ${expectedCount}.`
        );
      }
      if (
        sourceCity.exists &&
        Number(sourceCity.data()?.recommendationsCount || 0) !== 0
      ) {
        failures.push(
          `Source city ${city.sourceCityId} count has not reached zero.`
        );
      }
    }
  }

  const favorites = await listAffectedFavorites(db, plan.mappings);
  if (favorites.length > 0) {
    failures.push(`${favorites.length} favorites still reference source IDs.`);
  }
  const routes = await db.collection('routes').get();
  const affectedRoutes = routes.docs.filter((routeDoc) =>
    containsAffectedStructuredReference(routeDoc.data(), plan.mappings)
  );
  if (affectedRoutes.length > 0) {
    failures.push(`${affectedRoutes.length} routes still reference source IDs.`);
  }
  return failures;
}

async function cleanupMigration(db, migrationRef) {
  const migration = await migrationRef.get();
  if (!migration.exists) throw new Error('Migration state does not exist.');
  const state = migration.data() || {};
  if (!['applied', 'cleanup-blocked'].includes(state.status)) {
    throw new Error(`Cannot clean up migration in status ${state.status}.`);
  }
  const plan = state.plan;
  const failures = await verifyCleanupReady(db, plan);
  if (failures.length > 0) {
    await migrationRef.set(
      {
        status: 'cleanup-blocked',
        cleanupFailures: failures,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    throw new Error(`Cleanup blocked:\n- ${failures.join('\n- ')}`);
  }

  const batch = db.batch();
  for (const mapping of plan.mappings) {
    for (const city of mapping.cities) {
      batch.delete(
        db.doc(
          `countries/${mapping.sourceCountryId}/cities/${city.sourceCityId}`
        )
      );
    }
    batch.delete(db.doc(`countries/${mapping.sourceCountryId}`));
  }
  batch.set(
    migrationRef,
    {
      status: 'cleaned',
      cleanupFailures: [],
      cleanedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  await batch.commit();
}

async function main() {
  initializeAdmin();
  const db = admin.firestore();
  const migrationRef = db.doc(MIGRATION_PATH);
  const apply = process.argv.includes('--apply');
  const resume = process.argv.includes('--resume');
  const cleanup = process.argv.includes('--cleanup');
  if (cleanup && apply) {
    throw new Error('Use --apply and --cleanup as separate phases.');
  }

  if (cleanup) {
    await cleanupMigration(db, migrationRef);
    console.log('Cleanup completed.');
    return;
  }

  let plan;
  const existing = await migrationRef.get();
  if (resume && existing.exists && existing.data()?.plan) {
    plan = existing.data().plan;
  } else {
    plan = await buildMigrationPlan(db);
  }
  console.log(JSON.stringify(summarize(plan), null, 2));
  if (!apply) {
    console.log('DRY RUN only. Re-run with --apply to write changes.');
    return;
  }
  if (plan.mappings.length === 0) {
    console.log('No destination documents require migration.');
    return;
  }

  await applyMigration(db, plan, migrationRef, resume);
  console.log(
    'Apply completed. Source documents were retained. Run --cleanup only after counters settle.'
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
