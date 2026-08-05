import {
  normalizeProfileBio,
  profileBioLength,
  validateProfileBio,
} from '../src/features/profile/utils/profileBio';

describe('profile bio', () => {
  it('normalizes whitespace and keeps the display to two lines', () => {
    expect(normalizeProfileBio('  אוהב/ת ים  \r\n  וקפה  \nשורה שלישית  ')).toBe('אוהב/ת ים\nוקפה');
  });

  it('allows unicode and rejects a bio that is too long', () => {
    expect(profileBioLength('🌍'.repeat(160))).toBe(160);
    expect(validateProfileBio('א'.repeat(161))).toMatch(/160/);
  });
});

