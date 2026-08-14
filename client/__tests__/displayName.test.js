import {
  normalizeDisplayName,
  sanitizeDisplayNameInput,
  validateDisplayName,
} from '../src/features/auth/utils/displayName';

describe('display name policy', () => {
  it('collapses repeated whitespace before registration data is saved', () => {
    expect(sanitizeDisplayNameInput('  Dana       Cohen')).toBe('Dana Cohen');
    expect(normalizeDisplayName(' Dana\n\tCohen ')).toBe('Dana Cohen');
  });

  it('limits the name to six words and sixty characters', () => {
    expect(validateDisplayName('one two three four five six seven')).toContain('שש מילים');
    expect(validateDisplayName('א'.repeat(61))).toContain('60 תווים');
    expect(validateDisplayName('Dana Cohen')).toBe('');
  });
});
