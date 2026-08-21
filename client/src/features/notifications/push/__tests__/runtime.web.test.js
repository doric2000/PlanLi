jest.mock('../callables', () => ({
  createNotificationPushCallableClient: jest.fn(() => ({
    getPreferences: jest.fn(),
    setPreferences: jest.fn(),
  })),
}));

import { createNotificationPushRuntime } from '../runtime.web';

describe('web push runtime', () => {
  it('is a native-push no-op without importing expo-notifications', async () => {
    const callables = {
      getPreferences: jest.fn(async () => ({ pushEnabled: false })),
      setPreferences: jest.fn(async (patch) => patch),
    };
    const runtime = createNotificationPushRuntime({ callables });

    expect(runtime.isSupported).toBe(false);
    await expect(runtime.start()).resolves.toEqual({
      status: 'unsupported', reason: 'UNSUPPORTED',
    });
    await expect(runtime.enablePush()).resolves.toEqual({
      status: 'unsupported', reason: 'UNSUPPORTED',
    });
    await expect(runtime.registerForPushNotifications()).resolves.toEqual({
      status: 'unsupported', reason: 'UNSUPPORTED',
    });
    await expect(runtime.setPreferences({ pushEnabled: true }))
      .rejects.toMatchObject({ code: 'push/unsupported' });
    expect(callables.setPreferences).not.toHaveBeenCalled();
  });
});
