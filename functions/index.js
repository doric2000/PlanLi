const admin = require('firebase-admin');
const functions = require('firebase-functions');
const { onCall } = require('firebase-functions/v2/https');
const {
  onDocumentDeleted,
  onDocumentWritten,
} = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret, defineString } = require('firebase-functions/params');
const {
  deleteFavoritesForItem,
  FAVORITE_TYPES,
} = require('./favoriteCleanup');
const {
  buildAllowedMediaPrefixes,
  cleanupRemovedMedia,
} = require('./mediaCleanup');
const { syncPublicProfile } = require('./publicProfiles');
const {
  resolveRecommendationDestination,
  saveRecommendation,
} = require('./recommendationService');
const { syncCountryMetadata } = require('./countryMetadata');
const {
  cleanupPreparedMedia,
  markMediaClaimed,
  prepareMedia,
} = require('./mediaProcessor');

admin.initializeApp();
const googleMapsKey = defineSecret('GOOGLE_MAPS_KEY');
const restCountriesKey = defineSecret('REST_COUNTRIES_KEY');
const FIRESTORE_TRIGGER_REGION = 'europe-west1';
const mediaStorageBucket = defineString('MEDIA_STORAGE_BUCKET', {
  description: 'European Cloud Storage bucket used for PlanLi media.',
  default: 'planli-f0b12-media-eu',
});
const EUROPE_FUNCTION_OPTIONS = {
  region: FIRESTORE_TRIGGER_REGION,
};

function onFirestoreDocumentWritten(document, handler) {
  return onDocumentWritten(
    {
      document,
      region: FIRESTORE_TRIGGER_REGION,
    },
    handler
  );
}

async function updateCityRecommendationsCount({ countryId, cityId, delta }) {
  if (!countryId || !cityId || typeof delta !== 'number' || !Number.isFinite(delta) || delta === 0) return;

  const cityRef = admin.firestore().doc(`countries/${countryId}/cities/${cityId}`);
  await cityRef.set(
    {
      recommendationsCount: admin.firestore.FieldValue.increment(delta),
      recommendationsCountUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

function assertSignedIn(context) {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'You must be signed in to call this function.'
    );
  }
}

function assertCallerIsAdmin(context) {
  const isAdmin = context.auth?.token?.admin === true;
  if (!isAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin privileges required.');
  }
}

function normalizeBoolean(value, defaultValue = false) {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return defaultValue;
}

async function resolveTargetUid({ uid, email }) {
  if (typeof uid === 'string' && uid.trim()) return uid.trim();
  if (typeof email === 'string' && email.trim()) {
    const user = await admin.auth().getUserByEmail(email.trim());
    return user.uid;
  }
  throw new functions.https.HttpsError('invalid-argument', 'Provide either "uid" or "email".');
}

exports.setAdmin = functions
  .region(FIRESTORE_TRIGGER_REGION)
  .https.onCall(async (data, context) => {
  assertSignedIn(context);
  assertCallerIsAdmin(context);

  const uid = await resolveTargetUid({ uid: data?.uid, email: data?.email });
  const makeAdmin = normalizeBoolean(data?.admin, true);

  const targetUser = await admin.auth().getUser(uid);
  const existingClaims = targetUser.customClaims || {};

  const nextClaims = { ...existingClaims };
  if (makeAdmin) {
    nextClaims.admin = true;
  } else {
    delete nextClaims.admin;
  }

  await admin.auth().setCustomUserClaims(uid, nextClaims);

  return {
    ok: true,
    uid,
    admin: makeAdmin,
    // Caller info helps debugging
    actorUid: context.auth?.uid || null,
  };
  });

exports.setUserVerified = functions
  .region(FIRESTORE_TRIGGER_REGION)
  .https.onCall(async (data, context) => {
  assertSignedIn(context);
  assertCallerIsAdmin(context);

  const verified = data?.verified;
  if (typeof verified !== 'boolean') {
    throw new functions.https.HttpsError('invalid-argument', 'verified must be boolean.');
  }

  const uid = await resolveTargetUid({ uid: data?.uid, email: data?.email });
  await admin.auth().updateUser(uid, { emailVerified: verified });

  return {
    ok: true,
    uid,
    emailVerified: verified,
    actorUid: context.auth?.uid || null,
  };
  });

exports.saveRecommendation = onCall(
  {
    ...EUROPE_FUNCTION_OPTIONS,
    secrets: [googleMapsKey, restCountriesKey],
  },
  async (request) =>
    saveRecommendation({
      admin,
      auth: request.auth,
      data: request.data,
      mapsKey: googleMapsKey.value(),
      restCountriesKey: restCountriesKey.value(),
      mediaBucket: mediaStorageBucket.value(),
    })
);

exports.resolveRecommendationDestination = onCall(
  {
    ...EUROPE_FUNCTION_OPTIONS,
    secrets: [googleMapsKey, restCountriesKey],
  },
  async (request) =>
    resolveRecommendationDestination({
      admin,
      auth: request.auth,
      data: request.data,
      mapsKey: googleMapsKey.value(),
      restCountriesKey: restCountriesKey.value(),
    })
);

exports.prepareMedia = onCall(
  {
    ...EUROPE_FUNCTION_OPTIONS,
    memory: '1GiB',
    concurrency: 1,
    timeoutSeconds: 120,
  },
  async (request) =>
    prepareMedia({
      admin,
      auth: request.auth,
      data: request.data,
      mediaBucket: mediaStorageBucket.value(),
    })
);

exports.syncCountryMetadataScheduled = onSchedule(
  {
    schedule: 'every monday 03:00',
    timeZone: 'Asia/Jerusalem',
    region: FIRESTORE_TRIGGER_REGION,
    secrets: [restCountriesKey],
  },
  async () => {
    const result = await syncCountryMetadata({
      admin,
      apiKey: restCountriesKey.value(),
      apply: true,
    });
    console.log('Country metadata sync complete.', {
      processed: result.processed,
      changed: result.changed,
      failed: result.failed,
    });
    if (result.failed > 0) {
      console.warn('Some country metadata entries failed to sync.', {
        failures: result.results
          .filter((entry) => entry.error)
          .map((entry) => ({ code: entry.code, error: entry.error })),
      });
    }
  }
);

exports.cleanupPreparedMediaScheduled = onSchedule(
  {
    schedule: 'every day 04:00',
    timeZone: 'Asia/Jerusalem',
    region: FIRESTORE_TRIGGER_REGION,
    memory: '512MiB',
    timeoutSeconds: 300,
  },
  async () => {
    const result = await cleanupPreparedMedia({
      admin,
      mediaBucket: mediaStorageBucket.value(),
    });
    console.log('Prepared media cleanup complete.', result);
  }
);

// Keep an aggregated recommendations count on each city doc.
// City docs live at: countries/{countryId}/cities/{cityId}
// Recommendations contain: { countryId, cityId, ... }
exports.onRecommendationWrite = onFirestoreDocumentWritten(
  'recommendations/{recommendationId}',
  async (event) => {
    const change = event.data;
    if (!change) return;
    const before = change.before.exists ? change.before.data() : null;
    const after = change.after.exists ? change.after.data() : null;

    // Create
    if (!before && after) {
      await updateCityRecommendationsCount({
        countryId: after.countryId,
        cityId: after.cityId,
        delta: 1,
      });
      return;
    }

    // Delete
    if (before && !after) {
      await updateCityRecommendationsCount({
        countryId: before.countryId,
        cityId: before.cityId,
        delta: -1,
      });
      return;
    }

    // Update (handle city change)
    if (before && after) {
      const beforeKey = `${before.countryId || ''}/${before.cityId || ''}`;
      const afterKey = `${after.countryId || ''}/${after.cityId || ''}`;
      if (beforeKey !== afterKey) {
        await updateCityRecommendationsCount({
          countryId: before.countryId,
          cityId: before.cityId,
          delta: -1,
        });
        await updateCityRecommendationsCount({
          countryId: after.countryId,
          cityId: after.cityId,
          delta: 1,
        });
      }
    }
  }
);

exports.onRecommendationMediaCleanup = onFirestoreDocumentWritten(
  'recommendations/{recommendationId}',
  async (event) => {
    const change = event.data;
    if (!change) return;
    const before = change.before.exists ? change.before.data() : null;
    const after = change.after.exists ? change.after.data() : null;
    const allowedPrefixes = buildAllowedMediaPrefixes(
      'recommendations',
      event.params.recommendationId,
      before || after
    );
    await cleanupRemovedMedia(admin, before, after, {
      allowedPrefixes,
      bucketName: mediaStorageBucket.value(),
    });
    if (after) {
      await markMediaClaimed(admin, after, mediaStorageBucket.value());
    }
  }
);

exports.onRouteMediaCleanup = onFirestoreDocumentWritten(
  'routes/{routeId}',
  async (event) => {
    const change = event.data;
    if (!change) return;
    const before = change.before.exists ? change.before.data() : null;
    const after = change.after.exists ? change.after.data() : null;
    const allowedPrefixes = buildAllowedMediaPrefixes(
      'routes',
      event.params.routeId,
      before || after
    );
    await cleanupRemovedMedia(admin, before, after, {
      allowedPrefixes,
      bucketName: mediaStorageBucket.value(),
    });
    if (after) {
      await markMediaClaimed(admin, after, mediaStorageBucket.value());
    }
  }
);

exports.onUserMediaCleanup = onFirestoreDocumentWritten(
  'users/{userId}',
  async (event) => {
    const change = event.data;
    if (!change) return;
    const before = change.before.exists ? change.before.data() : null;
    const after = change.after.exists ? change.after.data() : null;
    const allowedPrefixes = buildAllowedMediaPrefixes(
      'users',
      event.params.userId,
      before || after
    );
    await cleanupRemovedMedia(admin, before, after, {
      allowedPrefixes,
      bucketName: mediaStorageBucket.value(),
    });
    if (after) {
      await markMediaClaimed(admin, after, mediaStorageBucket.value());
    }
  }
);

exports.onPublicProfileSync = onFirestoreDocumentWritten(
  'users/{userId}',
  async (event) => {
    const change = event.data;
    if (!change) return;
    const after = change.after.exists ? change.after.data() : null;
    await syncPublicProfile(admin, event.params.userId, after);
  }
);

function onFirestoreDocumentDeleted(document, handler) {
  return onDocumentDeleted(
    {
      document,
      region: FIRESTORE_TRIGGER_REGION,
      retry: true,
    },
    handler
  );
}

exports.onRecommendationFavoriteCleanup = onFirestoreDocumentDeleted(
  'recommendations/{recommendationId}',
  async (event) =>
    deleteFavoritesForItem({
      firestore: admin.firestore(),
      type: FAVORITE_TYPES.recommendation,
      itemId: event.params.recommendationId,
    })
);

exports.onRouteFavoriteCleanup = onFirestoreDocumentDeleted(
  'routes/{routeId}',
  async (event) =>
    deleteFavoritesForItem({
      firestore: admin.firestore(),
      type: FAVORITE_TYPES.route,
      itemId: event.params.routeId,
    })
);

exports.onCityFavoriteCleanup = onFirestoreDocumentDeleted(
  'countries/{countryId}/cities/{cityId}',
  async (event) =>
    deleteFavoritesForItem({
      firestore: admin.firestore(),
      type: FAVORITE_TYPES.city,
      itemId: event.params.cityId,
      countryId: event.params.countryId,
    })
);
