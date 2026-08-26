import { locationCopy } from './locationCopy';

function normalizedCode(error) {
  return String(error?.code || error?.details?.code || '')
    .toLowerCase()
    .replace(/^functions\//, '');
}

export function locationErrorKind(error) {
  const code = normalizedCode(error);
  const reason = String(error?.details?.reason || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  if (reason === 'selection_expired' || message.includes('expired')) return 'expired';
  if (reason === 'place_not_found') return 'placeNotFound';
  if (reason === 'provider_timeout' || code === 'deadline-exceeded') return 'timeout';
  if (reason === 'ambiguous_destination' || message.includes('ambiguous')) return 'ambiguous';
  if (reason === 'daily_limit_reached' || message.includes('daily')) return 'dailyQuota';
  if (reason === 'provider_call_limit_reached' || message.includes('safe google request')) return 'requestCeiling';
  if (reason === 'temporary_limit_reached' || code === 'resource-exhausted' ||
      message.includes('quota') || message.includes('limit reached')) return 'temporaryQuota';
  if (code === 'unavailable' || code === 'internal' || message.includes('network')) return 'network';
  return 'unknown';
}

export function locationIncidentId(error) {
  const incidentId = String(error?.details?.incidentId || '').trim();
  return /^loc_[A-Za-z0-9_-]{8,48}$/.test(incidentId) ? incidentId.slice(-8) : '';
}

export function locationErrorRetryable(error) {
  if (typeof error?.details?.retryable === 'boolean') return error.details.retryable;
  return ['temporaryQuota', 'timeout', 'network'].includes(locationErrorKind(error));
}

export function locationErrorMessage(error, locale = 'he') {
  const copy = locationCopy(locale);
  let message;
  switch (locationErrorKind(error)) {
    case 'dailyQuota': message = copy.errors.dailyQuota; break;
    case 'temporaryQuota': message = copy.errors.temporaryQuota; break;
    case 'requestCeiling': message = copy.errors.requestCeiling; break;
    case 'timeout': message = copy.errors.timeout; break;
    case 'expired': message = copy.errors.expired; break;
    case 'placeNotFound': message = copy.errors.placeNotFound; break;
    case 'ambiguous': message = copy.errors.ambiguous; break;
    case 'network': message = copy.errors.network; break;
    default: message = copy.errors.unknown;
  }
  const incidentId = locationIncidentId(error);
  return incidentId ? `${message} ${copy.supportCode}: ${incidentId}` : message;
}
