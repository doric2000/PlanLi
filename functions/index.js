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
const { publicProfileProjectionChanged, syncCurrentPublicProfile } = require('./publicProfiles');
const {
  finalizeDestinationChoice,
  resolveRecommendationDestination,
  saveRecommendation,
} = require('./recommendationService');
const { cleanupRouteRevisions, loadRouteDetails, saveRoute } = require('./routeService');
const {
  cleanupPublishedRouteDraftReceipts,
  discardRouteDraft,
  getCurrentRouteDraft,
  publishRouteDraft,
  saveRouteDraft,
} = require('./routeDraftService');
const {
  cleanupRecommendationDraftArtifacts,
  discardRecommendationDraft,
  getCurrentRecommendationDraft,
  publishRecommendationDraft,
  saveRecommendationDraft,
} = require('./recommendationDraftService');
const { saveTrip } = require('./tripService');
const { listMyPendingContent } = require('./myPendingContentService');
const { completeAccountSetup, registerUser, updateProfile } = require('./profileService');
const { authorizeRequest } = require('./authPolicy');
const { normalizeCallableInput } = require('./callableInputSecurity');
const {
  getPersonalizedRecommendations,
  getPersonalizedRoutes,
  mergeGuestPersonalization,
  recordDiscoverySignal,
  resetPersonalizationActivity,
  setPersonalizationBehavior,
  setPersonalizationFeedback,
} = require('./personalizationService');
const { getMapRecommendations } = require('./mapRecommendationsService');
const { setDiscoveryRegion } = require('./discoveryRegionPreferenceService');
const {
  consumePublicReadBudget,
  issueGuestSession: issueGuestSessionHandler,
} = require('./publicRateLimitService');
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
  SCHEDULED_CACHE_REFRESH_LIMITS,
  hasUsableDestinationCache,
  refreshDestinationCaches,
  refreshExactPlaceCaches,
  scheduledCacheRequestContext,
} = require('./destinationCacheService');
const {
  cleanupOrphanFavorites,
  deleteComment,
  getReactionState,
  handleCommentThreadDeletionJobWrite,
  refreshFavoriteOwnerPreviews,
  refreshFavoritesForTarget,
  saveComment,
  setFavorite,
  setReaction,
} = require('./socialService');
const {
  clearNotifications,
  deleteNotification,
  handleNotificationCleanupJobWrite,
  handleOwnerNotificationOutboxWrite,
  markAllNotificationsRead,
  notificationDeliveryDescriptor,
  setNotificationRead,
} = require('./notificationService');
const {
  getPushPreferences,
  handleNotificationPushWriteEvent,
  processPendingPushDispatches,
  processPendingPushReceipts,
  registerNotificationDevice,
  unregisterNotificationDevice,
  updateNotificationPreferences,
} = require('./notificationPushService');
const { deleteContent, requestAccountDeletion } = require('./deletionService');
const {
  handleBlockedUserNotificationWrite,
  handleModerationCaseNotificationWrite,
  setBlockedUser,
  submitReport,
} = require('./moderationService');
const {
  bulkUpdateModerationCases,
  deleteAdminSavedView,
  deleteUserAsAdmin,
  getAdminResource,
  getAdminUser,
  getModerationCase,
  getModerationDashboard,
  getModerationPolicy,
  listAdminSavedViews,
  listAdminUsers,
  listHeldContent,
  listModerationAudit,
  listModerationCases,
  processExpiredModerationSuspensions,
  reconcileStaleModerationDecisions,
  resolveModerationCase,
  saveAdminSavedView,
  searchAdminResources,
  setUserAdmin,
  setUserEmailVerified,
  setUserSuspension,
  updateModerationCase,
  updateAdminAttachedPlace,
} = require('./adminService');
const { handleAdminSearchProjectionWrite } = require('./adminSearchProjection');
const {
  approveDestination,
  deactivateDestination,
  evaluateAndPersistDestination,
  getAirportCandidates,
  getDestinationImageCandidates,
  getDestinationRenameJob,
  getDestinationReassignmentJob,
  getDestinationReview,
  listDestinationReviews,
  onDestinationCreated,
  recheckDestination,
  scanDestinationQuality,
  selectDestinationImageCandidate,
  setDestinationAirport,
  setDestinationHebrewName,
  startDestinationReassignment,
  previewDestinationReassignment,
  reconcileDestinationApprovalReleases,
  reconcileDestinationPublicationFences,
  updateDestinationPolicy,
  setDestinationUploadedImage,
} = require('./destinationAdminService');
const { processDestinationRenameJob } = require('./destinationRenameService');
const { processDestinationReassignmentJob } = require('./destinationReassignmentService');
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

admin.initializeApp({ storageBucket: 'planli-f0b12-media-eu' });

const REGION = 'europe-west1';
const CORE_SERVICE_ACCOUNT =
  'planli-core-functions@planli-f0b12.iam.gserviceaccount.com';
const MEDIA_SERVICE_ACCOUNT =
  'planli-media-functions@planli-f0b12.iam.gserviceaccount.com';
const restCountriesKey = defineSecret('REST_COUNTRIES_KEY');
const openWeatherKey = defineSecret('OPENWEATHER_API_KEY');
const unsplashAccessKey = defineSecret('UNSPLASH_ACCESS_KEY');
const publicRateLimitKey = defineSecret('PUBLIC_RATE_LIMIT_KEY');
const appleSignInPrivateKey = defineSecret('APPLE_SIGN_IN_PRIVATE_KEY');
const expoPushAccessToken = defineSecret('EXPO_PUSH_ACCESS_TOKEN');
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
    const safeRequest = { ...request, data: normalizeCallableInput(request.data) };
    const accessContext = await authorizeRequest({
      admin,
      auth: safeRequest.auth,
      access,
      allowSuspended,
    });
    return handler(safeRequest, accessContext);
  });
}

async function consumePublicRequest(request, action) {
  const result = await consumePublicReadBudget({
    admin,
    auth: request.auth,
    request,
    action,
    key: publicRateLimitKey.value(),
  });
  return result.data;
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
    secrets: [restCountriesKey, publicRateLimitKey],
    timeoutSeconds: 120,
    ...PROVIDER_CALLABLE_LIMITS,
  },
  (request) => locationSave('recommendation_save', request, (incidentId) => saveRecommendation({
    admin,
    auth: request.auth,
    data: { ...(request.data || {}), incidentId },
    restCountriesKey: restCountriesKey.value(),
    mediaBucket: mediaStorageBucket.value(),
    providerRateLimitKey: publicRateLimitKey.value(),
  }))
);

exports.getCurrentRecommendationDraft = callable(
  { access: 'active', timeoutSeconds: 30 },
  (request) => getCurrentRecommendationDraft({ admin, auth: request.auth })
);

exports.saveRecommendationDraft = callable(
  {
    access: 'active', timeoutSeconds: 60, memory: '512MiB',
    secrets: [publicRateLimitKey],
  },
  (request) => saveRecommendationDraft({
    admin,
    auth: request.auth,
    data: request.data,
    providerRateLimitKey: publicRateLimitKey.value(),
  })
);

exports.discardRecommendationDraft = callable(
  { access: 'active', timeoutSeconds: 60, memory: '512MiB' },
  (request) => discardRecommendationDraft({ admin, auth: request.auth, data: request.data })
);

exports.publishRecommendationDraft = callable(
  {
    access: 'active',
    timeoutSeconds: 300,
    memory: '1GiB',
    secrets: [restCountriesKey, publicRateLimitKey],
    ...PROVIDER_CALLABLE_LIMITS,
  },
  (request) => locationSave('recommendation_draft_publish', request, (incidentId) => (
    publishRecommendationDraft({
      admin,
      auth: request.auth,
      data: { ...(request.data || {}), incidentId },
      restCountriesKey: restCountriesKey.value(),
      mediaBucket: mediaStorageBucket.value(),
      providerRateLimitKey: publicRateLimitKey.value(),
    })
  ))
);

exports.resolveRecommendationDestination = callable(
  {
    access: 'active',
    secrets: [restCountriesKey, publicRateLimitKey],
    timeoutSeconds: 60,
    ...PROVIDER_CALLABLE_LIMITS,
  },
  (request) => resolveRecommendationDestination({
    admin,
    auth: request.auth,
    data: request.data,
    restCountriesKey: restCountriesKey.value(),
    providerRateLimitKey: publicRateLimitKey.value(),
  })
);

exports.searchPlaces = callable(
  {
    access: 'active',
    secrets: [publicRateLimitKey],
    timeoutSeconds: 30,
    ...PROVIDER_CALLABLE_LIMITS,
  },
  (request) => searchPlaces({
    admin,
    auth: request.auth,
    data: request.data,
    providerRateLimitKey: publicRateLimitKey.value(),
  })
);

exports.resolvePlaceSelection = callable(
  {
    access: 'active',
    secrets: [restCountriesKey, publicRateLimitKey],
    timeoutSeconds: 60,
    ...PROVIDER_CALLABLE_LIMITS,
  },
  async (request) => {
    if (request.data?.resolutionId && (
      request.data?.destinationChoiceId || request.data?.destinationRef ||
      request.data?.destinationResolvedPlaceToken
    )) {
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
      providerRateLimitKey: publicRateLimitKey.value(),
    });
    const destination = await resolveRecommendationDestination({
      admin,
      auth: request.auth,
      data: {
        resolvedPlaceToken: selection.resolvedPlaceToken,
        incidentId: selection.incidentId,
        supportsDestinationChoice: request.data?.supportsDestinationChoice === true,
        supportsDestinationSearch: request.data?.supportsDestinationSearch === true,
        selectionIntent: request.data?.selectionIntent === 'destination'
          ? 'destination'
          : 'exact_place',
        confirmedHebrewName: request.data?.confirmedHebrewName || null,
      },
      restCountriesKey: restCountriesKey.value(),
      providerRateLimitKey: publicRateLimitKey.value(),
    });
    if (destination.status !== 'resolved') {
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
    secrets: [restCountriesKey, publicRateLimitKey],
    ...PROVIDER_ROUTE_CALLABLE_LIMITS,
  },
  (request) => locationSave('route_save', request, (incidentId) => saveRoute({
    admin,
    auth: request.auth,
    data: { ...(request.data || {}), incidentId },
    mediaBucket: mediaStorageBucket.value(),
    restCountriesKey: restCountriesKey.value(),
    providerRateLimitKey: publicRateLimitKey.value(),
  }))
);

exports.getCurrentRouteDraft = callable(
  { access: 'active', timeoutSeconds: 30 },
  (request) => getCurrentRouteDraft({ admin, auth: request.auth })
);

exports.saveRouteDraft = callable(
  {
    access: 'active', timeoutSeconds: 60, memory: '512MiB',
    secrets: [publicRateLimitKey],
  },
  (request) => saveRouteDraft({
    admin,
    auth: request.auth,
    data: request.data,
    providerRateLimitKey: publicRateLimitKey.value(),
  })
);

exports.discardRouteDraft = callable(
  { access: 'active', timeoutSeconds: 60, memory: '512MiB' },
  (request) => discardRouteDraft({ admin, auth: request.auth, data: request.data })
);

exports.publishRouteDraft = callable(
  {
    access: 'active',
    timeoutSeconds: 300,
    memory: '1GiB',
    secrets: [restCountriesKey, publicRateLimitKey],
    ...PROVIDER_ROUTE_CALLABLE_LIMITS,
  },
  (request) => locationSave('route_draft_publish', request, (incidentId) => publishRouteDraft({
    admin,
    auth: request.auth,
    data: { ...(request.data || {}), incidentId },
    mediaBucket: mediaStorageBucket.value(),
    restCountriesKey: restCountriesKey.value(),
    providerRateLimitKey: publicRateLimitKey.value(),
  }))
);

exports.listMyPendingContent = callable(
  { access: 'active', timeoutSeconds: 30 },
  (request) => listMyPendingContent({ admin, auth: request.auth, data: request.data })
);

exports.issueGuestSession = callable(
  {
    access: 'public',
    ...PUBLIC_READ_OPTIONS,
    timeoutSeconds: 20,
    enforceAppCheck: ENFORCE_APP_CHECK,
    consumeAppCheckToken: true,
    secrets: [publicRateLimitKey],
  },
  (request) => issueGuestSessionHandler({
    admin,
    request,
    key: publicRateLimitKey.value(),
  })
);

exports.loadRouteDetails = callable(
  { access: 'public', ...PUBLIC_READ_OPTIONS, timeoutSeconds: 30, secrets: [publicRateLimitKey] },
  async (request) => {
    const data = await consumePublicRequest(request, 'routeDetails');
    return loadRouteDetails({ admin, data });
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
  clearNotifications({ admin, auth: request.auth, data: request.data })
);
exports.deleteNotification = callable({ access: 'signedIn' }, (request) =>
  deleteNotification({ admin, auth: request.auth, data: request.data })
);
exports.markAllNotificationsRead = callable({ access: 'signedIn' }, (request) =>
  markAllNotificationsRead({ admin, auth: request.auth, data: request.data })
);
exports.updateNotificationPreferences = callable({ access: 'signedIn' }, (request) =>
  updateNotificationPreferences({ admin, auth: request.auth, data: request.data })
);
exports.getPushPreferences = callable({ access: 'signedIn' }, (request) =>
  getPushPreferences({ admin, auth: request.auth })
);
exports.registerNotificationDevice = callable({ access: 'signedIn' }, (request) =>
  registerNotificationDevice({ admin, auth: request.auth, data: request.data })
);
exports.unregisterNotificationDevice = callable({ access: 'signedIn' }, (request) =>
  unregisterNotificationDevice({ admin, auth: request.auth, data: request.data })
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
    const data = await consumePublicRequest(request, 'discovery');
    return getPersonalizedRecommendations({ admin, auth: request.auth, data });
  }
);

exports.getMapRecommendations = callable(
  { access: 'public', ...PUBLIC_READ_OPTIONS, timeoutSeconds: 30, memory: '512MiB', secrets: [publicRateLimitKey] },
  async (request) => {
    const data = await consumePublicRequest(request, 'map');
    return getMapRecommendations({ admin, auth: request.auth, data });
  }
);

exports.getPersonalizedRoutes = callable(
  { access: 'public', ...PUBLIC_READ_OPTIONS, timeoutSeconds: 30, secrets: [publicRateLimitKey] },
  async (request) => {
    const data = await consumePublicRequest(request, 'discovery');
    return getPersonalizedRoutes({ admin, auth: request.auth, data });
  }
);

exports.getDestinationOverview = callable(
  { access: 'public', ...PUBLIC_READ_OPTIONS, timeoutSeconds: 30, secrets: [openWeatherKey, publicRateLimitKey] },
  async (request) => {
    const data = await consumePublicRequest(request, 'destinationOverview');
    return getDestinationOverview({ admin, data, weatherApiKey: openWeatherKey.value() });
  }
);

exports.searchDestinations = callable(
  { access: 'public', ...PUBLIC_READ_OPTIONS, timeoutSeconds: 20, secrets: [publicRateLimitKey] },
  async (request) => {
    const data = await consumePublicRequest(request, 'discovery');
    return searchDestinations({ admin, data });
  }
);

exports.setDiscoveryRegion = callable({ access: 'signedIn' }, (request) =>
  setDiscoveryRegion({ admin, auth: request.auth, data: request.data })
);

exports.recordDiscoverySignal = callable({ access: 'active' }, (request) =>
  recordDiscoverySignal({ admin, auth: request.auth, data: request.data })
);

exports.setPersonalizationFeedback = callable({ access: 'active' }, (request) =>
  setPersonalizationFeedback({ admin, auth: request.auth, data: request.data })
);

exports.mergeGuestPersonalization = callable({ access: 'active' }, (request) =>
  mergeGuestPersonalization({ admin, auth: request.auth, data: request.data })
);

exports.setPersonalizationBehavior = callable({ access: 'active' }, (request) =>
  setPersonalizationBehavior({ admin, auth: request.auth, data: request.data })
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
exports.updateModerationCase = callable({ access: 'signedIn' }, (request) =>
  updateModerationCase({ admin, auth: request.auth, data: request.data })
);
exports.resolveModerationCase = callable(
  { access: 'signedIn', timeoutSeconds: 300, memory: '1GiB', serviceAccount: MEDIA_SERVICE_ACCOUNT },
  (request) => resolveModerationCase({
    admin,
    auth: request.auth,
    data: request.data,
    mediaBucket: mediaStorageBucket.value(),
  })
);
exports.bulkUpdateModerationCases = callable(
  { access: 'signedIn', timeoutSeconds: 300, memory: '1GiB', serviceAccount: MEDIA_SERVICE_ACCOUNT },
  (request) => bulkUpdateModerationCases({
    admin,
    auth: request.auth,
    data: request.data,
    mediaBucket: mediaStorageBucket.value(),
  })
);
exports.searchAdminResources = callable({ access: 'signedIn' }, (request) =>
  searchAdminResources({ admin, auth: request.auth, data: request.data })
);
exports.getAdminResource = callable({ access: 'signedIn' }, (request) =>
  getAdminResource({ admin, auth: request.auth, data: request.data })
);
exports.listAdminSavedViews = callable({ access: 'signedIn' }, (request) =>
  listAdminSavedViews({ admin, auth: request.auth })
);
exports.saveAdminSavedView = callable({ access: 'signedIn' }, (request) =>
  saveAdminSavedView({ admin, auth: request.auth, data: request.data })
);
exports.deleteAdminSavedView = callable({ access: 'signedIn' }, (request) =>
  deleteAdminSavedView({ admin, auth: request.auth, data: request.data })
);
exports.getModerationPolicy = callable({ access: 'signedIn' }, (request) =>
  getModerationPolicy({ admin, auth: request.auth })
);
exports.updateAdminAttachedPlace = callable(
  {
    access: 'signedIn',
    timeoutSeconds: 180,
    serviceAccount: CORE_SERVICE_ACCOUNT,
    secrets: [publicRateLimitKey],
  },
  (request) => updateAdminAttachedPlace({
    admin,
    auth: request.auth,
    data: request.data,
    providerRateLimitKey: publicRateLimitKey.value(),
  })
);
exports.listHeldContent = callable({ access: 'signedIn' }, (request) =>
  listHeldContent({ admin, auth: request.auth, data: request.data })
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
exports.setDestinationHebrewName = callable({ access: 'signedIn', timeoutSeconds: 300 }, (request) =>
  setDestinationHebrewName({ admin, auth: request.auth, data: request.data })
);
exports.getDestinationRenameJob = callable({ access: 'signedIn' }, (request) =>
  getDestinationRenameJob({ admin, auth: request.auth, data: request.data })
);
exports.updateDestinationPolicy = callable({ access: 'signedIn', timeoutSeconds: 300 }, (request) =>
  updateDestinationPolicy({ admin, auth: request.auth, data: request.data })
);
exports.previewDestinationReassignment = callable({ access: 'signedIn', timeoutSeconds: 300 }, (request) =>
  previewDestinationReassignment({ admin, auth: request.auth, data: request.data })
);
exports.startDestinationReassignment = callable({ access: 'signedIn', timeoutSeconds: 300 }, (request) =>
  startDestinationReassignment({ admin, auth: request.auth, data: request.data })
);
exports.getDestinationReassignmentJob = callable({ access: 'signedIn' }, (request) =>
  getDestinationReassignmentJob({ admin, auth: request.auth, data: request.data })
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
    const [runtime, revisions, routeDraftReceipts, recommendationDrafts] = await Promise.all([
      cleanupExpiredRuntimeDocuments({ admin, limit: 200 }),
      cleanupRouteRevisions({ admin, limit: 100 }),
      cleanupPublishedRouteDraftReceipts({ admin, limit: 100 }),
      cleanupRecommendationDraftArtifacts({ admin, limit: 100 }),
    ]);
    console.log('Expired runtime cleanup complete.', {
      runtime, revisions, routeDraftReceipts, recommendationDrafts,
    });
  }
);

exports.retryNotificationPushScheduled = onSchedule(
  {
    schedule: 'every 5 minutes',
    timeZone: 'Asia/Jerusalem',
    region: REGION,
    timeoutSeconds: 300,
    secrets: [expoPushAccessToken],
    serviceAccount: CORE_SERVICE_ACCOUNT,
  },
  async () => {
    const result = await processPendingPushDispatches({
      admin,
      accessToken: expoPushAccessToken.value(),
      limit: 100,
    });
    console.log('Notification push retry scan complete.', result);
  }
);

exports.checkNotificationPushReceiptsScheduled = onSchedule(
  {
    schedule: 'every 15 minutes',
    timeZone: 'Asia/Jerusalem',
    region: REGION,
    timeoutSeconds: 300,
    secrets: [expoPushAccessToken],
    serviceAccount: CORE_SERVICE_ACCOUNT,
  },
  async () => {
    const result = await processPendingPushReceipts({
      admin,
      accessToken: expoPushAccessToken.value(),
      limit: 500,
    });
    console.log('Notification push receipt scan complete.', result);
  }
);

exports.expireModerationSuspensionsScheduled = onSchedule(
  {
    schedule: 'every 15 minutes',
    timeZone: 'Asia/Jerusalem',
    region: REGION,
    timeoutSeconds: 300,
    memory: '1GiB',
    serviceAccount: MEDIA_SERVICE_ACCOUNT,
  },
  async () => {
    const result = await processExpiredModerationSuspensions({
      admin,
      mediaBucket: mediaStorageBucket.value(),
      limit: 100,
    });
    console.log('Expired moderation suspension scan complete.', result);
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
    await onDestinationCreated({ admin, countryId: event.params.countryId, cityId: event.params.cityId });
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
    return evaluateAndPersistDestination({
      admin,
      countryId: event.params.countryId,
      cityId: event.params.cityId,
    });
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

exports.reconcileStaleModerationDecisionsScheduled = onSchedule(
  {
    schedule: 'every 15 minutes',
    timeZone: 'Asia/Jerusalem',
    region: REGION,
    timeoutSeconds: 120,
    memory: '256MiB',
    serviceAccount: MEDIA_SERVICE_ACCOUNT,
  },
  async () => {
    const result = await reconcileStaleModerationDecisions({ admin, limit: 100 });
    console.log('Stale moderation decision reconciliation complete.', result);
  }
);

exports.reconcileDestinationApprovalReleasesScheduled = onSchedule(
  {
    schedule: 'every 15 minutes',
    timeZone: 'Asia/Jerusalem',
    region: REGION,
    timeoutSeconds: 300,
    memory: '512MiB',
    serviceAccount: CORE_SERVICE_ACCOUNT,
  },
  async () => {
    const [releaseResult, fenceResult] = await Promise.all([
      reconcileDestinationApprovalReleases({ admin, limit: 50 }),
      reconcileDestinationPublicationFences({ admin, limit: 50 }),
    ]);
    console.log('Destination publication reconciliation complete.', {
      releases: releaseResult,
      fences: fenceResult,
    });
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
  },
  async () => {
    // Run these queues sequentially and below the 30/minute provider ceiling.
    // The shared context counts every provider attempt, including retries.
    const requestContext = scheduledCacheRequestContext();
    const destinations = await refreshDestinationCaches({
      admin, limit: SCHEDULED_CACHE_REFRESH_LIMITS.destinations,
      requestContext,
    });
    const exactPlaces = await refreshExactPlaceCaches({
      admin, limit: SCHEDULED_CACHE_REFRESH_LIMITS.exactPlaces,
      requestContext,
    });
    console.log('Google cache refresh complete.', {
      destinations: destinations.length,
      exactPlaces: exactPlaces.length,
      providerRequests: requestContext.count,
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
    await syncCurrentPublicProfile(admin, event.params.userId);
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

exports.onNotificationPushWritten = firestoreWritten(
  'users/{userId}/notifications/{notificationId}',
  async (event) => {
    const before = event.data?.before.exists ? event.data.before.data() : null;
    const after = event.data?.after.exists ? event.data.after.data() : null;
    const descriptor = notificationDeliveryDescriptor({
      userId: event.params.userId,
      notificationId: event.params.notificationId,
      before,
      after,
    });
    if (!descriptor) return { status: 'ignored', reason: 'no_new_activity' };
    return handleNotificationPushWriteEvent({
      admin,
      event,
      accessToken: expoPushAccessToken.value(),
    });
  },
  {
    memory: '512MiB',
    timeoutSeconds: 120,
    secrets: [expoPushAccessToken],
  }
);
exports.onModerationCaseNotificationWritten = firestoreWritten(
  'system/moderation/cases/{caseId}',
  (event) => handleModerationCaseNotificationWrite({
    admin,
    event,
    mediaBucket: mediaStorageBucket.value(),
  }),
  {
    memory: '1GiB',
    timeoutSeconds: 300,
    serviceAccount: MEDIA_SERVICE_ACCOUNT,
  }
);
exports.onOwnerNotificationOutboxWritten = firestoreWritten(
  'system/moderation/ownerNotifications/{outboxId}',
  (event) => handleOwnerNotificationOutboxWrite({ admin, event })
);
exports.onNotificationCleanupJobWritten = firestoreWritten(
  'system/runtime/notificationCleanupJobs/{jobId}',
  (event) => handleNotificationCleanupJobWrite({ admin, event })
);
exports.onCommentThreadDeletionJobWritten = firestoreWritten(
  'system/runtime/commentThreadDeletionJobs/{jobId}',
  (event) => handleCommentThreadDeletionJobWrite({ admin, event }),
  {
    memory: '512MiB',
    timeoutSeconds: 300,
  }
);
exports.onBlockedUserNotificationWritten = firestoreWritten(
  'users/{uid}/blockedUsers/{blockedUid}',
  (event) => handleBlockedUserNotificationWrite({ admin, event })
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

function adminSearchProjectionHandler(event) {
  return handleAdminSearchProjectionWrite({ admin, event });
}

exports.onRecommendationAdminSearchWritten = firestoreWritten(
  'recommendations/{recommendationId}',
  adminSearchProjectionHandler
);
exports.onRouteAdminSearchWritten = firestoreWritten(
  'routes/{routeId}',
  adminSearchProjectionHandler
);
exports.onTripAdminSearchWritten = firestoreWritten(
  'trips/{tripId}',
  adminSearchProjectionHandler
);
exports.onPublicProfileAdminSearchWritten = firestoreWritten(
  'publicProfiles/{userId}',
  adminSearchProjectionHandler
);
exports.onCommentAdminSearchWritten = firestoreWritten(
  '{parentCollection}/{parentId}/comments/{commentId}',
  adminSearchProjectionHandler
);
exports.onRouteStopAdminSearchWritten = firestoreWritten(
  'routes/{routeId}/revisions/{revisionId}/days/{dayId}/stops/{stopId}',
  adminSearchProjectionHandler
);
exports.onDestinationAdminSearchWritten = firestoreWritten(
  'countries/{countryId}/destinations/{cityId}',
  adminSearchProjectionHandler
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

exports.onDestinationRenameJobWritten = firestoreWritten(
  'system/runtime/destinationRenameJobs/{jobId}',
  async (event) => {
    const after = event.data?.after.exists ? event.data.after.data() : null;
    if (after?.status !== 'queued') return null;
    const result = await processDestinationRenameJob({ admin, jobId: event.params.jobId });
    if (result.status === 'complete') {
      await evaluateAndPersistDestination({
        admin,
        countryId: after.countryId,
        cityId: after.cityId,
      });
    }
    return result;
  },
  { timeoutSeconds: 300 }
);

exports.onDestinationReassignmentJobWritten = firestoreWritten(
  'system/runtime/destinationReassignmentJobs/{jobId}',
  async (event) => {
    if (event.data?.after?.data()?.status !== 'queued') return null;
    return processDestinationReassignmentJob({ admin, jobId: event.params.jobId });
  }
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
