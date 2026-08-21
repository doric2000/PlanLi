jest.mock('../src/features/notifications/push/callables', () => ({
  createNotificationPushCallableClient: jest.fn(() => ({
    getPreferences: jest.fn(),
    setPreferences: jest.fn(),
  })),
}));

import {
  loadNotificationPushPreferences,
  saveNotificationPushPreferences,
} from '../src/features/notifications/services/NotificationSettingsService';
import { createNotificationPushRuntime as createWebPushRuntime } from '../src/features/notifications/push/runtime.web';

const enabled = {
  pushEnabled: true,
  likes: true,
  comments: true,
  system: true,
  adminReports: true,
  adminDestinations: true,
};

const disabled = { ...enabled, pushEnabled: false };

function runtime(overrides = {}) {
  return {
    getPreferences: jest.fn().mockResolvedValue(disabled),
    setPreferences: jest.fn().mockImplementation((patch) => Promise.resolve({ ...disabled, ...patch })),
    enablePush: jest.fn().mockResolvedValue({ status: 'enabled', preferences: enabled }),
    disablePush: jest.fn().mockResolvedValue({ status: 'disabled', preferences: disabled }),
    ...overrides,
  };
}

describe('NotificationSettingsService', () => {
  it('loads and normalizes account preferences through the runtime', async () => {
    const pushRuntime = runtime();
    await expect(loadNotificationPushPreferences(pushRuntime)).resolves.toEqual(disabled);
    expect(pushRuntime.getPreferences).toHaveBeenCalledTimes(1);
  });

  it('registers the device before persisting categories when push is enabled', async () => {
    const pushRuntime = runtime({
      setPreferences: jest.fn().mockImplementation((patch) => Promise.resolve({ ...enabled, ...patch })),
    });
    const next = { ...enabled, comments: false };

    await expect(saveNotificationPushPreferences(next, disabled, pushRuntime)).resolves.toEqual(next);
    expect(pushRuntime.enablePush).toHaveBeenCalledTimes(1);
    expect(pushRuntime.disablePush).not.toHaveBeenCalled();
    expect(pushRuntime.setPreferences).toHaveBeenCalledWith({
      likes: true,
      comments: false,
      system: true,
      adminReports: true,
      adminDestinations: true,
    });
    expect(pushRuntime.enablePush.mock.invocationCallOrder[0])
      .toBeLessThan(pushRuntime.setPreferences.mock.invocationCallOrder[0]);
  });

  it('unregisters the device while preserving category edits on opt-out', async () => {
    const pushRuntime = runtime();
    const next = { ...disabled, likes: false };

    await saveNotificationPushPreferences(next, enabled, pushRuntime);

    expect(pushRuntime.disablePush).toHaveBeenCalledTimes(1);
    expect(pushRuntime.setPreferences).toHaveBeenCalledWith({
      likes: false,
      comments: true,
      system: true,
      adminReports: true,
      adminDestinations: true,
    });
  });

  it('does not touch device registration for category-only edits', async () => {
    const pushRuntime = runtime();
    await saveNotificationPushPreferences({ ...disabled, system: false }, disabled, pushRuntime);

    expect(pushRuntime.enablePush).not.toHaveBeenCalled();
    expect(pushRuntime.disablePush).not.toHaveBeenCalled();
    expect(pushRuntime.setPreferences).toHaveBeenCalledWith({
      likes: true,
      comments: true,
      system: false,
      adminReports: true,
      adminDestinations: true,
    });
  });

  it('lets Web save categories for an already-enabled account without re-requesting push', async () => {
    const callables = {
      getPreferences: jest.fn(async () => enabled),
      setPreferences: jest.fn(async (patch) => ({ ...enabled, ...patch })),
    };
    const webRuntime = createWebPushRuntime({ callables });
    const next = { ...enabled, comments: false };

    await expect(saveNotificationPushPreferences(next, enabled, webRuntime)).resolves.toEqual(next);
    expect(callables.setPreferences).toHaveBeenCalledWith({
      likes: true,
      comments: false,
      system: true,
      adminReports: true,
      adminDestinations: true,
    });
  });

  it('rejects a denied permission without persisting an enabled preference', async () => {
    const pushRuntime = runtime({
      enablePush: jest.fn().mockResolvedValue({ status: 'permission_denied', reason: 'PERMISSION_DENIED' }),
    });

    await expect(saveNotificationPushPreferences(enabled, disabled, pushRuntime))
      .rejects.toMatchObject({ code: 'push/permission_denied' });
    expect(pushRuntime.setPreferences).not.toHaveBeenCalled();
  });
});
