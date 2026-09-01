export const PUSH_SCHEMA_VERSION = 1;

export const PUSH_CHANNELS = Object.freeze({
  LIKES: 'likes',
  COMMENTS: 'comments',
  SYSTEM: 'system',
  ADMIN_REPORTS: 'adminReports',
  ADMIN_DESTINATIONS: 'adminDestinations',
});

export const PUSH_CHANNEL_VALUES = Object.freeze(Object.values(PUSH_CHANNELS));

export const NOTIFICATION_INBOX_CHANNELS = Object.freeze({
  PERSONAL: 'personal',
  ADMIN: 'admin',
});

export const NOTIFICATION_INBOX_CHANNEL_VALUES = Object.freeze(
  Object.values(NOTIFICATION_INBOX_CHANNELS)
);

export const ANDROID_NOTIFICATION_CHANNELS = Object.freeze({
  [PUSH_CHANNELS.LIKES]: Object.freeze({
    id: 'planli-likes',
    name: 'לייקים',
  }),
  [PUSH_CHANNELS.COMMENTS]: Object.freeze({
    id: 'planli-comments',
    name: 'תגובות',
  }),
  [PUSH_CHANNELS.SYSTEM]: Object.freeze({
    id: 'planli-system',
    name: 'עדכוני מערכת',
  }),
  [PUSH_CHANNELS.ADMIN_REPORTS]: Object.freeze({
    id: 'planli-admin-reports',
    name: 'דיווחים לניהול',
  }),
  [PUSH_CHANNELS.ADMIN_DESTINATIONS]: Object.freeze({
    id: 'planli-admin-destinations',
    name: 'יעדים לניהול',
  }),
});

export const STORED_EXPO_PUSH_TOKEN_KEY = '@planli/notifications/expoPushToken';
export const STORED_PUSH_PERMISSION_ONBOARDING_KEY = '@planli/notifications/permissionOnboardingV1';

export const PUSH_PERMISSION_ONBOARDING_STATES = Object.freeze({
  DENIED: 'denied',
  GRANTED_PENDING: 'granted_pending',
  GRANTED_ENROLLED: 'granted_enrolled',
});

export const PUSH_RESULT_REASONS = Object.freeze({
  PERMISSION_REQUIRED: 'PERMISSION_REQUIRED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  PROJECT_ID_MISSING: 'PROJECT_ID_MISSING',
  REGISTRATION_FAILED: 'REGISTRATION_FAILED',
  UNREGISTRATION_FAILED: 'UNREGISTRATION_FAILED',
  PREFERENCES_FAILED: 'PREFERENCES_FAILED',
  UNSUPPORTED: 'UNSUPPORTED',
});
