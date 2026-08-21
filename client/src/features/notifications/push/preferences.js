import { PUSH_CHANNEL_VALUES } from './constants';

export const DEFAULT_PUSH_PREFERENCES = Object.freeze({
  pushEnabled: false,
  likes: true,
  comments: true,
  system: true,
  adminReports: true,
  adminDestinations: true,
});

export const PUSH_PREFERENCE_FIELDS = Object.freeze([
  'pushEnabled',
  ...PUSH_CHANNEL_VALUES,
]);

export function sanitizePushPreferencePatch(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return PUSH_PREFERENCE_FIELDS.reduce((result, field) => {
    if (typeof value[field] === 'boolean') result[field] = value[field];
    return result;
  }, {});
}

export function normalizePushPreferences(
  value,
  fallback = DEFAULT_PUSH_PREFERENCES
) {
  const safeFallback = sanitizePushPreferencePatch(fallback);
  return {
    ...DEFAULT_PUSH_PREFERENCES,
    ...safeFallback,
    ...sanitizePushPreferencePatch(value),
  };
}
