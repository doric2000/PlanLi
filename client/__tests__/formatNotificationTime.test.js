import { formatNotificationTime } from '../src/utils/formatNotificationTime';

describe('formatNotificationTime', () => {
  const now = new Date(2026, 7, 30, 13, 18);

  it.each([
    [new Date(2026, 7, 30, 9, 5), 'היום, 09:05'],
    [new Date(2026, 7, 29, 18, 42), 'אתמול, 18:42'],
    [new Date(2026, 6, 8, 7, 3), '08.07, 07:03'],
    [new Date(2025, 11, 31, 23, 59), '31.12.2025, 23:59'],
  ])('always includes local time for %s', (value, expected) => {
    expect(formatNotificationTime(value, now)).toBe(expected);
  });

  it('returns an empty value for an invalid timestamp', () => {
    expect(formatNotificationTime('not-a-date', now)).toBe('');
  });
});
