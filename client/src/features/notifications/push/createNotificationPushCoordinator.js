import {
  ANDROID_NOTIFICATION_CHANNELS,
  NOTIFICATION_INBOX_CHANNEL_VALUES,
  PUSH_PERMISSION_ONBOARDING_STATES,
  PUSH_RESULT_REASONS,
  PUSH_SCHEMA_VERSION,
  STORED_EXPO_PUSH_TOKEN_KEY,
  STORED_PUSH_PERMISSION_ONBOARDING_KEY,
} from './constants';
import {
  normalizePushPreferences,
  sanitizePushPreferencePatch,
} from './preferences';

function isSafeNotificationId(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 180
    && value.trim().length > 0
    && !value.includes('/')
    && !/[\u0000-\u001F\u007F]/u.test(value);
}

function safeTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch (_error) {
    return 'UTC';
  }
}

export function notificationIntentFromResponse(response, notifications) {
  if (!response?.notification?.request?.content?.data) return null;
  if (
    response.actionIdentifier
    && notifications?.DEFAULT_ACTION_IDENTIFIER
    && response.actionIdentifier !== notifications.DEFAULT_ACTION_IDENTIFIER
  ) {
    return null;
  }
  const data = response.notification.request.content.data;
  if (
    !isSafeNotificationId(data.notificationId)
    || !NOTIFICATION_INBOX_CHANNEL_VALUES.includes(data.channel)
  ) {
    return null;
  }
  return Object.freeze({
    notificationId: data.notificationId,
    channel: data.channel,
  });
}

export function notificationIntentFromNotification(notification) {
  return notificationIntentFromResponse({ notification }, null);
}

export function isNotificationPermissionGranted(status, notifications, platform) {
  if (status?.granted === true) return true;
  if (platform !== 'ios') return false;
  const iosStatus = status?.ios?.status;
  const allowed = [
    notifications?.IosAuthorizationStatus?.AUTHORIZED,
    notifications?.IosAuthorizationStatus?.PROVISIONAL,
    notifications?.IosAuthorizationStatus?.EPHEMERAL,
  ].filter((value) => value !== undefined);
  return allowed.includes(iosStatus);
}

async function configureAndroidChannels(notifications, platform) {
  if (platform !== 'android' || !notifications?.setNotificationChannelAsync) return;
  const importance = notifications.AndroidImportance?.HIGH
    ?? notifications.AndroidImportance?.MAX;
  await Promise.all(Object.values(ANDROID_NOTIFICATION_CHANNELS).map((channel) => (
    notifications.setNotificationChannelAsync(channel.id, {
      name: channel.name,
      importance,
      vibrationPattern: [0, 250, 250, 250],
    })
  )));
}

function responseKey(response, intent) {
  const requestId = response?.notification?.request?.identifier;
  return `${requestId || intent.notificationId}:${response?.actionIdentifier || 'default'}`;
}

export function createNotificationPushCoordinator({
  notifications,
  callables,
  storage,
  platform,
  projectId,
  appVersion = null,
  timeZone = safeTimeZone,
  onForegroundNotification = () => {},
  onNotificationIntent = async () => false,
  onError = () => {},
} = {}) {
  if (!notifications || !callables || !storage) {
    throw new Error('Notification coordinator dependencies are required.');
  }

  let started = false;
  let pendingResponse = null;
  const handledResponses = new Set();
  const inFlightResponses = new Map();
  const subscriptions = [];
  let registrationTransition = Promise.resolve();

  const runRegistrationTransition = (operation) => {
    const result = registrationTransition.catch(() => undefined).then(operation);
    registrationTransition = result.catch(() => undefined);
    return result;
  };

  const reportError = (stage, error) => {
    onError({ stage, error });
  };

  const rememberPermissionOnboardingHandled = async () => {
    try {
      await storage.setItem(
        STORED_PUSH_PERMISSION_ONBOARDING_KEY,
        PUSH_PERMISSION_ONBOARDING_STATES.GRANTED_ENROLLED
      );
    } catch (error) {
      reportError('remember_permission_onboarding', error);
    }
  };

  const clearLastResponse = async () => {
    try {
      await notifications.clearLastNotificationResponseAsync?.();
    } catch (error) {
      reportError('clear_response', error);
    }
  };

  const handleResponse = async (response) => {
    const intent = notificationIntentFromResponse(response, notifications);
    if (!intent) return false;
    const key = responseKey(response, intent);
    if (handledResponses.has(key)) return true;
    if (inFlightResponses.has(key)) return inFlightResponses.get(key);
    const operation = (async () => {
      try {
        const handled = await onNotificationIntent(intent);
        if (handled === false) {
          pendingResponse = response;
          return false;
        }
        pendingResponse = null;
        handledResponses.add(key);
        await clearLastResponse();
        return true;
      } catch (error) {
        pendingResponse = response;
        reportError('notification_response', error);
        return false;
      } finally {
        if (inFlightResponses.get(key) === operation) inFlightResponses.delete(key);
      }
    })();
    inFlightResponses.set(key, operation);
    return operation;
  };

  const unregisterStoredToken = async () => {
    const token = await storage.getItem(STORED_EXPO_PUSH_TOKEN_KEY);
    if (!token) return { status: 'not_registered' };
    try {
      await callables.unregisterDevice(token);
      await storage.removeItem(STORED_EXPO_PUSH_TOKEN_KEY);
      return { status: 'unregistered' };
    } catch (error) {
      reportError('unregister_device', error);
      return { status: 'error', reason: PUSH_RESULT_REASONS.UNREGISTRATION_FAILED };
    }
  };

  const reconcileStoredTokenForDisabledAccount = async () => {
    const token = await storage.getItem(STORED_EXPO_PUSH_TOKEN_KEY);
    if (!token) return { status: 'not_registered' };
    if (!projectId) {
      return { status: 'error', reason: PUSH_RESULT_REASONS.PROJECT_ID_MISSING };
    }
    try {
      // A failed sign-out cleanup can leave this installation assigned to the
      // previous account. Claim it for the current authenticated account first;
      // its disabled preference suppresses delivery, and owner-scoped removal
      // can then safely delete the server record.
      await callables.registerDevice({
        token,
        platform,
        projectId,
        schemaVersion: PUSH_SCHEMA_VERSION,
        timeZone: timeZone(),
        ...(appVersion ? { appVersion } : {}),
      });
      return unregisterStoredToken();
    } catch (error) {
      reportError('reconcile_disabled_device', error);
      return { status: 'error', reason: PUSH_RESULT_REASONS.UNREGISTRATION_FAILED };
    }
  };

  const registerToken = async (devicePushToken) => {
    if (!projectId) {
      return { status: 'error', reason: PUSH_RESULT_REASONS.PROJECT_ID_MISSING };
    }
    try {
      const expoToken = await notifications.getExpoPushTokenAsync({
        projectId,
        ...(devicePushToken ? { devicePushToken } : {}),
      });
      const token = expoToken?.data;
      if (typeof token !== 'string' || !token) throw new Error('Expo push token is missing.');
      const previousToken = await storage.getItem(STORED_EXPO_PUSH_TOKEN_KEY);
      await callables.registerDevice({
        token,
        platform,
        projectId,
        schemaVersion: PUSH_SCHEMA_VERSION,
        timeZone: timeZone(),
        ...(appVersion ? { appVersion } : {}),
      });
      await storage.setItem(STORED_EXPO_PUSH_TOKEN_KEY, token);
      if (previousToken && previousToken !== token) {
        try {
          await callables.unregisterDevice(previousToken);
        } catch (error) {
          reportError('unregister_replaced_device', error);
        }
      }
      return { status: 'registered' };
    } catch (error) {
      reportError('register_device', error);
      return { status: 'error', reason: PUSH_RESULT_REASONS.REGISTRATION_FAILED };
    }
  };

  const handlePushTokenRolloverNow = async (devicePushToken) => {
    try {
      // Expo can publish native-token changes independently of the opt-in flow.
      // A locally remembered Expo token is our signal that this installation was
      // previously registered; do not recreate a device record after opt-out.
      const registeredToken = await storage.getItem(STORED_EXPO_PUSH_TOKEN_KEY);
      if (!registeredToken) return { status: 'not_registered' };
      return registerToken(devicePushToken);
    } catch (error) {
      reportError('token_rollover', error);
      return { status: 'error', reason: PUSH_RESULT_REASONS.REGISTRATION_FAILED };
    }
  };

  const registerForPushNotifications = async ({ requestPermission = false } = {}) => {
    try {
      await configureAndroidChannels(notifications, platform);
      let permission = await notifications.getPermissionsAsync();
      if (!isNotificationPermissionGranted(permission, notifications, platform)) {
        if (!requestPermission) {
          return { status: 'permission_required', reason: PUSH_RESULT_REASONS.PERMISSION_REQUIRED };
        }
        permission = await notifications.requestPermissionsAsync({
          ios: { allowAlert: true, allowBadge: true, allowSound: true },
        });
      }
      if (!isNotificationPermissionGranted(permission, notifications, platform)) {
        await unregisterStoredToken();
        return { status: 'permission_denied', reason: PUSH_RESULT_REASONS.PERMISSION_DENIED };
      }
      return registerToken();
    } catch (error) {
      reportError('permission', error);
      return { status: 'error', reason: PUSH_RESULT_REASONS.REGISTRATION_FAILED };
    }
  };

  const enablePushNow = async () => {
    const registration = await registerForPushNotifications({ requestPermission: true });
    if (registration.status !== 'registered') return registration;
    try {
      const preferences = await callables.setPreferences({ pushEnabled: true });
      await rememberPermissionOnboardingHandled();
      return { status: 'enabled', preferences: normalizePushPreferences(preferences) };
    } catch (error) {
      reportError('enable_preferences', error);
      return { status: 'error', reason: PUSH_RESULT_REASONS.PREFERENCES_FAILED };
    }
  };

  const requestInitialPermissionNow = async ({ enableForCurrentUser = false } = {}) => {
    try {
      const storedState = await storage.getItem(STORED_PUSH_PERMISSION_ONBOARDING_KEY);
      if (storedState === PUSH_PERMISSION_ONBOARDING_STATES.DENIED) {
        return { status: 'permission_denied', reason: PUSH_RESULT_REASONS.PERMISSION_DENIED };
      }
      if (storedState === PUSH_PERMISSION_ONBOARDING_STATES.GRANTED_ENROLLED) {
        return { status: 'already_enrolled' };
      }

      if (enableForCurrentUser) {
        try {
          const currentPreferences = await callables.getPreferences();
          if (currentPreferences?.configured === true && currentPreferences.pushEnabled !== true) {
            await rememberPermissionOnboardingHandled();
            return {
              status: 'already_configured',
              preferences: normalizePushPreferences(currentPreferences),
            };
          }
        } catch (error) {
          reportError('read_existing_preferences', error);
          return { status: 'error', reason: PUSH_RESULT_REASONS.PREFERENCES_FAILED };
        }
      }

      let permissionState = storedState;
      if (permissionState !== PUSH_PERMISSION_ONBOARDING_STATES.GRANTED_PENDING) {
        await configureAndroidChannels(notifications, platform);
        let permission = await notifications.getPermissionsAsync();
        if (!isNotificationPermissionGranted(permission, notifications, platform)) {
          permission = await notifications.requestPermissionsAsync({
            ios: { allowAlert: true, allowBadge: true, allowSound: true },
          });
        }
        if (!isNotificationPermissionGranted(permission, notifications, platform)) {
          await storage.setItem(
            STORED_PUSH_PERMISSION_ONBOARDING_KEY,
            PUSH_PERMISSION_ONBOARDING_STATES.DENIED
          );
          return { status: 'permission_denied', reason: PUSH_RESULT_REASONS.PERMISSION_DENIED };
        }
        permissionState = PUSH_PERMISSION_ONBOARDING_STATES.GRANTED_PENDING;
        await storage.setItem(STORED_PUSH_PERMISSION_ONBOARDING_KEY, permissionState);
      }

      if (!enableForCurrentUser) return { status: 'permission_granted_pending' };
      return enablePushNow();
    } catch (error) {
      reportError('initial_permission', error);
      return { status: 'error', reason: PUSH_RESULT_REASONS.REGISTRATION_FAILED };
    }
  };

  const disablePushNow = async () => {
    let preferences = null;
    let preferenceError = null;
    try {
      preferences = await callables.setPreferences({ pushEnabled: false });
    } catch (error) {
      preferenceError = error;
      reportError('disable_preferences', error);
    }
    const unregistered = await unregisterStoredToken();
    if (preferenceError) {
      return { status: 'error', reason: PUSH_RESULT_REASONS.PREFERENCES_FAILED };
    }
    await rememberPermissionOnboardingHandled();
    return {
      status: 'disabled',
      preferences: normalizePushPreferences(preferences),
      deviceStatus: unregistered.status,
    };
  };

  const setPreferencesNow = async (preferences) => {
    const patch = sanitizePushPreferencePatch(preferences);
    if (patch.pushEnabled === true) {
      const current = normalizePushPreferences(await callables.getPreferences());
      if (!current.pushEnabled) {
        const registration = await registerForPushNotifications({ requestPermission: true });
        if (registration.status !== 'registered') {
          const error = new Error('Push notification registration did not complete.');
          error.code = 'push/registration-failed';
          error.details = { reason: registration.reason || registration.status };
          throw error;
        }
      }
      const updated = normalizePushPreferences(await callables.setPreferences(patch));
      await rememberPermissionOnboardingHandled();
      return updated;
    }
    if (patch.pushEnabled === false) {
      const updated = normalizePushPreferences(await callables.setPreferences(patch));
      await unregisterStoredToken();
      await rememberPermissionOnboardingHandled();
      return updated;
    }
    return normalizePushPreferences(await callables.setPreferences(patch));
  };

  const handlePushTokenRollover = (devicePushToken) => runRegistrationTransition(
    () => handlePushTokenRolloverNow(devicePushToken)
  );
  const requestInitialPermission = (options) => runRegistrationTransition(
    () => requestInitialPermissionNow(options)
  );
  const enablePush = () => runRegistrationTransition(enablePushNow);
  const disablePush = () => runRegistrationTransition(disablePushNow);
  const setPreferences = (preferences) => runRegistrationTransition(
    () => setPreferencesNow(preferences)
  );

  const start = async ({ syncRegistration = true } = {}) => {
    if (started) return { status: 'started' };
    started = true;
    notifications.setNotificationHandler?.({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
    subscriptions.push(
      notifications.addNotificationReceivedListener?.((notification) => {
        try {
          const intent = notificationIntentFromNotification(notification);
          if (intent) {
            void Promise.resolve(onForegroundNotification(intent)).catch((error) => {
              reportError('foreground_notification', error);
            });
          }
        } catch (error) {
          reportError('foreground_notification', error);
        }
      }),
      notifications.addNotificationResponseReceivedListener?.((response) => {
        void handleResponse(response);
      }),
      notifications.addPushTokenListener?.((devicePushToken) => {
        void handlePushTokenRollover(devicePushToken);
      })
    );

    try {
      const lastResponse = await notifications.getLastNotificationResponseAsync?.();
      if (lastResponse) await handleResponse(lastResponse);
    } catch (error) {
      reportError('initial_response', error);
    }

    if (syncRegistration) {
      try {
        await runRegistrationTransition(async () => {
          const preferences = normalizePushPreferences(await callables.getPreferences());
          if (preferences.pushEnabled) {
            await registerForPushNotifications({ requestPermission: false });
          } else {
            await reconcileStoredTokenForDisabledAccount();
          }
        });
      } catch (error) {
        reportError('sync_preferences', error);
      }
    }
    return { status: 'started' };
  };

  const stop = () => {
    subscriptions.splice(0).forEach((subscription) => subscription?.remove?.());
    started = false;
  };

  return Object.freeze({
    isSupported: true,
    start,
    stop,
    enablePush,
    disablePush,
    requestInitialPermission,
    registerForPushNotifications,
    handlePushTokenRollover,
    unregisterCurrentDevice: () => runRegistrationTransition(unregisterStoredToken),
    getPreferences: () => callables.getPreferences(),
    setPreferences,
    handleResponse,
    flushPendingResponse: async () => (
      pendingResponse ? handleResponse(pendingResponse) : false
    ),
  });
}
