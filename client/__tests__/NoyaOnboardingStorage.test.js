const mockStorage = new Map();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn((key) => Promise.resolve(mockStorage.get(key) || null)),
  setItem: jest.fn((key, value) => { mockStorage.set(key, value); return Promise.resolve(); }),
}));

import {
  __resetNoyaStorageForTests,
  beginNoyaVisit,
  dismissGuestNoya,
  loadGuestNoyaProfile,
  markNoyaContentViewed,
  saveGuestNoyaProfile,
  shouldInviteGuestToNoya,
} from '../src/features/profile/services/NoyaOnboardingStorage';

describe('NoyaOnboardingStorage', () => {
  beforeEach(() => {
    mockStorage.clear();
    __resetNoyaStorageForTests();
  });

  it('invites a guest after meaningful content or a second visit', async () => {
    await beginNoyaVisit(10_000_000);
    await expect(shouldInviteGuestToNoya()).resolves.toBe(false);
    await markNoyaContentViewed();
    await expect(shouldInviteGuestToNoya()).resolves.toBe(true);

    mockStorage.clear();
    __resetNoyaStorageForTests();
    await beginNoyaVisit(10_000_000);
    await beginNoyaVisit(10_000_000 + (31 * 60 * 1000));
    await expect(shouldInviteGuestToNoya()).resolves.toBe(true);
  });

  it('stores only the bounded guest preference fields', async () => {
    await saveGuestNoyaProfile({
      interests: ['food', 'nature_scenery'],
      budget: 'balanced',
      travelParties: ['couple'],
      needs: ['vegetarian'],
      displayName: 'must not persist',
    });
    await expect(loadGuestNoyaProfile()).resolves.toEqual(expect.objectContaining({
      interests: ['food', 'nature_scenery'],
      onboardingVersion: 2,
    }));
    expect(await loadGuestNoyaProfile()).not.toHaveProperty('displayName');
    await expect(shouldInviteGuestToNoya()).resolves.toBe(false);
  });

  it('keeps the guest invitation state independent from the removed contextual tips', async () => {
    mockStorage.set('@planli/noya-onboarding-v2', JSON.stringify({
      tipsSeen: ['for-you'],
      tipsDisabled: true,
      guestStatus: '',
    }));
    __resetNoyaStorageForTests();
    await dismissGuestNoya();
    await expect(shouldInviteGuestToNoya()).resolves.toBe(false);
    const stored = JSON.parse(mockStorage.get('@planli/noya-onboarding-v2'));
    expect(stored).not.toHaveProperty('tipsSeen');
    expect(stored).not.toHaveProperty('tipsDisabled');
  });
});
