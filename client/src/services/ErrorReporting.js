import * as Sentry from '@sentry/react-native';

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const SENSITIVE_QUERY_PATTERN = /([?&](?:access_token|auth|code|key|secret|token)=)[^&\s]+/gi;
const SENSITIVE_KEY_PATTERN = /(?:authorization|cookie|email|password|secret|token|photo|image|latitude|longitude|location|requestbody|responsebody)/i;
const capturedErrors = new WeakSet();
const ALLOWED_BREADCRUMB_CATEGORIES = new Set([
  'action',
  'app.lifecycle',
  'auth',
  'auth.state',
  'callable',
  'navigation',
  'network',
  'ui.lifecycle',
]);
const ALLOWED_BREADCRUMB_DATA = new Set([
  'code',
  'durationMs',
  'from',
  'online',
  'operation',
  'outcome',
  'reason',
  'screen',
  'status',
  'to',
]);
const ALLOWED_TAGS = new Set([
  'app_version',
  'auth_state',
  'build',
  'error_code',
  'feature',
  'operation',
  'screen',
]);
const ALLOWED_CONTEXT_FIELDS = Object.freeze({
  app: new Set([
    'app_build',
    'app_identifier',
    'app_name',
    'app_start_time',
    'app_version',
    'in_foreground',
  ]),
  device: new Set([
    'arch',
    'battery_level',
    'brand',
    'charging',
    'family',
    'free_memory',
    'free_storage',
    'low_memory',
    'memory_size',
    'model',
    'model_id',
    'online',
    'orientation',
    'screen_density',
    'screen_dpi',
    'screen_resolution',
    'simulator',
    'storage_size',
  ]),
  os: new Set(['build', 'kernel_version', 'name', 'rooted', 'version']),
  runtime: new Set(['name', 'raw_description', 'version']),
  trace: new Set(['data', 'description', 'op', 'origin', 'parent_span_id', 'span_id', 'status', 'trace_id']),
});

export function sanitizeDiagnosticText(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(EMAIL_PATTERN, '[redacted-email]')
    .replace(BEARER_PATTERN, 'Bearer [redacted]')
    .replace(SENSITIVE_QUERY_PATTERN, '$1[redacted]');
}

function sanitizePrimitive(value) {
  if (typeof value === 'string') return sanitizeDiagnosticText(value).slice(0, 250);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return undefined;
}

function sanitizeAllowedObject(value, allowedKeys) {
  if (!value || typeof value !== 'object') return undefined;
  const sanitized = {};
  Object.entries(value).forEach(([key, fieldValue]) => {
    if (!allowedKeys.has(key) || SENSITIVE_KEY_PATTERN.test(key)) return;
    const safeValue = sanitizePrimitive(fieldValue);
    if (safeValue !== undefined) sanitized[key] = safeValue;
  });
  return Object.keys(sanitized).length ? sanitized : undefined;
}

export function scrubDiagnosticBreadcrumb(breadcrumb) {
  if (!breadcrumb || !ALLOWED_BREADCRUMB_CATEGORIES.has(breadcrumb.category)) return null;
  const data = sanitizeAllowedObject(breadcrumb.data, ALLOWED_BREADCRUMB_DATA);
  return {
    ...breadcrumb,
    ...(breadcrumb.message ? { message: sanitizeDiagnosticText(breadcrumb.message).slice(0, 250) } : {}),
    ...(data ? { data } : { data: undefined }),
  };
}

function scrubContexts(contexts) {
  if (!contexts || typeof contexts !== 'object') return undefined;
  const sanitized = {};
  Object.entries(ALLOWED_CONTEXT_FIELDS).forEach(([contextName, allowedKeys]) => {
    const value = sanitizeAllowedObject(contexts[contextName], allowedKeys);
    if (value) sanitized[contextName] = value;
  });
  return Object.keys(sanitized).length ? sanitized : undefined;
}

function scrubEvent(event) {
  delete event.request;
  delete event.extra;

  if (event.user?.id) event.user = { id: String(event.user.id).slice(0, 128) };
  else delete event.user;

  const breadcrumbs = (event.breadcrumbs || []).map(scrubDiagnosticBreadcrumb).filter(Boolean);
  if (breadcrumbs.length) event.breadcrumbs = breadcrumbs;
  else delete event.breadcrumbs;

  const contexts = scrubContexts(event.contexts);
  if (contexts) event.contexts = contexts;
  else delete event.contexts;

  const tags = sanitizeAllowedObject(event.tags, ALLOWED_TAGS);
  if (tags) event.tags = tags;
  else delete event.tags;

  if (event.message) event.message = sanitizeDiagnosticText(event.message);
  event.exception?.values?.forEach((exception) => {
    if (exception.value) exception.value = sanitizeDiagnosticText(exception.value);
  });
  return event;
}

function scrubTransaction(event) {
  scrubEvent(event);
  if (event.transaction) {
    event.transaction = sanitizeDiagnosticText(String(event.transaction)).slice(0, 128);
  }
  event.spans = (event.spans || []).map((span) => ({
    ...(span.trace_id ? { trace_id: span.trace_id } : {}),
    ...(span.span_id ? { span_id: span.span_id } : {}),
    ...(span.parent_span_id ? { parent_span_id: span.parent_span_id } : {}),
    ...(span.start_timestamp ? { start_timestamp: span.start_timestamp } : {}),
    ...(span.timestamp ? { timestamp: span.timestamp } : {}),
    ...(span.op ? { op: sanitizeDiagnosticText(String(span.op)).slice(0, 64) } : {}),
    ...(span.origin ? { origin: sanitizeDiagnosticText(String(span.origin)).slice(0, 64) } : {}),
    ...(span.status ? { status: span.status } : {}),
  }));
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
    maxBreadcrumbs: 50,
    enableAutoSessionTracking: false,
    enableAutoPerformanceTracing: true,
    enableAppStartTracking: true,
    enableUserInteractionTracing: false,
    tracesSampleRate: 0.1,
    profilesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1,
    replaysSessionQuality: 'low',
    attachScreenshot: false,
    attachViewHierarchy: false,
    enableCaptureFailedRequests: false,
    integrations: [Sentry.mobileReplayIntegration({
      maskAllText: true,
      maskAllImages: true,
      maskAllVectors: true,
    })],
    beforeBreadcrumb: scrubDiagnosticBreadcrumb,
    beforeSend: scrubEvent,
    beforeSendTransaction: scrubTransaction,
  });

  return enabled;
}

export function setErrorReportingUser(uid) {
  Sentry.setUser(uid ? { id: String(uid).slice(0, 128) } : null);
}

export function setDiagnosticTag(name, value) {
  if (!ALLOWED_TAGS.has(name) || SENSITIVE_KEY_PATTERN.test(name)) return;
  const safeValue = sanitizePrimitive(value);
  if (safeValue !== undefined) Sentry.setTag(name, String(safeValue).slice(0, 64));
}

export function addDiagnosticBreadcrumb({ category, message, level = 'info', data } = {}) {
  const breadcrumb = scrubDiagnosticBreadcrumb({ category, message, level, data });
  if (breadcrumb) Sentry.addBreadcrumb(breadcrumb);
}

export function isExpectedDiagnosticCancellation(error) {
  const code = String(error?.code || '').toLowerCase();
  return code === 'err_request_canceled' || code === 'auth/provider-cancelled';
}

export function captureDiagnosticException(error, { operation, code } = {}) {
  if (isExpectedDiagnosticCancellation(error)) return;
  if (error && typeof error === 'object') {
    if (capturedErrors.has(error)) return;
    capturedErrors.add(error);
  }
  Sentry.withScope((scope) => {
    if (operation) scope.setTag('operation', sanitizeDiagnosticText(String(operation)).slice(0, 64));
    if (code) scope.setTag('error_code', sanitizeDiagnosticText(String(code)).slice(0, 64));
    Sentry.captureException(error);
  });
}

export const withErrorReporting = Sentry.wrap;
