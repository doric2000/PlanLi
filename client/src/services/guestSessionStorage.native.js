import * as SecureStore from 'expo-secure-store';

const KEY = 'planli.guest-session.v1';
const OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export const guestSessionStorage = {
  get: () => SecureStore.getItemAsync(KEY, OPTIONS),
  set: (value) => SecureStore.setItemAsync(KEY, value, OPTIONS),
  clear: () => SecureStore.deleteItemAsync(KEY, OPTIONS),
};
