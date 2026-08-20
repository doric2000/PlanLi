let invalidateProfile = () => {};

export function registerProfileResourceInvalidator(invalidator) {
  invalidateProfile = typeof invalidator === 'function' ? invalidator : () => {};
}

export function invalidateProfileResources(uid) {
  invalidateProfile(uid);
}
