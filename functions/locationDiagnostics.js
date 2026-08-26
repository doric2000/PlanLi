const crypto = require('crypto');
const { HttpsError } = require('firebase-functions/v2/https');

const INCIDENT_ID_PATTERN = /^loc_[A-Za-z0-9_-]{8,48}$/;
const PROVIDER_ENDPOINTS = new Set([
  'places_autocomplete', 'places_details', 'legacy_autocomplete',
  'legacy_details', 'geocode', 'google_provider',
]);
const PROVIDER_STATUSES = new Set(['timeout', 'network_error', 'unknown']);
const SAFE_REASON_PATTERN = /^(?:[A-Z][A-Z0-9_]{2,79}|[a-z][a-z0-9_]{2,79})$/;

function createIncidentId(value) {
  const supplied = String(value || '').trim();
  if (INCIDENT_ID_PATTERN.test(supplied)) return supplied;
  return `loc_${crypto.randomBytes(9).toString('base64url')}`;
}

function normalizedCode(error) {
  return String(error?.code || 'internal').replace(/^functions\//, '');
}

function reasonForLocationError(error, fallback = 'location_resolution_failed') {
  const code = normalizedCode(error);
  const message = String(error?.message || '').toLowerCase();
  if (['not-found', 'deadline-exceeded'].includes(code) && message.includes('expired')) {
    return 'selection_expired';
  }
  if (code === 'resource-exhausted' && message.includes('daily')) return 'daily_limit_reached';
  if (code === 'resource-exhausted' &&
    (message.includes('too many new places') || message.includes('at most five places'))) {
    return 'provider_call_limit_reached';
  }
  if (code === 'resource-exhausted' && message.includes('safe google request')) return 'provider_call_limit_reached';
  if (code === 'resource-exhausted') return 'temporary_limit_reached';
  if (code === 'deadline-exceeded' || message.includes('too long')) return 'provider_timeout';
  if (code === 'not-found') return 'place_not_found';
  if (message.includes('ambiguous')) return 'ambiguous_destination';
  if (message.includes('trustworthy destination') || message.includes('containing destination')) {
    return 'destination_not_resolved';
  }
  if (code === 'unavailable') return 'provider_unavailable';
  if (code === 'invalid-argument') return 'invalid_selection';
  return fallback;
}

function retryableLocationError(error) {
  const reason = String(error?.details?.reason || reasonForLocationError(error));
  return ['temporary_limit_reached', 'provider_timeout', 'provider_unavailable'].includes(reason);
}

function preservedErrorReason(error) {
  const reason = String(error?.details?.reason || '').trim();
  return SAFE_REASON_PATTERN.test(reason) ? reason : '';
}

function decorateLocationError(error, incidentId, fallbackReason) {
  const code = normalizedCode(error);
  const safeCode = [
    'aborted', 'already-exists', 'cancelled', 'data-loss', 'deadline-exceeded',
    'failed-precondition', 'internal', 'invalid-argument', 'not-found',
    'permission-denied', 'resource-exhausted', 'unauthenticated', 'unavailable',
  ].includes(code) ? code : 'internal';
  const message = error instanceof HttpsError
    ? error.message
    : 'The location request could not be completed.';
  const reason = preservedErrorReason(error) || reasonForLocationError(error, fallbackReason);
  const retryable = typeof error?.details?.retryable === 'boolean'
    ? error.details.retryable
    : retryableLocationError({ ...error, details: { reason } });
  return new HttpsError(safeCode, message, {
    reason,
    incidentId,
    retryable,
  });
}

function locationLog(stage, {
  incidentId,
  outcome,
  durationMs,
  reason,
  providerCalls,
  fallbackPath,
  providerEndpoint,
  providerStatus,
} = {}) {
  const safeProviderEndpoint = PROVIDER_ENDPOINTS.has(providerEndpoint)
    ? providerEndpoint
    : null;
  const safeProviderStatus = Number.isInteger(providerStatus) && providerStatus >= 100 && providerStatus <= 599
    ? providerStatus
    : PROVIDER_STATUSES.has(providerStatus) ? providerStatus : null;
  const payload = {
    incidentId,
    stage,
    outcome,
    durationMs: Number(durationMs || 0),
    functionRevision: process.env.K_REVISION || 'local',
    ...(reason ? { reason } : {}),
    ...(Number.isFinite(providerCalls) ? { providerCalls } : {}),
    ...(fallbackPath ? { fallbackPath } : {}),
    ...(safeProviderEndpoint ? { providerEndpoint: safeProviderEndpoint } : {}),
    ...(safeProviderStatus !== null ? { providerStatus: safeProviderStatus } : {}),
  };
  if (outcome === 'failed') console.warn('location_request', payload);
  else console.info('location_request', payload);
}

module.exports = {
  createIncidentId,
  decorateLocationError,
  locationLog,
  reasonForLocationError,
  retryableLocationError,
};
