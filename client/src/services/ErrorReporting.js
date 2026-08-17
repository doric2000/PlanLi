import * as Sentry from '@sentry/react-native';

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const SENSITIVE_QUERY_PATTERN = /([?&](?:access_token|auth|code|key|secret|token)=)[^&\s]+/gi;

export function sanitizeDiagnosticText(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(EMAIL_PATTERN, '[redacted-email]')
    .replace(BEARER_PATTERN, 'Bearer [redacted]')
    .replace(SENSITIVE_QUERY_PATTERN, '$1[redacted]');
}

function scrubEvent(event) {
  delete event.user;
  delete event.request;
  delete event.breadcrumbs;
  delete event.extra;
  delete event.contexts;
  delete event.tags;

  if (event.message) event.message = sanitizeDiagnosticText(event.message);
  event.exception?.values?.forEach((exception) => {
    if (exception.value) exception.value = sanitizeDiagnosticText(exception.value);
  });
  return event;
}

export function initializeErrorReporting() {
  const dsn = String(process.env.EXPO_PUBLIC_SENTRY_DSN || '').trim();
  const enabled = Boolean(dsn) && !__DEV__;

  Sentry.init({
    dsn: dsn || undefined,
    enabled,
    environment: 'testflight',
    debug: false,
    sendDefaultPii: false,
    maxBreadcrumbs: 0,
    enableAutoSessionTracking: false,
    enableAutoPerformanceTracing: false,
    enableAppStartTracking: false,
    enableUserInteractionTracing: false,
    tracesSampleRate: 0,
    profilesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    attachScreenshot: false,
    attachViewHierarchy: false,
    enableCaptureFailedRequests: false,
    beforeSend: scrubEvent,
  });

  return enabled;
}

export const withErrorReporting = Sentry.wrap;
