const admin = require('firebase-admin');
const { onCall } = require('firebase-functions/v2/https');
const { onDocumentCreated, onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret, defineString } = require('firebase-functions/params');
const {
  buildAllowedMediaPrefixes,
  cleanupRemovedMedia,
} = require('./mediaCleanup');
const { publicProfileProjectionChanged, syncPublicProfile } = require('./publicProfiles');
const {
  resolveRecommendationDestination,
  saveRecommendation,
} = require('./recommendationService');
const { cleanupRouteRevisions, loadRouteDetails, saveRoute } = require('./routeService');
const { saveTrip } = require('./tripService');
const { registerUser, updateProfile } = require('./profileService');
const {
  getPersonalizedRecommendations,
  getPersonalizedRoutes,
  recordDiscoverySignal,
  resetPersonalizationActivity,
} = require('./personalizationService');
const { getMapRecommendations } = require('./mapRecommendationsService');
const { consumePublicReadBudget } = require('./publicRateLimitService');
const {
  PROVIDER_CALLABLE_LIMITS,
  PROVIDER_ROUTE_CALLABLE_LIMITS,
} = require('./providerRateLimitService');
const {
  resolvePlaceSelection,
  searchPlaces,
} = require('./placesGatewayService');
const { cleanupExpiredRuntimeDocuments } = require('./runtimeCleanupService');
const {
  hasUsableDestinationCache,
  refreshDestinationCaches,
  refreshExactPlaceCaches,
} = require('./destinationCacheService');
const {
  cleanupOrphanFavorites,
  clearNotifications,
  deleteComment,
  deleteNotification,
  getReactionState,
  refreshFavoriteOwnerPreviews,
  refreshFavoritesForTarget,
  saveComment,
  setFavorite,
  setNotificationRead,
  setReaction,
} = require('./socialService');
const { deleteContent, requestAccountDeletion } = require('./deletionService');
const { syncCountryMetadata } = require('./countryMetadata');
const { syncAirportFacts } = require('./airportFacts');
const { getDestinationOverview } = require('./destinationOverviewService');
const {
  searchDestinations,
  syncCountryDestinationCatalog,
  syncDestinationCatalog,
} = require('./destinationCatalogService');
const {
  repairPendingDestinationImages,
  resolveAndPersistDestinationImage,
  syncDestinationImagesForRecommendationChange,
} = require('./destinationImageService');
const {
  cleanupPreparedMedia,
  markMediaClaimed,
  prepareMedia,
} = require('./mediaProcessor');

admin.initializeApp();

const REGION = 'europe-west1';
const CORE_SERVICE_ACCOUNT =
  'planli-core-functions@planli-f0b12.iam.gserviceaccount.com';
const MEDIA_SERVICE_ACCOUNT =
  'planli-media-functions@planli-f0b12.iam.gserviceaccount.com';
const googleMapsKey = defineSecret('GOOGLE_MAPS_KEY');
const restCountriesKey = defineSecret('REST_COUNTRIES_KEY');
const openWeatherKey = defineSecret('OPENWEATHER_API_KEY');
const unsplashAccessKey = defineSecret('UNSPLASH_ACCESS_KEY');
const publicRateLimitKey = defineSecret('PUBLIC_RATE_LIMIT_KEY');
const mediaStorageBucket = defineString('MEDIA_STORAGE_BUCKET', {
  description: 'European Cloud Storage bucket used for PlanLi media.',
  default: 'planli-f0b12-media-eu',
});
// Keep false for Expo Go/local debug. Set PLANLI_ENFORCE_APP_CHECK=true only
// after App Check providers and debug tokens are configured on every client.
const ENFORCE_APP_CHECK = process.env.PLANLI_ENFORCE_APP_CHECK === 'true';
const CALLABLE_OPTIONS = {
  region: REGION,
  enforceAppCheck: ENFORCE_APP_CHECK,
  serviceAccount: CORE_SERVICE_ACCOUNT,
};

function callable(options, handler) {
  return onCall({ ...CALLABLE_OPTIONS, ...options }, handler);
}

function firestoreWritten(document, handler, options = {}) {
  return onDocumentWritten({
    document,
    region: REGION,
    retry: true,
    serviceAccount: CORE_SERVICE_ACCOUNT,
    ...options,
  }, handler);
}

function firestoreCreated(document, handler, options = {}) {
  return onDocumentCreated({
    document,
    region: REGION,
    retry: true,
    serviceAccount: CORE_SERVICE_ACCOUNT,
    ...options,
  }, handler);
}

exports.saveRecommendation = callable(
  {
    secrets: [googleMapsKey, restCountriesKey, publicRateLimitKey],
    timeoutSeconds: 120,
    ...PROVIDER_CALLABLE_LIMITS,
  },
  (request) => saveRecommendation({
    admin,
    auth: request.auth,
    data: request.data,
    mapsKey: googleMapsKey.value(),
    restCountriesKey: restCountriesKey.value(),
    mediaBucket: mediaStorageBucket.value(),
    providerRateLimitKey: publicRateLimitKey.value(),
  })
);

exports.resolveRecommendationDestination = callable(
  {
    secrets: [googleMapsKey, restCountriesKey, publicRateLimitKey],
    timeoutSeconds: 30,
    ...PROVIDER_CALLABLE_LIMITS,
  },
  (request) => resolveRecommendationDestination({
    admin,
    auth: request.auth,
    data: request.data,
    mapsKey: googleMapsKey.value(),
    restCountriesKey: restCountriesKey.value(),
    providerRateLimitKey: publicRateLimitKey.value(),
  })
);

exports.searchPlaces = callable(
  {
    secrets: [googleMapsKey, publicRateLimitKey],
    timeoutSeconds: 30,
    ...PROVIDER_CALLABLE_LIMITS,
  },
  (request) => searchPlaces({
    admin,
    auth: request.auth,
    data: request.data,
    mapsKey: googleMapsKey.value(),
    providerRateLimitKey: publicRateLimitKey.value(),
  })
);

exports.resolvePlaceSelection = callable(
  {
    secrets: [googleMapsKey, publicRateLimitKey],
    timeoutSeconds: 30,
    ...PROVIDER_CALLABLE_LIMITS,
  },
  (request) => resolvePlaceSelection({
    admin,
    auth: request.auth,
    data: request.data,
    mapsKey: googleMapsKey.value(),
    providerRateLimitKey: publicRateLimitKey.value(),
  })
);

exports.saveRoute = callable(
  {
    timeoutSeconds: 300,
    memory: '1GiB',
    secrets: [googleMapsKey, restCountriesKey, publicRateLimitKey],
    ...PROVIDER_ROUTE_CALLABLE_LIMITS,
  },
  (request) => saveRoute({
    admin,
    auth: request.auth,
    data: request.data,
    mediaBucket: mediaStorageBucket.value(),
    mapsKey: googleMapsKey.value(),
    restCountriesKey: restCountriesKey.value(),
    providerRateLimitKey: publicRateLimitKey.value(),
  })
);

exports.loadRouteDetails = callable(
  { timeoutSeconds: 30, secrets: [publicRateLimitKey] },
  async (request) => {
    await consumePublicReadBudget({
      admin,
      auth: request.auth,
      request,
      action: 'routeDetails',
      key: publicRateLimitKey.value(),
    });
    return loadRouteDetails({ admin, data: request.data });
  }
);

exports.saveTrip = callable(
  { timeoutSeconds: 120, memory: '1GiB' },
  (request) => saveTrip({
    admin,
    auth: request.auth,
    data: request.data,
    mediaBucket: mediaStorageBucket.value(),
  })
);

exports.setFavorite = callable({}, (request) =>
  setFavorite({ admin, auth: request.auth, data: request.data })
);
exports.setReaction = callable({}, (request) =>
  setReaction({ admin, auth: request.auth, data: request.data })
);
exports.getReactionState = callable({}, (request) =>
  getReactionState({ admin, auth: request.auth, data: request.data })
);
exports.saveComment = callable({}, (request) =>
  saveComment({ admin, auth: request.auth, data: request.data })
);
exports.deleteComment = callable({}, (request) =>
  deleteComment({ admin, auth: request.auth, data: request.data })
);
exports.setNotificationRead = callable({}, (request) =>
  setNotificationRead({ admin, auth: request.auth, data: request.data })
);
exports.clearNotifications = callable({}, (request) =>
  clearNotifications({ admin, auth: request.auth })
);
exports.deleteNotification = callable({}, (request) =>
  deleteNotification({ admin, auth: request.auth, data: request.data })
);

exports.registerUser = callable({ serviceAccount: MEDIA_SERVICE_ACCOUNT }, (request) =>
  registerUser({ admin, auth: request.auth, data: request.data })
);
exports.updateProfile = callable(
  { timeoutSeconds: 60, serviceAccount: MEDIA_SERVICE_ACCOUNT },
  (request) => updateProfile({
    admin,
    auth: request.auth,
    data: request.data,
    mediaBucket: mediaStorageBucket.value(),
  })
);

exports.getPersonalizedRecommendations = callable(
  { timeoutSeconds: 30, secrets: [publicRateLimitKey] },
  async (request) => {
    await consumePublicReadBudget({ admin, auth: request.auth, request, action: 'discovery', key: publicRateLimitKey.value() });
    return getPersonalizedRecommendations({ admin, auth: request.auth, data: request.data });
  }
);

exports.getMapRecommendations = callable(
  { timeoutSeconds: 30, memory: '512MiB', secrets: [publicRateLimitKey] },
  async (request) => {
    await consumePublicReadBudget({ admin, auth: request.auth, request, action: 'map', key: publicRateLimitKey.value() });
    return getMapRecommendations({ admin, auth: request.auth, data: request.data });
  }
);

exports.getPersonalizedRoutes = callable(
  { timeoutSeconds: 30, secrets: [publicRateLimitKey] },
  async (request) => {
    await consumePublicReadBudget({ admin, auth: request.auth, request, action: 'discovery', key: publicRateLimitKey.value() });
    return getPersonalizedRoutes({ admin, auth: request.auth, data: request.data });
  }
);

exports.getDestinationOverview = callable(
  { timeoutSeconds: 30, secrets: [openWeatherKey, publicRateLimitKey] },
  async (request) => {
    await consumePublicReadBudget({ admin, auth: request.auth, request, action: 'destinationOverview', key: publicRateLimitKey.value() });
    return getDestinationOverview({ admin, data: request.data, weatherApiKey: openWeatherKey.value() });
  }
);

exports.searchDestinations = callable(
  { timeoutSeconds: 20, secrets: [publicRateLimitKey] },
  async (request) => {
    await consumePublicReadBudget({ admin, auth: request.auth, request, action: 'discovery', key: publicRateLimitKey.value() });
    return searchDestinations({ admin, data: request.data });
  }
);

exports.recordDiscoverySignal = callable({}, (request) =>
  recordDiscoverySignal({ admin, auth: request.auth, data: request.data })
);

exports.resetPersonalizationActivity = callable({}, (request) =>
  resetPersonalizationActivity({ admin, auth: request.auth })
);

exports.deleteContent = callable(
  {
    timeoutSeconds: 300,
    memory: '1GiB',
    consumeAppCheckToken: ENFORCE_APP_CHECK,
    serviceAccount: MEDIA_SERVICE_ACCOUNT,
  },
  (request) => deleteContent({
    admin,
    auth: request.auth,
    data: request.data,
    mediaBucket: mediaStorageBucket.value(),
  })
);

exports.requestAccountDeletion = callable(
  {
    timeoutSeconds: 540,
    memory: '1GiB',
    consumeAppCheckToken: ENFORCE_APP_CHECK,
    serviceAccount: MEDIA_SERVICE_ACCOUNT,
  },
  (request) => requestAccountDeletion({
    admin,
    auth: request.auth,
    mediaBucket: mediaStorageBucket.value(),
  })
);

exports.prepareMedia = callable(
  {
    memory: '1GiB',
    concurrency: 1,
    timeoutSeconds: 120,
    serviceAccount: MEDIA_SERVICE_ACCOUNT,
  },
  (request) => prepareMedia({
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
    region: REGION,
    secrets: [restCountriesKey],
    serviceAccount: CORE_SERVICE_ACCOUNT,
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
  }
);

exports.syncAirportFactsScheduled = onSchedule(
  {
    schedule: 'every monday 02:00',
    timeZone: 'Asia/Jerusalem',
    region: REGION,
    memory: '512MiB',
    timeoutSeconds: 540,
    serviceAccount: CORE_SERVICE_ACCOUNT,
  },
  async () => {
    const result = await syncAirportFacts({ admin, apply: true });
    console.log('Airport facts sync complete.', {
      airports: result.airports,
      processed: result.processed,
      changed: result.changed,
      sourceUpdatedAt: result.sourceUpdatedAt,
    });
  }
);

exports.cleanupPreparedMediaScheduled = onSchedule(
  {
    schedule: 'every day 04:00',
    timeZone: 'Asia/Jerusalem',
    region: REGION,
    memory: '512MiB',
    timeoutSeconds: 300,
    serviceAccount: MEDIA_SERVICE_ACCOUNT,
  },
  async () => {
    const result = await cleanupPreparedMedia({
      admin,
      mediaBucket: mediaStorageBucket.value(),
    });
    console.log('Prepared media cleanup complete.', result);
  }
);

exports.cleanupOrphanFavoritesScheduled = onSchedule(
  {
    schedule: 'every day 05:00',
    timeZone: 'Asia/Jerusalem',
    region: REGION,
    timeoutSeconds: 300,
    serviceAccount: CORE_SERVICE_ACCOUNT,
  },
  async () => {
    const result = await cleanupOrphanFavorites({ admin, limit: 500 });
    console.log('Favorite integrity cleanup complete.', result);
  }
);

exports.cleanupExpiredRuntimeScheduled = onSchedule(
  {
    schedule: 'every day 05:30',
    timeZone: 'Asia/Jerusalem',
    region: REGION,
    timeoutSeconds: 300,
    serviceAccount: CORE_SERVICE_ACCOUNT,
  },
  async () => {
    const [runtime, revisions] = await Promise.all([
      cleanupExpiredRuntimeDocuments({ admin, limit: 200 }),
      cleanupRouteRevisions({ admin, limit: 100 }),
    ]);
    console.log('Expired runtime cleanup complete.', { runtime, revisions });
  }
);

async function handleMediaCleanup(event, collectionName) {
  const change = event.data;
  if (!change) return;
  const before = change.before.exists ? change.before.data() : null;
  const after = change.after.exists ? change.after.data() : null;
  const documentId =
    event.params.recommendationId || event.params.routeId || event.params.tripId || event.params.userId;
  const allowedPrefixes = buildAllowedMediaPrefixes(
    collectionName,
    documentId,
    before || after
  );
  if (collectionName === 'recommendations') {
    // If this recommendation supplied a city image, update the city and its
    // favorite projections before deleting the old media objects.
    const refreshed = await syncDestinationImagesForRecommendationChange({ admin, before, after });
    for (const { destination } of refreshed) {
      const citySnapshot = await admin.firestore()
        .doc(`countries/${destination.countryId}/destinations/${destination.cityId}`)
        .get();
      if (!citySnapshot.exists) continue;
      await refreshFavoritesForTarget({
        admin,
        target: { type: 'city', id: destination.cityId, countryId: destination.countryId },
        data: citySnapshot.data(),
      });
    }
  }
  await cleanupRemovedMedia(admin, before, after, {
    allowedPrefixes,
    bucketName: mediaStorageBucket.value(),
  });
  if (after) await markMediaClaimed(admin, after, mediaStorageBucket.value());
}

exports.onDestinationImageCreated = firestoreCreated(
  'countries/{countryId}/destinations/{cityId}',
  (event) => resolveAndPersistDestinationImage({
    admin,
    countryId: event.params.countryId,
    cityId: event.params.cityId,
    unsplashKey: unsplashAccessKey.value(),
  }),
  { secrets: [unsplashAccessKey], timeoutSeconds: 120 }
);

exports.repairDestinationImagesScheduled = onSchedule(
  {
    schedule: 'every hour',
    timeZone: 'Asia/Jerusalem',
    region: REGION,
    timeoutSeconds: 300,
    serviceAccount: CORE_SERVICE_ACCOUNT,
    secrets: [unsplashAccessKey],
  },
  async () => {
    const results = await repairPendingDestinationImages({
      admin,
      unsplashKey: unsplashAccessKey.value(),
      limit: 20,
    });
    console.log('Destination image repair complete.', { processed: results.length });
  }
);

exports.refreshDestinationCachesScheduled = onSchedule(
  {
    schedule: 'every day 02:30',
    timeZone: 'Asia/Jerusalem',
    region: REGION,
    timeoutSeconds: 300,
    serviceAccount: CORE_SERVICE_ACCOUNT,
    secrets: [googleMapsKey],
  },
  async () => {
    const [destinations, exactPlaces] = await Promise.all([
      refreshDestinationCaches({ admin, mapsKey: googleMapsKey.value(), limit: 50 }),
      refreshExactPlaceCaches({ admin, mapsKey: googleMapsKey.value(), limit: 50 }),
    ]);
    console.log('Google cache refresh complete.', {
      destinations: destinations.length,
      exactPlaces: exactPlaces.length,
    });
  }
);

exports.onRecommendationMediaCleanup = firestoreWritten(
  'recommendations/{recommendationId}',
  (event) => handleMediaCleanup(event, 'recommendations'),
  { serviceAccount: MEDIA_SERVICE_ACCOUNT }
);
exports.onRouteMediaCleanup = firestoreWritten(
  'routes/{routeId}',
  (event) => handleMediaCleanup(event, 'routes'),
  { serviceAccount: MEDIA_SERVICE_ACCOUNT }
);
exports.onTripMediaCleanup = firestoreWritten(
  'trips/{tripId}',
  (event) => handleMediaCleanup(event, 'trips'),
  { serviceAccount: MEDIA_SERVICE_ACCOUNT }
);
exports.onUserMediaCleanup = firestoreWritten(
  'users/{userId}',
  (event) => handleMediaCleanup(event, 'users'),
  { serviceAccount: MEDIA_SERVICE_ACCOUNT }
);

exports.onPublicProfileSync = firestoreWritten(
  'users/{userId}',
  async (event) => {
    const before = event.data?.before.exists ? event.data.before.data() : null;
    const after = event.data?.after.exists ? event.data.after.data() : null;
    if (!publicProfileProjectionChanged(event.params.userId, before, after)) return;
    await syncPublicProfile(admin, event.params.userId, after);
    const publicSnapshot = await admin.firestore().doc(
      `publicProfiles/${event.params.userId}`
    ).get();
    await refreshFavoriteOwnerPreviews({
      admin,
      userId: event.params.userId,
      publicProfile: publicSnapshot.exists ? publicSnapshot.data() : null,
    });
  }
);

function projectionHandler(type, idParam, countryParam = null) {
  return async (event) => {
    const after = event.data?.after.exists ? event.data.after.data() : null;
    await refreshFavoritesForTarget({
      admin,
      target: {
        type,
        id: event.params[idParam],
        ...(countryParam ? { countryId: event.params[countryParam] } : {}),
      },
      data: after,
    });
  };
}

exports.onRecommendationFavoriteProjection = firestoreWritten(
  'recommendations/{recommendationId}',
  projectionHandler('recommendation', 'recommendationId')
);
exports.onRouteFavoriteProjection = firestoreWritten(
  'routes/{routeId}',
  projectionHandler('route', 'routeId')
);
exports.onTripFavoriteProjection = firestoreWritten(
  'trips/{tripId}',
  projectionHandler('trip', 'tripId')
);
exports.onCityFavoriteProjection = firestoreWritten(
  'countries/{countryId}/destinations/{cityId}',
  async (event) => {
    const after = event.data?.after.exists ? event.data.after.data() : null;
    await refreshFavoritesForTarget({
      admin,
      target: { type: 'city', id: event.params.cityId, countryId: event.params.countryId },
      data: after && hasUsableDestinationCache(after) ? after : null,
    });
  }
);

exports.onDestinationCatalogSync = firestoreWritten(
  'countries/{countryId}/destinations/{cityId}',
  (event) => syncDestinationCatalog({
    admin,
    countryId: event.params.countryId,
    cityId: event.params.cityId,
    city: event.data?.after.exists ? event.data.after.data() : null,
  })
);

exports.onCountryDestinationCatalogSync = firestoreWritten(
  'countries/{countryId}',
  (event) => syncCountryDestinationCatalog({
    admin,
    countryId: event.params.countryId,
    country: event.data?.after.exists ? event.data.after.data() : null,
  }),
  { timeoutSeconds: 300 }
);
