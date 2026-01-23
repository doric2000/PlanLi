import {
  calculateCredibilityScore,
  getCredibilityLevelLabel,
} from '../src/features/profile/utils/credibility';

/**
 * Unit tests for pure business-logic functions (NOT UI tests).
 *
 * These functions are used to build the "traveler level" / credibility label.
 * Testing them as units is valuable because:
 * - The logic is shared by multiple screens.
 * - It is easy to accidentally change the formula and break the meaning of levels.
 *
 * Function(s) under test:
 * - calculateCredibilityScore({ recommendationsCount, likesReceived })
 * - getCredibilityLevelLabel(score)
 *
 * Test structure (AAA):
 * 1) Arrange: prepare inputs.
 * 2) Act: call the function under test.
 * 3) Assert: verify output.
 */

describe('credibility utils (unit)', () => {
  it('calculates score as recs*10 + likes*2', () => {
    // Arrange: sample inputs
    const input = { recommendationsCount: 3, likesReceived: 7 };

    // Act
    const score = calculateCredibilityScore(input);

    // Assert: formula is recs*10 + likes*2
    expect(score).toBe(3 * 10 + 7 * 2);
  });

  it('converts score into a level label (Level N Traveler)', () => {
    // Arrange: edge case - score can be 0, but level must start at 1.
    const score = 0;

    // Act
    const label = getCredibilityLevelLabel(score);

    // Assert
    expect(label).toBe('Level 1 Traveler');
  });

  it('handles edge cases: negative score stays at Level 1, and 50 points crosses into Level 2', () => {
    // Arrange
    // - getCredibilityLevelLabel clamps the minimum level to 1.
    // - Levels increase every 50 points: 0-49 => Level 1, 50-99 => Level 2, etc.
    const negativeScore = -10;
    const justBelowNextLevel = 49;
    const firstPointInNextLevel = 50;

    // Act
    const labelNegative = getCredibilityLevelLabel(negativeScore);
    const label49 = getCredibilityLevelLabel(justBelowNextLevel);
    const label50 = getCredibilityLevelLabel(firstPointInNextLevel);

    // Assert
    expect(labelNegative).toBe('Level 1 Traveler');
    expect(label49).toBe('Level 1 Traveler');
    expect(label50).toBe('Level 2 Traveler');
  });
});
