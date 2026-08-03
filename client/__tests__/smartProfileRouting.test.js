import {
  isSmartProfileComplete,
  shouldRequirePreferenceSetup,
} from '../src/hooks/useSmartProfile';
import {
  getPreferenceResumeStep,
  normalizeClientSmartProfile,
} from '../src/features/profile/utils/preferenceSetup';

jest.mock('../src/hooks/useAuthUser', () => ({ useAuthUser: jest.fn() }));
jest.mock('../src/config/firebase', () => ({ auth: {}, db: {} }));
jest.mock('firebase/firestore', () => ({
  doc: jest.fn(),
  onSnapshot: jest.fn(),
}));

describe('smart-profile routing', () => {
  it.each([
    ['new password or Google account', { setupRequired: true }, true],
    ['new account after restart', { setupRequired: true, interests: ['food'] }, true],
    ['completed account', { setupRequired: false, completedAt: { seconds: 1 } }, false],
    ['legacy existing account', null, false],
    ['existing incomplete account', { setupRequired: false }, false],
  ])('%s setup requirement', (_label, profile, expected) => {
    expect(shouldRequirePreferenceSetup(profile)).toBe(expected);
  });

  it('uses completedAt as the canonical completion marker', () => {
    expect(isSmartProfileComplete({ completedAt: { seconds: 1 } })).toBe(true);
    expect(isSmartProfileComplete({ setupRequired: false })).toBe(false);
  });

  it('resumes after the last saved step', () => {
    expect(getPreferenceResumeStep({ interests: [] })).toBe(0);
    expect(getPreferenceResumeStep({ interests: ['food', 'cafes', 'nature_scenery'] })).toBe(1);
    expect(getPreferenceResumeStep({
      interests: ['food', 'cafes', 'nature_scenery'],
      budget: 'balanced',
      travelParties: ['couple'],
    })).toBe(2);
    expect(getPreferenceResumeStep({
      interests: ['food', 'cafes', 'nature_scenery'],
      budget: 'balanced',
      travelParties: ['couple'],
      pace: 'relaxed',
    })).toBe(3);
  });

  it('removes invisible legacy values so visible options remain selectable', () => {
    const normalized = normalizeClientSmartProfile({
      interests: [
        'nature', 'museums', 'shopping', 'אוכל רחוב', 'טיול רגלי',
        'obsolete-1', 'obsolete-2', 'obsolete-3', 'obsolete-4',
      ],
      budget: '₪₪',
      travelStyleTag: 'זוגות',
      constraints: ['shabbatObserver'],
    });

    expect(normalized.interests).toEqual(expect.arrayContaining([
      'nature_scenery', 'museums_art', 'shopping_markets', 'food', 'hiking',
    ]));
    expect(normalized.interests).not.toContain('obsolete-1');
    expect(normalized.interests.length).toBeLessThanOrEqual(8);
    expect(normalized.budget).toBe('balanced');
    expect(normalized.travelParties).toEqual(['couple']);
    expect(normalized.needs).toContain('shabbat_friendly');
  });
});
