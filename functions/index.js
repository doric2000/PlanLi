const admin = require('firebase-admin');
const { onCall } = require('firebase-functions/v2/https');
const { onDocumentCreated, onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret, defineString } = require('firebase-functions/params');
const {
  buildAllowedMediaPrefixes,
  cleanupRemovedMedia,
  collectManagedMediaPaths,
} = require('./mediaCleanup');
const { publicProfileProjectionChanged, syncPublicProfile } = require('./publicProfiles');
const {
  finalizeDestinationChoice,
  resolveRecommendationDestination,
  saveRecommendation,
} = require('./recommendationService');
const { cleanupRouteRevisions, loadRouteDetails, saveRoute } = require('./routeService');
const { saveTrip } = require('./tripService');
const { completeAccountSetup, registerUser, updateProfile } = require('./profileService');
const { authorizeRequest } = require('./authPolicy');
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
const { setBlockedUser, submitReport } = require('./moderationService');
const {
  deleteUserAsAdmin,
  getAdminUser,
  getModerationCase,
  getModerationDashboard,
  listAdminUsers,
  listHeldContent,
  listModerationAudit,
  listModerationCases,
  moderateContent,
  setUserAdmin,
  setUserEmailVerified,
  setUserSuspension,
} = require('./adminService');
const {
  approveDestination,
  deactivateDestination,
  getAirportCandidates,
  getDestinationImageCandidates,
  getDestinationReview,
  listDestinationReviews,
  onDestinationCreated,
  recheckDestination,
  scanDestinationQuality,
  selectDestinationImageCandidate,
  setDestinationAirport,
  setDestinationUploadedImage,
} = require('./destinationAdminService');
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
  auditUnvalidatedDestinationImages,
  resolveAndPersistDestinationImage,
  syncDestinationImagesForRecommendationChange,
} = require('./destinationImageService');
const {
  cleanupPreparedMedia,
  markMediaClaimed,
  prepareMedia,
} = require('./mediaProcessor');
const { removedCanonicalMediaAssets, setMediaAvailability } = require('./mediaModeration');
const {
  createIncidentId,
  decorateLocationError,
  locationLog,
  reasonForLocationError,
} = require('./locationDiagnostics');

admin.initializeApp();

const REGION = 'europe-west1';
const CORE_SERVICE_ACCOUNT =
  'planli-core-functions@planli-f0b12.iam.gserviceaccount.com';
const MEDIA_SERVICE_ACCOUNT =
  'planli-media-functions@planli-f0b12.iam.gserviceaccount.com';
const googleMapsKey = defineSecret('GOOGLE_MAPS_KEY');
const googlePlacesNewKey = defineSecret('GOOGLE_PLACES_NEW_KEY');
const restCountriesKey = defineSecret('REST_COUNTRIES_KEY');
const openWeatherKey = defineSecret('OPENWEATHER_API_KEY');
const unsplashAccessKey = defineSecret('UNSPLASH_ACCESS_KEY');
const publicRateLimitKey = defineSecret('PUBLIC_RATE_LIMIT_KEY');
const appleSignInPrivateKey = defineSecret('APPLE_SIGN_IN_PRIVATE_KEY');
const appleSignInTeamId = defineString('APPLE_SIGN_IN_TEAM_ID', {
  description: 'Apple Developer Team ID used by Sign in with Apple.',
});
const appleSignInKeyId = defineString('APPLE_SIGN_IN_KEY_ID', {
  description: 'Sign in with Apple private key identifier.',
});
const appleSignInClientId = defineString('APPLE_SIGN_IN_CLIENT_ID', {
  description: 'Native Sign in with Apple client ID.',
  default: 'com.planli.planlitravels',
});
const placesProvider = defineString('PLACES_PROVIDER', {
  description: 'Google Places provider adapter: new or legacy.',
  // Places API (New) passed the live fixture gate. Set PLACES_PROVIDER=legacy
  // in the deployment environment for an immediate provider rollback.
  default: 'new',
});
const mediaStorageBucket = defineString('MEDIA_STORAGE_BUCKET', {
  description: 'European Cloud Storage bucket used for PlanLi media.',
  default: 'planli-f0b12-media-eu',
});
// Keep false for private Development Build validation. Set PLANLI_ENFORCE_APP_CHECK=true only
// after App Check providers and debug tokens are configured on every client.
const ENFORCE_APP_CHECK = process.env.PLANLI_ENFORCE_APP_CHECK === 'true';
const CALLABLE_OPTIONS = {
  region: REGION,
  enforceAppCheck: ENFORCE_APP_CHECK,
  serviceAccount: CORE_SERVICE_ACCOUNT,
};
const PUBLIC_READ_OPTIONS = {
  concurrency: 10,
  maxInstances: 1,
};

function callable(options, handler) {
  const {
    access,
    allowSuspended = false,
    ...firebaseOptions
  } = options;
  if (!access) throw new Error('Every callable must declare an access level.');
  return onCall({ ...CALLABLE_OPTIONS, ...firebaseOptions }, async (request) => {
    const accessContext = await authorizeRequest({
      admin,
      auth: request.auth,
      access,
      allowSuspended,
    });
    return handler(request, accessContext);
  });
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

async function locationSave(stage, request, task) {
  const incidentId = createIncidentId(request?.data?.incidentId);
  const startedAt = Date.now();
  try {
    const result = await task(incidentId);
    locationLog(stage, {
      incidentId,
      outcome: 'succeeded',
      durationMs: Date.now() - startedAt,
    });
    return { ...result, incidentId };
  } catch (error) {
    const reason = reasonForLocationError(error, `${stage}_failed`);
    locationLog(stage, {
      incidentId,
      outcome: 'failed',
      durationMs: Date.now() - startedAt,
      reason,
    });
    throw decorateLocationError(error, incidentId, `${stage}_failed`);
  }
}

exports.saveRecommendation = callable(
  {
    access: 'active',
    secrets: [googleMapsKey, googlePlacesNewKey, restCountriesKey, publicRateLimitKey],
    timeoutSeconds: 120,
    ...PROVIDER_CALLABLE_LIMITS,
  },
  (request) => locationSave('recommendation_save', request, (incidentId) => saveRecommendation({
    admin,
    auth: request.auth,
    data: { ...(request.data || {}), incidentId },
    mapsKey: googleMapsKey.value(),
    newPlacesKey: googlePlacesNewKey.value(),
    placesProvider: placesProvider.value(),
    restCountriesKey: restCountriesKey.value(),
    mediaBucket: mediaStorageBucket.value(),
    providerRateLimitKey: publicRateLimitKey.value(),
  }))
);

exports.resolveRecommendationDestination = callable(
  {
    access: 'active',
    secrets: [googleMapsKey, googlePlacesNewKey, restCountriesKey, publicRateLimitKey],
    timeoutSeconds: 60,
    ...PROVIDER_CALLABLE_LIMITS,
  },
  (request) => resolveRecommendationDestination({
    admin,
    auth: request.auth,
    data: request.data,
    mapsKey: googleMapsKey.value(),
    newPlacesKey: googlePlacesNewKey.value(),
    placesProvider: placesProvider.value(),
    restCountriesKey: restCountriesKey.value(),
    providerRateLimitKey: publicRateLimitKey.value(),
  })
);

exports.searchPlaces = callable(
  {
    access: 'active',
    secrets: [googleMapsKey, googlePlacesNewKey, publicRateLimitKey],
    timeoutSeconds: 30,
    ...PROVIDER_CALLABLE_LIMITS,
  },
  (request) => searchPlaces({
    admin,
    auth: request.auth,
    data: request.data,
    mapsKey: googleMapsKey.value(),
    newPlacesKey: googlePlacesNewKey.value(),
    placesProvider: placesProvider.value(),
    providerRateLimitKey: publicRateLimitKey.value(),
  })
);

exports.resolvePlaceSelection = callable(
  {
    access: 'active',
    secrets: [googleMapsKey, googlePlacesNewKey, restCountriesKey, publicRateLimitKey],
    timeoutSeconds: 60,
    ...PROVIDER_CALLABLE_LIMITS,
  },
  async (request) => {
    if (request.data?.resolutionId && request.data?.destinationChoiceId) {
      return locationSave('destination_choice', request, () => finalizeDestinationChoice({
        admin,
        auth: request.auth,
        data: request.data,
        providerRateLimitKey: publicRateLimitKey.value(),
      }));
    }
    const selection = await resolvePlaceSelection({
      admin,
      auth: request.auth,
      data: request.data,
      mapsKey: googleMapsKey.value(),
      newPlacesKey: googlePlacesNewKey.value(),
      placesProvider: placesProvider.value(),
      providerRateLimitKey: publicRateLimitKey.value(),
    });
    const destination = await resolveRecommendationDestination({
      admin,
      auth: request.auth,
      data: {
        resolvedPlaceToken: selection.resolvedPlaceToken,
        incidentId: selection.incidentId,
        supportsDestinationChoice: request.data?.supportsDestinationChoice === true,
      },
      mapsKey: googleMapsKey.value(),
      newPlacesKey: googlePlacesNewKey.value(),
      placesProvider: placesProvider.value(),
      restCountriesKey: restCountriesKey.value(),
      providerRateLimitKey: publicRateLimitKey.value(),
    });
    if (destination.status === 'destination_choice_required') {
      return {
        ...selection,
        ...destination,
        resolvedPlaceToken: selection.resolvedPlaceToken,
        expiresAt: destination.expiresAt,
        incidentId: destination.incidentId || selection.incidentId,
      };
    }
    return {
      ...selection,
      ...destination,
      status: 'resolved',
      resolvedPlaceToken: selection.resolvedPlaceToken,
      expiresAt: selection.expiresAt,
      incidentId: destination.incidentId || selection.incidentId,
    };
  }
);

exports.saveRoute = callable(
  {
    access: 'active',
    timeoutSeconds: 300,
    memory: '1GiB',
    secrets: [googleMapsKey, googlePlacesNewKey, restCountriesKey, publicRateLimitKey],
    ...PROVIDER_ROUTE_CALLABLE_LIMITS,
  },
  (request) => locationSave('route_save', request, (incidentId) => saveRoute({
    admin,
    auth: request.auth,
    data: { ...(request.data || {}), incidentId },
    mediaBucket: mediaStorageBucket.value(),
    mapsKey: googleMapsKey.value(),
    newPlacesKey: googlePlacesNewKey.value(),
    placesProvider: placesProvider.value(),
    restCountriesKey: restCountriesKey.value(),
    providerRateLimitKey: publicRateLimitKey.value(),
  }))
);

exports.loadRouteDetails = callable(
  { access: 'public', ...PUBLIC_READ_OPTIONS, timeoutSeconds: 30, secrets: [publicRateLimitKey] },
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
  { access: 'active', timeoutSeconds: 120, memory: '1GiB' },
  (request) => saveTrip({
    admin,
    auth: request.auth,
    data: request.data,
    mediaBucket: mediaStorageBucket.value(),
  })
);

exports.setFavorite = callable({ access: 'active' }, (request) =>
  setFavorite({ admin, auth: request.auth, data: request.data })
);
exports.setReaction = callable({ access: 'active' }, (request) =>
  setReaction({ admin, auth: request.auth, data: request.data })
);
exports.getReactionState = callable({ access: 'active' }, (request) =>
  getReactionState({ admin, auth: request.auth, data: request.data })
);
exports.saveComment = callable({ access: 'active' }, (request) =>
  saveComment({ admin, auth: request.auth, data: request.data })
);
exports.deleteComment = callable({ access: 'active' }, (request) =>
  deleteComment({ admin, auth: request.auth, data: request.data })
);
exports.setNotificationRead = callable({ access: 'signedIn' }, (request) =>
  setNotificationRead({ admin, auth: request.auth, data: request.data })
);
exports.clearNotifications = callable({ access: 'signedIn' }, (request) =>
  clearNotifications({ admin, auth: request.auth })
);
exports.deleteNotification = callable({ access: 'signedIn' }, (request) =>
  deleteNotification({ admin, auth: request.auth, data: request.data })
);

exports.registerUser = callable({ access: 'signedIn', serviceAccount: MEDIA_SERVICE_ACCOUNT }, (request) =>
  registerUser({ admin, auth: request.auth, data: request.data })
);
exports.completeAccountSetup = callable(
  { access: 'signedIn', serviceAccount: MEDIA_SERVICE_ACCOUNT },
  (request) => completeAccountSetup({ admin, auth: request.auth, data: request.data })
);
exports.updateProfile = callable(
  { access: 'signedIn', timeoutSeconds: 60, serviceAccount: MEDIA_SERVICE_ACCOUNT },
  (request) => updateProfile({
    admin,
    auth: request.auth,
    data: request.data,
    mediaBucket: mediaStorageBucket.value(),
  })
);

exports.getPersonalizedRecommendations = callable(
  { access: 'public', ...PUBLIC_READ_OPTIONS, timeoutSeconds: 30, secrets: [publicRateLimitKey] },
  async (request) => {
    await consumePublicReadBudget({ admin, auth: request.auth, request, action: 'discovery', key: publicRateLimitKey.value() });
    return getPersonalizedRecommendations({ admin, auth: request.auth, data: request.data });
  }
);

exports.getMapRecommendations = callable(
  { access: 'public', ...PUBLIC_READ_OPTIONS, timeoutSeconds: 30, memory: '512MiB', secrets: [publicRateLimitKey] },
  async (request) => {
    await consumePublicReadBudget({ admin, auth: request.auth, request, action: 'map', key: publicRateLimitKey.value() });
    return getMapRecommendations({ admin, auth: request.auth, data: request.data });
  }
);

exports.getPersonalizedRoutes = callable(
  { access: 'public', ...PUBLIC_READ_OPTIONS, timeoutSeconds: 30, secrets: [publicRateLimitKey] },
  async (request) => {
    await consumePublicReadBudget({ admin, auth: request.auth, request, action: 'discovery', key: publicRateLimitKey.value() });
    return getPersonalizedRoutes({ admin, auth: request.auth, data: request.data });
  }
);

exports.getDestinationOverview = callable(
  { access: 'public', ...PUBLIC_READ_OPTIONS, timeoutSeconds: 30, secrets: [openWeatherKey, publicRateLimitKey] },
  async (request) => {
    await consumePublicReadBudget({ admin, auth: request.auth, request, action: 'destinationOverview', key: publicRateLimitKey.value() });
    return getDestinationOverview({ admin, data: request.data, weatherApiKey: openWeatherKey.value() });
  }
);

exports.searchDestinations = callable(
  { access: 'public', ...PUBLIC_READ_OPTIONS, timeoutSeconds: 20, secrets: [publicRateLimitKey] },
  async (request) => {
    await consumePublicReadBudget({ admin, auth: request.auth, request, action: 'discovery', key: publicRateLimitKey.value() });
    return searchDestinations({ admin, data: request.data });
  }
);

exports.recordDiscoverySignal = callable({ access: 'active' }, (request) =>
  recordDiscoverySignal({ admin, auth: request.auth, data: request.data })
);

exports.resetPersonalizationActivity = callable({ access: 'signedIn' }, (request) =>
  resetPersonalizationActivity({ admin, auth: request.auth })
);

exports.deleteContent = callable(
  {
    access: 'active',
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

exports.submitReport = callable({ access: 'active' }, (request) =>
  submitReport({
    admin,
    auth: request.auth,
    data: request.data,
    mediaBucket: mediaStorageBucket.value(),
  })
);

exports.setBlockedUser = callable({ access: 'active' }, (request) =>
  setBlockedUser({ admin, auth: request.auth, data: request.data })
);

exports.getModerationDashboard = callable({ access: 'signedIn' }, (request) =>
  getModerationDashboard({ admin, auth: request.auth })
);
exports.listModerationCases = callable({ access: 'signedIn' }, (request) =>
  listModerationCases({ admin, auth: request.auth, data: request.data })
);
exports.getModerationCase = callable({ access: 'signedIn' }, (request) =>
  getModerationCase({ admin, auth: request.auth, data: request.data })
);
exports.listHeldContent = callable({ access: 'signedIn' }, (request) =>
  listHeldContent({ admin, auth: request.auth, data: request.data })
);
exports.moderateContent = callable(
  { access: 'signedIn', timeoutSeconds: 300, memory: '1GiB', serviceAccount: MEDIA_SERVICE_ACCOUNT },
  (request) => moderateContent({ admin, auth: request.auth, data: request.data, mediaBucket: mediaStorageBucket.value() })
);
exports.listAdminUsers = callable({ access: 'signedIn', serviceAccount: MEDIA_SERVICE_ACCOUNT }, (request) =>
  listAdminUsers({ admin, auth: request.auth, data: request.data })
);
exports.getAdminUser = callable({ access: 'signedIn', serviceAccount: MEDIA_SERVICE_ACCOUNT }, (request) =>
  getAdminUser({ admin, auth: request.auth, data: request.data })
);
exports.setUserSuspension = callable({ access: 'signedIn', timeoutSeconds: 300, memory: '1GiB', serviceAccount: MEDIA_SERVICE_ACCOUNT }, (request) =>
  setUserSuspension({
    admin,
    auth: request.auth,
    data: request.data,
    mediaBucket: mediaStorageBucket.value(),
  })
);
exports.setUserEmailVerified = callable({ access: 'signedIn', serviceAccount: MEDIA_SERVICE_ACCOUNT }, (request) =>
  setUserEmailVerified({ admin, auth: request.auth, data: request.data })
);
exports.setUserAdmin = callable({ access: 'signedIn', serviceAccount: MEDIA_SERVICE_ACCOUNT }, (request) =>
  setUserAdmin({ admin, auth: request.auth, data: request.data })
);
exports.deleteUserAsAdmin = callable(
  { access: 'signedIn', timeoutSeconds: 540, memory: '1GiB', serviceAccount: MEDIA_SERVICE_ACCOUNT },
  (request) => deleteUserAsAdmin({ admin, auth: request.auth, data: request.data, mediaBucket: mediaStorageBucket.value() })
);
exports.listModerationAudit = callable({ access: 'signedIn' }, (request) =>
  listModerationAudit({ admin, auth: request.auth, data: request.data })
);
exports.listDestinationReviews = callable({ access: 'signedIn', timeoutSeconds: 120 }, (request) =>
  listDestinationReviews({ admin, auth: request.auth, data: request.data })
);
exports.getDestinationReview = callable({ access: 'signedIn' }, (request) =>
  getDestinationReview({ admin, auth: request.auth, data: request.data })
);
exports.recheckDestination = callable(
  { access: 'signedIn', timeoutSeconds: 180, secrets: [unsplashAccessKey], serviceAccount: MEDIA_SERVICE_ACCOUNT },
  (request) => recheckDestination({ admin, auth: request.auth, data: request.data, unsplashKey: unsplashAccessKey.value(), mediaBucket: mediaStorageBucket.value() })
);
exports.approveDestination = callable({ access: 'signedIn' }, (request) =>
  approveDestination({ admin, auth: request.auth, data: request.data })
);
exports.getDestinationImageCandidates = callable(
  { access: 'signedIn', timeoutSeconds: 180, secrets: [unsplashAccessKey] },
  (request) => getDestinationImageCandidates({ admin, auth: request.auth, data: request.data, unsplashKey: unsplashAccessKey.value() })
);
exports.selectDestinationImageCandidate = callable(
  { access: 'signedIn', timeoutSeconds: 120, secrets: [unsplashAccessKey], serviceAccount: MEDIA_SERVICE_ACCOUNT },
  (request) => selectDestinationImageCandidate({ admin, auth: request.auth, data: request.data, unsplashKey: unsplashAccessKey.value(), mediaBucket: mediaStorageBucket.value() })
);
exports.setDestinationUploadedImage = callable(
  { access: 'signedIn', timeoutSeconds: 300, memory: '1GiB', serviceAccount: MEDIA_SERVICE_ACCOUNT },
  (request) => setDestinationUploadedImage({ admin, auth: request.auth, data: request.data, mediaBucket: mediaStorageBucket.value() })
);
exports.getAirportCandidates = callable({ access: 'signedIn', timeoutSeconds: 120 }, (request) =>
  getAirportCandidates({ admin, auth: request.auth, data: request.data })
);
exports.setDestinationAirport = callable({ access: 'signedIn', timeoutSeconds: 120 }, (request) =>
  setDestinationAirport({ admin, auth: request.auth, data: request.data })
);
exports.deactivateDestination = callable({ access: 'signedIn', timeoutSeconds: 300 }, (request) =>
  deactivateDestination({ admin, auth: request.auth, data: request.data })
);

exports.requestAccountDeletion = callable(
  {
    access: 'signedIn',
    allowSuspended: true,
    timeoutSeconds: 540,
    memory: '1GiB',
    consumeAppCheckToken: ENFORCE_APP_CHECK,
    serviceAccount: MEDIA_SERVICE_ACCOUNT,
    secrets: [appleSignInPrivateKey],
  },
  (request) => requestAccountDeletion({
    admin,
    auth: request.auth,
    data: request.data,
    mediaBucket: mediaStorageBucket.value(),
    appleConfig: {
      privateKey: appleSignInPrivateKey.value(),
      teamId: appleSignInTeamId.value(),
      keyId: appleSignInKeyId.value(),
      clientId: appleSignInClientId.value(),
    },
  })
);

exports.prepareMedia = callable(
  {
    access: 'active',
    memory: '1GiB',
    concurrency: 1,
    minInstances: 0,
    maxInstances: 5,
    timeoutSeconds: 60,
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
  const removedAssets = removedCanonicalMediaAssets(before, after);
  if (removedAssets.length) {
    await setMediaAvailability({
      admin,
      data: { media: removedAssets },
      mediaBucket: mediaStorageBucket.value(),
      available: false,
      reason: 'content_removed',
    });
  }
  await cleanupRemovedMedia(admin, before, after, {
    allowedPrefixes,
    bucketName: mediaStorageBucket.value(),
  });
  if (removedAssets.length) {
    await Promise.all(removedAssets.map((asset) => (
      admin.firestore().doc(
        `system/media/assets/${String(asset.assetId).toLowerCase()}`
      ).delete()
    )));
  }
  if (after) {
    await markMediaClaimed(admin, after, mediaStorageBucket.value());
    const beforePaths = JSON.stringify([...collectManagedMediaPaths(before)].sort());
    const afterPaths = JSON.stringify([...collectManagedMediaPaths(after)].sort());
    const beforeAvailability = collectionName === 'users'
      ? before?.moderation?.status === 'active'
      : before?.status === 'active';
    const afterAvailability = collectionName === 'users'
      ? after?.moderation?.status === 'active'
      : after?.status === 'active';
    const availabilityChanged = beforeAvailability !== afterAvailability || beforePaths !== afterPaths;
    if (availabilityChanged) {
      await setMediaAvailability({
        admin,
        data: after,
        mediaBucket: mediaStorageBucket.value(),
        available: afterAvailability,
        reason: afterAvailability ? null : (after.status || after.moderation?.status || 'unavailable'),
      });
    }
  }
}

exports.onDestinationImageCreated = firestoreCreated(
  'countries/{countryId}/destinations/{cityId}',
  async (event) => {
    await resolveAndPersistDestinationImage({
      admin,
      countryId: event.params.countryId,
      cityId: event.params.cityId,
      unsplashKey: unsplashAccessKey.value(),
    }).catch((error) => {
      console.error('destination_image_sync_failed', {
        countryId: event.params.countryId,
        cityId: event.params.cityId,
        reason: error?.code || error?.message || 'unknown',
      });
    });
    return onDestinationCreated({ admin, countryId: event.params.countryId, cityId: event.params.cityId });
  },
  { secrets: [unsplashAccessKey], timeoutSeconds: 120 }
);

exports.auditDestinationQualityScheduled = onSchedule(
  {
    schedule: 'every day 03:15',
    timeZone: 'Asia/Jerusalem',
    region: REGION,
    timeoutSeconds: 300,
    serviceAccount: CORE_SERVICE_ACCOUNT,
  },
  async () => {
    const result = await scanDestinationQuality({ admin, limit: 100 });
    console.log('Destination quality audit complete.', result);
  }
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
    const audit = await auditUnvalidatedDestinationImages({
      admin,
      unsplashKey: unsplashAccessKey.value(),
      limit: 5,
    });
    console.log('Destination image repair complete.', { processed: results.length, audit });
  }
);

exports.refreshDestinationCachesScheduled = onSchedule(
  {
    schedule: 'every day 02:30',
    timeZone: 'Asia/Jerusalem',
    region: REGION,
    timeoutSeconds: 300,
    serviceAccount: CORE_SERVICE_ACCOUNT,
    secrets: [googleMapsKey, googlePlacesNewKey],
  },
  async () => {
    const [destinations, exactPlaces] = await Promise.all([
      refreshDestinationCaches({
        admin, mapsKey: googleMapsKey.value(), newPlacesKey: googlePlacesNewKey.value(),
        placesProvider: placesProvider.value(), limit: 50,
      }),
      refreshExactPlaceCaches({
        admin, mapsKey: googleMapsKey.value(), newPlacesKey: googlePlacesNewKey.value(),
        placesProvider: placesProvider.value(), limit: 50,
      }),
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
