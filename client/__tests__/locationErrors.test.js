import { locationErrorKind, locationErrorMessage } from '../src/utils/locationErrors';

describe('location error presentation', () => {
  it.each([
    ['functions/resource-exhausted', 'quota'],
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

  it('shows a short privacy-safe incident code when supplied by the backend', () => {
    expect(locationErrorMessage({
      code: 'functions/unavailable',
      details: { reason: 'provider_unavailable', incidentId: 'loc_1234567890ab' },
    })).toContain('567890ab');
  });
});
