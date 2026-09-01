import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';

let mockInstalledHandlers;
let mockAuthValue;
const mockRuntime = {
  start: jest.fn(async () => ({ status: 'started' })),
  stop: jest.fn(),
  flushPendingResponse: jest.fn(async () => false),
  requestInitialPermission: jest.fn(async () => ({ status: 'already_enrolled' })),
  unregisterCurrentDevice: jest.fn(async () => ({ status: 'unregistered' })),
};

jest.mock('../src/hooks/useAuthUser', () => ({
  useAuthUser: () => mockAuthValue,
}));

jest.mock('../src/features/notifications/push/runtimeManager', () => ({
  getNotificationPushRuntime: () => mockRuntime,
  setNotificationPushRuntimeHandlers: (handlers) => {
    mockInstalledHandlers = handlers;
    return jest.fn();
  },
}));

jest.mock('../src/services/ErrorReporting', () => ({
  addDiagnosticBreadcrumb: jest.fn(),
  captureDiagnosticException: jest.fn(),
}));

const NotificationPushBridge = require(
  '../src/features/notifications/push/NotificationPushBridge'
).default;
const { buildNotificationCenterPath } = require(
  '../src/features/notifications/push/NotificationPushBridge'
);
const {
  setNotificationDeviceUnregisterHandler,
  unregisterNotificationDeviceBeforeSignOut,
} = require('../src/features/notifications/push/session');
const { createNotificationPushCoordinator } = require(
  '../src/features/notifications/push/createNotificationPushCoordinator'
);

describe('NotificationPushBridge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInstalledHandlers = null;
    mockAuthValue = { user: { uid: 'user-1' }, loading: false };
  });

  it('waits for auth hydration before starting first-launch onboarding', async () => {
    mockAuthValue = { user: null, loading: true };
    const navigationRef = { isReady: jest.fn(() => true), navigate: jest.fn() };
    const screen = render(
      <NotificationPushBridge navigationRef={navigationRef} navigationReady />
    );

    await act(async () => { await Promise.resolve(); });
    expect(mockRuntime.requestInitialPermission).not.toHaveBeenCalled();

    mockAuthValue = { user: null, loading: false };
    screen.rerender(
      <NotificationPushBridge navigationRef={navigationRef} navigationReady />
    );
    await waitFor(() => expect(mockRuntime.requestInitialPermission).toHaveBeenCalledWith({
      enableForCurrentUser: false,
    }));
  });

  it('routes a validated push intent through the authenticated notification tab', async () => {
    const navigationRef = {
      isReady: jest.fn(() => true),
      navigate: jest.fn(),
    };
    render(<NotificationPushBridge navigationRef={navigationRef} navigationReady />);

    await waitFor(() => expect(mockRuntime.requestInitialPermission).toHaveBeenCalledWith({
      enableForCurrentUser: true,
    }));
    await waitFor(() => expect(mockRuntime.start).toHaveBeenCalledWith({ syncRegistration: true }));
    await act(async () => {
      await mockInstalledHandlers.onIntent({ notificationId: 'notice-1', channel: 'admin' });
    });

    expect(navigationRef.navigate).toHaveBeenCalledWith(
      'Main',
      buildNotificationCenterPath({ notificationId: 'notice-1', channel: 'admin' })
    );
  });

  it('keeps sign-out device cleanup best-effort', async () => {
    const unregister = jest.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ status: 'unregistered' });
    const clear = setNotificationDeviceUnregisterHandler(unregister);

    await expect(unregisterNotificationDeviceBeforeSignOut()).resolves.toBe(false);
    await expect(unregisterNotificationDeviceBeforeSignOut()).resolves.toBe(true);
    expect(unregister).toHaveBeenCalledTimes(2);
    clear();
  });

  it('bounds a stalled sign-out device cleanup', async () => {
    const clear = setNotificationDeviceUnregisterHandler(() => new Promise(() => {}));
    await expect(unregisterNotificationDeviceBeforeSignOut({ timeoutMs: 5 })).resolves.toBe(false);
    clear();
  });

  it('deduplicates concurrent delivery of the same cold-start response', async () => {
    let resolveIntent;
    const onNotificationIntent = jest.fn(() => new Promise((resolve) => { resolveIntent = resolve; }));
    const notifications = {
      DEFAULT_ACTION_IDENTIFIER: 'default',
      clearLastNotificationResponseAsync: jest.fn(async () => {}),
    };
    const coordinator = createNotificationPushCoordinator({
      notifications,
      callables: {},
      storage: {},
      platform: 'ios',
      projectId: 'project',
      onNotificationIntent,
    });
    const response = {
      actionIdentifier: 'default',
      notification: { request: { identifier: 'request-1', content: {
        data: { notificationId: 'notice-1', channel: 'personal' },
      } } },
    };
    const first = coordinator.handleResponse(response);
    const second = coordinator.handleResponse(response);
    expect(onNotificationIntent).toHaveBeenCalledTimes(1);
    resolveIntent(true);
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(notifications.clearLastNotificationResponseAsync).toHaveBeenCalledTimes(1);
  });
});
