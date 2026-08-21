import {
  createNotificationPushCoordinator,
  isNotificationPermissionGranted,
  notificationIntentFromResponse,
} from '../createNotificationPushCoordinator';
import {
  ANDROID_NOTIFICATION_CHANNELS,
  PUSH_SCHEMA_VERSION,
  STORED_EXPO_PUSH_TOKEN_KEY,
} from '../constants';

const token = (value) => `ExpoPushToken[${value}]`;

function notificationResponse(data, options = {}) {
  return {
    actionIdentifier: options.actionIdentifier || 'default',
    notification: {
      request: {
        identifier: options.requestId || 'request-1',
        content: { data },
      },
    },
  };
}

function makeStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: jest.fn(async (key) => values.get(key) || null),
    setItem: jest.fn(async (key, value) => values.set(key, value)),
    removeItem: jest.fn(async (key) => values.delete(key)),
    values,
  };
}

function makeNotifications(overrides = {}) {
  const listeners = {};
  const removed = [];
  const addListener = (name) => jest.fn((listener) => {
    listeners[name] = listener;
    const subscription = { remove: jest.fn(() => removed.push(name)) };
    return subscription;
  });
  return {
    DEFAULT_ACTION_IDENTIFIER: 'default',
    IosAuthorizationStatus: { AUTHORIZED: 2, PROVISIONAL: 3, EPHEMERAL: 4 },
    AndroidImportance: { HIGH: 4 },
    getPermissionsAsync: jest.fn(async () => ({ granted: true })),
    requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
    getExpoPushTokenAsync: jest.fn(async () => ({ data: token('new') })),
    setNotificationChannelAsync: jest.fn(async () => {}),
    setNotificationHandler: jest.fn(),
    addNotificationReceivedListener: addListener('received'),
    addNotificationResponseReceivedListener: addListener('response'),
    addPushTokenListener: addListener('token'),
    getLastNotificationResponseAsync: jest.fn(async () => null),
    clearLastNotificationResponseAsync: jest.fn(async () => {}),
    listeners,
    removed,
    ...overrides,
  };
}

function makeCallables(overrides = {}) {
  return {
    registerDevice: jest.fn(async () => ({ registered: true })),
    unregisterDevice: jest.fn(async () => ({ unregistered: true })),
    getPreferences: jest.fn(async () => ({ pushEnabled: false })),
    setPreferences: jest.fn(async (preferences) => preferences),
    ...overrides,
  };
}

function makeCoordinator(overrides = {}) {
  const notifications = overrides.notifications || makeNotifications();
  const callables = overrides.callables || makeCallables();
  const storage = overrides.storage || makeStorage();
  const coordinator = createNotificationPushCoordinator({
    notifications,
    callables,
    storage,
    platform: 'ios',
    projectId: 'project-id',
    timeZone: () => 'Asia/Jerusalem',
    ...overrides,
  });
  return { coordinator, notifications, callables, storage };
}

describe('notification push coordinator', () => {
  it('exposes only a validated notification id and channel from responses', () => {
    const result = notificationIntentFromResponse(notificationResponse({
      notificationId: 'notification_1',
      channel: 'personal',
      targetId: 'private-target',
      route: 'AdminPanel',
    }), makeNotifications());

    expect(result).toEqual({ notificationId: 'notification_1', channel: 'personal' });
    expect(Object.keys(result)).toEqual(['notificationId', 'channel']);
    expect(notificationIntentFromResponse(notificationResponse({
      notificationId: 'bad/id', channel: 'personal',
    }), makeNotifications())).toBeNull();
    expect(notificationIntentFromResponse(notificationResponse({
      notificationId: 'notification_1', channel: 'likes',
    }), makeNotifications())).toBeNull();
    expect(notificationIntentFromResponse(notificationResponse({
      notificationId: 'notification_1', channel: 'personal',
    }, { actionIdentifier: 'dismiss' }), makeNotifications())).toBeNull();
  });

  it('recognizes iOS provisional permission as usable', () => {
    const notifications = makeNotifications();
    expect(isNotificationPermissionGranted({
      granted: false,
      ios: { status: notifications.IosAuthorizationStatus.PROVISIONAL },
    }, notifications, 'ios')).toBe(true);
    expect(isNotificationPermissionGranted({ granted: false }, notifications, 'android')).toBe(false);
  });

  it('registers with the EAS project id and atomically rolls the remembered token forward', async () => {
    const oldToken = token('old');
    const newToken = token('new');
    const storage = makeStorage({ [STORED_EXPO_PUSH_TOKEN_KEY]: oldToken });
    const notifications = makeNotifications({
      getExpoPushTokenAsync: jest.fn(async () => ({ data: newToken })),
    });
    const { coordinator, callables } = makeCoordinator({ notifications, storage });

    await expect(coordinator.handlePushTokenRollover({ type: 'ios', data: 'apns-token' }))
      .resolves.toEqual({ status: 'registered' });
    expect(notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({
      projectId: 'project-id',
      devicePushToken: { type: 'ios', data: 'apns-token' },
    });
    expect(callables.registerDevice).toHaveBeenCalledWith({
      token: newToken,
      platform: 'ios',
      projectId: 'project-id',
      schemaVersion: PUSH_SCHEMA_VERSION,
      timeZone: 'Asia/Jerusalem',
    });
    expect(storage.values.get(STORED_EXPO_PUSH_TOKEN_KEY)).toBe(newToken);
    expect(callables.unregisterDevice).toHaveBeenCalledWith(oldToken);
  });

  it('does not recreate a device record from a token event after opt-out', async () => {
    const { coordinator, notifications, callables } = makeCoordinator();

    await expect(coordinator.handlePushTokenRollover({ type: 'ios', data: 'apns-token' }))
      .resolves.toEqual({ status: 'not_registered' });
    expect(notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(callables.registerDevice).not.toHaveBeenCalled();
  });

  it('configures Android channels before registration', async () => {
    const notifications = makeNotifications();
    const { coordinator } = makeCoordinator({ notifications, platform: 'android' });

    await expect(coordinator.registerForPushNotifications())
      .resolves.toEqual({ status: 'registered' });
    expect(notifications.setNotificationChannelAsync).toHaveBeenCalledTimes(
      Object.keys(ANDROID_NOTIFICATION_CHANNELS).length
    );
    Object.values(ANDROID_NOTIFICATION_CHANNELS).forEach((channel) => {
      expect(notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
        channel.id,
        expect.objectContaining({ name: channel.name, importance: 4 })
      );
    });
    expect(notifications.setNotificationChannelAsync.mock.invocationCallOrder[0])
      .toBeLessThan(notifications.getExpoPushTokenAsync.mock.invocationCallOrder[0]);
  });

  it('does not request permission during background synchronization', async () => {
    const notifications = makeNotifications({
      getPermissionsAsync: jest.fn(async () => ({ granted: false })),
    });
    const { coordinator, callables } = makeCoordinator({ notifications });

    await expect(coordinator.registerForPushNotifications({ requestPermission: false }))
      .resolves.toEqual({ status: 'permission_required', reason: 'PERMISSION_REQUIRED' });
    expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(callables.registerDevice).not.toHaveBeenCalled();
  });

  it('reclaims and removes a remembered token when the authenticated account has push disabled', async () => {
    const rememberedToken = token('previous-account');
    const storage = makeStorage({ [STORED_EXPO_PUSH_TOKEN_KEY]: rememberedToken });
    const callables = makeCallables({
      getPreferences: jest.fn(async () => ({ pushEnabled: false })),
    });
    const { coordinator, notifications } = makeCoordinator({ callables, storage });

    await expect(coordinator.start({ syncRegistration: true }))
      .resolves.toEqual({ status: 'started' });

    expect(callables.registerDevice).toHaveBeenCalledWith({
      token: rememberedToken,
      platform: 'ios',
      projectId: 'project-id',
      schemaVersion: PUSH_SCHEMA_VERSION,
      timeZone: 'Asia/Jerusalem',
    });
    expect(callables.unregisterDevice).toHaveBeenCalledWith(rememberedToken);
    expect(storage.values.has(STORED_EXPO_PUSH_TOKEN_KEY)).toBe(false);
    expect(notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it('keeps a cold-start response pending until navigation is ready', async () => {
    let ready = false;
    const response = notificationResponse({
      notificationId: 'cold-start',
      channel: 'personal',
    });
    const notifications = makeNotifications({
      getLastNotificationResponseAsync: jest.fn(async () => response),
    });
    const onNotificationIntent = jest.fn(async () => ready);
    const foreground = jest.fn();
    const { coordinator } = makeCoordinator({
      notifications,
      onNotificationIntent,
      onForegroundNotification: foreground,
    });

    await coordinator.start({ syncRegistration: false });
    expect(onNotificationIntent).toHaveBeenCalledWith({
      notificationId: 'cold-start', channel: 'personal',
    });
    expect(notifications.clearLastNotificationResponseAsync).not.toHaveBeenCalled();

    notifications.listeners.received(response.notification);
    expect(foreground).toHaveBeenCalledWith({ notificationId: 'cold-start', channel: 'personal' });

    ready = true;
    await expect(coordinator.flushPendingResponse()).resolves.toBe(true);
    expect(notifications.clearLastNotificationResponseAsync).toHaveBeenCalledTimes(1);

    coordinator.stop();
    expect(notifications.removed).toEqual(expect.arrayContaining(['received', 'response', 'token']));
  });

  it('enables only after native registration and disables preferences before removing the token', async () => {
    const events = [];
    const storage = makeStorage({ [STORED_EXPO_PUSH_TOKEN_KEY]: token('current') });
    const callables = makeCallables({
      registerDevice: jest.fn(async () => { events.push('register'); }),
      setPreferences: jest.fn(async (patch) => {
        events.push(`preference:${patch.pushEnabled}`);
        return patch;
      }),
      unregisterDevice: jest.fn(async () => { events.push('unregister'); }),
    });
    const { coordinator } = makeCoordinator({ callables, storage });

    await expect(coordinator.enablePush()).resolves.toMatchObject({ status: 'enabled' });
    expect(events).toEqual(['register', 'unregister', 'preference:true']);

    events.length = 0;
    await expect(coordinator.disablePush()).resolves.toMatchObject({ status: 'disabled' });
    expect(events).toEqual(['preference:false', 'unregister']);
    expect(storage.values.has(STORED_EXPO_PUSH_TOKEN_KEY)).toBe(false);
  });

  it('uses the safe preference path to register only on a new global opt-in', async () => {
    const callables = makeCallables({
      getPreferences: jest.fn(async () => ({ pushEnabled: false })),
    });
    const { coordinator, notifications } = makeCoordinator({ callables });

    await expect(coordinator.setPreferences({ pushEnabled: true, comments: false }))
      .resolves.toMatchObject({ pushEnabled: true, comments: false });
    expect(notifications.getExpoPushTokenAsync).toHaveBeenCalledTimes(1);
    expect(callables.setPreferences).toHaveBeenCalledWith({
      pushEnabled: true,
      comments: false,
    });

    notifications.getExpoPushTokenAsync.mockClear();
    callables.getPreferences.mockResolvedValue({ pushEnabled: true });
    await coordinator.setPreferences({ pushEnabled: true, likes: false });
    expect(notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });
});
