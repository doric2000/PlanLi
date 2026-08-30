const KEY = 'planli.guest-session.v1';

function storage() {
  return typeof sessionStorage === 'undefined' ? null : sessionStorage;
}

export const guestSessionStorage = {
  async get() { return storage()?.getItem(KEY) || null; },
  async set(value) { storage()?.setItem(KEY, value); },
  async clear() { storage()?.removeItem(KEY); },
};
