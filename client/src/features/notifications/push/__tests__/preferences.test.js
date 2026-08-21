import {
  DEFAULT_PUSH_PREFERENCES,
  normalizePushPreferences,
  sanitizePushPreferencePatch,
} from '../preferences';

describe('push preferences', () => {
  it('requires an explicit global opt-in while enabling categories by default', () => {
    expect(normalizePushPreferences()).toEqual(DEFAULT_PUSH_PREFERENCES);
    expect(normalizePushPreferences().pushEnabled).toBe(false);
    expect(normalizePushPreferences().likes).toBe(true);
    expect(normalizePushPreferences().adminDestinations).toBe(true);
  });

  it('accepts only canonical boolean fields', () => {
    expect(sanitizePushPreferencePatch({
      pushEnabled: true,
      comments: false,
      admin: true,
      quietHoursEnabled: true,
      system: 'false',
    })).toEqual({ pushEnabled: true, comments: false });
  });

  it('normalizes partial server data without disabling unspecified categories', () => {
    expect(normalizePushPreferences({ comments: false })).toEqual({
      ...DEFAULT_PUSH_PREFERENCES,
      comments: false,
    });
  });
});
