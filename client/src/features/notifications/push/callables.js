import { httpsCallable } from 'firebase/functions';
import { doc, getDoc } from 'firebase/firestore';
import { auth, cloudFunctions, db } from '../../../config/firebase';
import {
  normalizePushPreferences,
  sanitizePushPreferencePatch,
} from './preferences';

const CALLABLE_NAMES = Object.freeze({
  REGISTER_DEVICE: 'registerNotificationDevice',
  UNREGISTER_DEVICE: 'unregisterNotificationDevice',
  UPDATE_PREFERENCES: 'updateNotificationPreferences',
});

export function createNotificationPushCallableClient({
  functions = cloudFunctions,
  createCallable = httpsCallable,
  firestore = db,
  firebaseAuth = auth,
  readDoc = getDoc,
  makeDoc = doc,
} = {}) {
  const cache = new Map();
  const call = async (name, data = {}) => {
    if (!cache.has(name)) cache.set(name, createCallable(functions, name));
    const response = await cache.get(name)(data);
    return response?.data || {};
  };

  return Object.freeze({
    async registerDevice(device) {
      return call(CALLABLE_NAMES.REGISTER_DEVICE, device);
    },

    async unregisterDevice(token) {
      return call(CALLABLE_NAMES.UNREGISTER_DEVICE, { token });
    },

    async getPreferences() {
      const uid = firebaseAuth.currentUser?.uid;
      if (!uid) return normalizePushPreferences(null);
      const snapshot = await readDoc(
        makeDoc(firestore, 'users', uid, 'notificationState', 'state')
      );
      return normalizePushPreferences(
        snapshot.exists() ? snapshot.data()?.pushPreferences : null
      );
    },

    async setPreferences(preferences) {
      const patch = sanitizePushPreferencePatch(preferences);
      const result = await call(CALLABLE_NAMES.UPDATE_PREFERENCES, {
        preferences: patch,
      });
      return normalizePushPreferences(result.preferences);
    },
  });
}

const defaultClient = createNotificationPushCallableClient();

export const registerNotificationDevice = (device) => defaultClient.registerDevice(device);
export const unregisterNotificationDevice = (token) => defaultClient.unregisterDevice(token);
export const getPushPreferences = () => defaultClient.getPreferences();
export const updateNotificationPreferences = (preferences) => (
  defaultClient.setPreferences(preferences)
);
export const setPushPreferences = updateNotificationPreferences;
