jest.mock('firebase/functions', () => ({ httpsCallable: jest.fn() }));
jest.mock('firebase/firestore', () => ({ doc: jest.fn(), getDoc: jest.fn() }));
jest.mock('../../../../config/firebase', () => ({
  auth: { currentUser: null },
  cloudFunctions: {},
  db: {},
}));

import { createNotificationPushCallableClient } from '../callables';

describe('notification push callable client', () => {
  it('reads owner-visible preferences from notificationState without a getter callable', async () => {
    const createCallable = jest.fn();
    const readDoc = jest.fn(async () => ({
      exists: () => true,
      data: () => ({
        pushPreferences: { pushEnabled: true, comments: false },
      }),
    }));
    const makeDoc = jest.fn(() => ({ path: 'users/user-1/notificationState/state' }));
    const client = createNotificationPushCallableClient({
      functions: {},
      createCallable,
      firestore: {},
      firebaseAuth: { currentUser: { uid: 'user-1' } },
      readDoc,
      makeDoc,
    });

    await expect(client.getPreferences()).resolves.toMatchObject({
      pushEnabled: true,
      likes: true,
      comments: false,
    });
    expect(makeDoc).toHaveBeenCalledWith(
      expect.anything(),
      'users',
      'user-1',
      'notificationState',
      'state'
    );
    expect(createCallable).not.toHaveBeenCalled();
  });

  it('keeps signed-out preference defaults opt-out', async () => {
    const client = createNotificationPushCallableClient({
      functions: {},
      createCallable: jest.fn(),
      firebaseAuth: { currentUser: null },
    });
    await expect(client.getPreferences()).resolves.toMatchObject({
      pushEnabled: false,
      likes: true,
      comments: true,
    });
  });
});
