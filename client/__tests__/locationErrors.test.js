import { locationErrorKind, locationErrorMessage } from '../src/utils/locationErrors';

describe('location error presentation', () => {
  it.each([
    ['functions/resource-exhausted', 'quota'],
    ['functions/unavailable', 'network'],
    ['functions/deadline-exceeded', 'expired'],
  ])('maps %s to %s', (code, kind) => {
    expect(locationErrorKind({ code })).toBe(kind);
    expect(locationErrorMessage({ code })).toEqual(expect.any(String));
  });

  it('recognizes explicit ambiguity without treating every precondition as ambiguous', () => {
    expect(locationErrorKind({ code: 'functions/failed-precondition', message: 'Destination locality is ambiguous' })).toBe('ambiguous');
    expect(locationErrorKind({ code: 'functions/failed-precondition', message: 'Invalid provider data' })).toBe('unknown');
  });
});
