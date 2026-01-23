import { formatTimestamp } from '../src/utils/formatTimestamp';

/**
 * Unit test for a pure utility function.
 *
 * Why this is a "unit" test:
 * - We test one function in isolation: no React rendering, no Firebase, no network.
 * - Input => Output. That's it.
 *
 * Function under test:
 * - formatTimestamp(timestamp)
 *
 * What the function does (expected behavior):
 * - Takes a Firestore Timestamp / JS Date / milliseconds and returns a Hebrew relative time.
 *   Examples:
 *   - "הרגע"
 *   - "לפני 5 דקות"
 *   - "לפני 2 שעות"
 *   - "לפני 3 ימים"
 *
 * Important testing detail:
 * - This function depends on "now" (current time).
 * - If we don't freeze time, the test could be flaky.
 * - We use jest.setSystemTime(...) to make the test deterministic.
 *
 * Test structure (AAA):
 * 1) Arrange: prepare inputs and fixed system time.
 * 2) Act: call the function.
 * 3) Assert: compare to the expected output string.
 */

describe('formatTimestamp (unit)', () => {
  beforeEach(() => {
    // Arrange (global): Freeze "now" so calculations are stable.
    // Without this, timing differences can cause flaky tests.
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns minutes in Hebrew (e.g., "לפני 5 דקות")', () => {
    // Arrange: choose a timestamp exactly 5 minutes in the past.
    const fiveMinutesAgo = new Date('2026-01-01T11:55:00.000Z');

    // Act: run the function under test.
    const result = formatTimestamp(fiveMinutesAgo);

    // Assert: verify the exact expected Hebrew string.
    expect(result).toBe('לפני 5 דקות');
  });

  it('floors minutes: 2:59 minutes ago should be "לפני 2 דקות" (not 3)', () => {
    // Arrange
    // "Now" is frozen at 12:00:00.000Z.
    // 2 minutes 59 seconds ago => 11:57:01.000Z
    const twoMinutesFiftyNineSecondsAgo = new Date('2026-01-01T11:57:01.000Z');

    // Act
    const result = formatTimestamp(twoMinutesFiftyNineSecondsAgo);

    // Assert
    expect(result).toBe('לפני 2 דקות');
  });

  it('handles singular minute ("לפני 1 דקה")', () => {
    // Arrange: exactly 1 minute ago
    const oneMinuteAgo = new Date('2026-01-01T11:59:00.000Z');

    // Act
    const result = formatTimestamp(oneMinuteAgo);

    // Assert
    expect(result).toBe('לפני 1 דקה');
  });

  it('handles singular hour ("לפני 1 שעה")', () => {
    // Arrange: exactly 1 hour ago
    const oneHourAgo = new Date('2026-01-01T11:00:00.000Z');

    // Act
    const result = formatTimestamp(oneHourAgo);

    // Assert
    expect(result).toBe('לפני 1 שעה');
  });

  it('handles multiple hours ("לפני 3 שעות")', () => {
    // Arrange: 3 hours ago
    const threeHoursAgo = new Date('2026-01-01T09:00:00.000Z');

    // Act
    const result = formatTimestamp(threeHoursAgo);

    // Assert
    expect(result).toBe('לפני 3 שעות');
  });

  it('handles singular day ("לפני 1 יום")', () => {
    // Arrange: 1 day ago
    const oneDayAgo = new Date('2025-12-31T12:00:00.000Z');

    // Act
    const result = formatTimestamp(oneDayAgo);

    // Assert
    expect(result).toBe('לפני 1 יום');
  });

  it('handles multiple days ("לפני 4 ימים")', () => {
    // Arrange: 4 days ago
    const fourDaysAgo = new Date('2025-12-28T12:00:00.000Z');

    // Act
    const result = formatTimestamp(fourDaysAgo);

    // Assert
    expect(result).toBe('לפני 4 ימים');
  });

  it('returns "הרגע" for very recent timestamps', () => {
    // Arrange: 10 seconds ago should be treated as "just now".
    const tenSecondsAgo = new Date('2026-01-01T11:59:50.000Z');

    // Act
    const result = formatTimestamp(tenSecondsAgo);

    // Assert
    expect(result).toBe('הרגע');
  });

  it('treats future timestamps defensively as "הרגע" (clock skew)', () => {
    // Arrange: 10 seconds in the future
    const tenSecondsInFuture = new Date('2026-01-01T12:00:10.000Z');

    // Act
    const result = formatTimestamp(tenSecondsInFuture);

    // Assert
    expect(result).toBe('הרגע');
  });
});
