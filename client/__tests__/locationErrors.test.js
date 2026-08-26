import {
  locationErrorKind,
  locationErrorMessage,
  locationErrorRetryable,
} from '../src/utils/locationErrors';

describe('location error presentation', () => {
  it.each([
    ['functions/resource-exhausted', 'temporaryQuota'],
    ['functions/unavailable', 'network'],
    ['functions/deadline-exceeded', 'timeout'],
  ])('maps %s to %s', (code, kind) => {
    expect(locationErrorKind({ code })).toBe(kind);
    expect(locationErrorMessage({ code })).toEqual(expect.any(String));
  });

  it('recognizes explicit ambiguity without treating every precondition as ambiguous', () => {
    expect(locationErrorKind({ code: 'functions/failed-precondition', message: 'Destination locality is ambiguous' })).toBe('ambiguous');
    expect(locationErrorKind({ code: 'functions/failed-precondition', message: 'Invalid provider data' })).toBe('unknown');
  });

  it('prefers a structured expired-session reason over the deadline code', () => {
    expect(locationErrorKind({
      code: 'functions/deadline-exceeded',
      details: { reason: 'selection_expired' },
    })).toBe('expired');
  });

  it('does not describe unrelated not-found errors as an expired place search', () => {
    expect(locationErrorKind({
      code: 'functions/not-found',
      details: { reason: 'RECOMMENDATION_DRAFT_NOT_FOUND' },
    })).toBe('unknown');
    expect(locationErrorKind({
      code: 'functions/not-found',
      details: { reason: 'place_not_found' },
    })).toBe('placeNotFound');
  });

  it('shows a short privacy-safe incident code when supplied by the backend', () => {
    expect(locationErrorMessage({
      code: 'functions/unavailable',
      details: { reason: 'provider_unavailable', incidentId: 'loc_1234567890ab' },
    })).toContain('567890ab');
  });

  it('distinguishes non-retryable daily quota and provider request ceiling errors', () => {
    const daily = {
      code: 'functions/resource-exhausted',
      details: { reason: 'daily_limit_reached', retryable: false },
    };
    const ceiling = {
      code: 'functions/resource-exhausted',
      details: { reason: 'provider_call_limit_reached', retryable: false },
    };
    expect(locationErrorKind(daily)).toBe('dailyQuota');
    expect(locationErrorKind(ceiling)).toBe('requestCeiling');
    expect(locationErrorRetryable(daily)).toBe(false);
    expect(locationErrorMessage(daily)).toContain('מחר');
    expect(locationErrorMessage(daily, 'en')).toContain('tomorrow');
  });

  it('provides tested English copy without changing the Hebrew default', () => {
    const error = { code: 'functions/deadline-exceeded', details: { reason: 'provider_timeout' } };
    expect(locationErrorMessage(error)).toContain('טעינת המקום');
    expect(locationErrorMessage(error, 'en')).toContain('too long');
  });
});
