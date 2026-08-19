import { doc, getDocFromServer } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

import {
  completeAccountSetup,
  saveProfile,
  verifyPersistedAccountSetup,
  verifyPersistedSmartProfile,
} from '../src/services/ProfileService';

const mockCallable = jest.fn(() => Promise.resolve({ data: { ok: true } }));

jest.mock('../src/services/ErrorReporting', () => ({
  addDiagnosticBreadcrumb: jest.fn(),
  captureDiagnosticException: jest.fn(),
}));

jest.mock('../src/config/firebase', () => ({
  auth: { currentUser: { uid: 'user-1' } },
  cloudFunctions: { kind: 'functions' },
  db: { kind: 'db' },
}));

jest.mock('firebase/functions', () => ({
  httpsCallable: jest.fn(() => mockCallable),
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(() => ({ kind: 'user-ref' })),
  getDocFromServer: jest.fn(),
}));

const requested = {
  interests: ['food', 'cafes', 'nature_scenery'],
  budget: 'balanced',
  travelParties: ['couple'],
  vibe: ['romantic'],
  travelerStyles: ['city_break'],
  pace: 'balanced',
  needs: ['vegetarian'],
};

describe('ProfileService smart-profile persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCallable.mockResolvedValue({ data: { ok: true } });
  });

  it('rejects a successful legacy callable response when the server dropped fields', async () => {
    getDocFromServer.mockResolvedValue({
      data: () => ({ smartProfile: { interests: requested.interests, budget: requested.budget } }),
    });

    await expect(saveProfile({ smartProfile: requested }, { completeSmartProfile: true }))
      .rejects.toMatchObject({ code: 'profile/persistence-mismatch' });
    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'updateProfile');
    expect(doc).toHaveBeenCalledWith(expect.anything(), 'users', 'user-1');
  });

  it('returns only after every field and completion metadata are visible on the server', async () => {
    const persisted = {
      ...requested,
      setupRequired: false,
      completedAt: { seconds: 1 },
    };
    getDocFromServer.mockResolvedValue({ data: () => ({ smartProfile: persisted }) });

    await expect(saveProfile({ smartProfile: requested }, { completeSmartProfile: true }))
      .resolves.toMatchObject({ smartProfile: persisted });
    expect(verifyPersistedSmartProfile(requested, persisted, { complete: true })).toBe(true);
  });

  it('uses the canonical post-write document returned by the callable instead of a racing client read', async () => {
    const persisted = {
      ...requested,
      setupRequired: false,
      completedAt: { seconds: 1 },
    };
    const userDocument = {
      displayName: 'Dana Cohen',
      smartProfile: persisted,
    };
    mockCallable.mockResolvedValueOnce({
      data: { ok: true, smartProfile: persisted, userDocument },
    });
    getDocFromServer.mockResolvedValue({
      data: () => ({ smartProfile: { ...requested, needs: [] } }),
    });

    await expect(saveProfile({ smartProfile: requested }, { completeSmartProfile: true }))
      .resolves.toEqual({ ok: true, smartProfile: persisted, userDocument });
    expect(getDocFromServer).not.toHaveBeenCalled();
  });

  it('verifies traveler style and pace as part of the persisted preferences', () => {
    const persisted = {
      ...requested,
      travelerStyles: ['roadtrip'],
      pace: 'relaxed',
      setupRequired: false,
      completedAt: { seconds: 1 },
    };

    expect(verifyPersistedSmartProfile(requested, persisted, { complete: true })).toBe(false);
  });

  it('can save an in-progress draft without requiring an immediate server read-back', async () => {
    await expect(saveProfile(
      { smartProfile: requested },
      { completeSmartProfile: false, verifySmartProfile: false }
    )).resolves.toEqual({ ok: true });

    expect(mockCallable).toHaveBeenCalledWith({
      smartProfile: requested,
      completeSmartProfile: false,
      taxonomyVersion: 5,
    });
    expect(getDocFromServer).not.toHaveBeenCalled();
  });

  it('sends only the supported Bio update contract and preserves live text', async () => {
    await expect(saveProfile({ bio: 'ים וקפה' }, { verifySmartProfile: false }))
      .resolves.toEqual({ ok: true });

    expect(mockCallable).toHaveBeenCalledWith({
      bio: 'ים וקפה',
      completeSmartProfile: false,
    });
  });

  it('translates an outdated Functions contract error to Hebrew', async () => {
    mockCallable.mockRejectedValueOnce(new Error('Profile update contains unsupported fields.'));

    await expect(saveProfile({ bio: 'חדש' }, { verifySmartProfile: false }))
      .rejects.toThrow('שירות הפרופיל אינו מעודכן');
  });

  it('accepts account setup only after the current legal versions are persisted', async () => {
    const persisted = {
      displayName: 'Admin',
      onboarding: {
        profileDetailsVersion: 1,
        profileDetailsCompletedAt: { seconds: 1 },
      },
      legal: {
        termsVersion: '2026-08-15-community-safety',
        privacyVersion: '2026-08-18-beta-observability',
        acceptedAt: { seconds: 1 },
      },
    };
    getDocFromServer.mockResolvedValue({ data: () => persisted });

    await expect(completeAccountSetup({ displayName: 'Admin', acceptedLegal: true }))
      .resolves.toEqual({ ok: true, userDocument: persisted });
    expect(verifyPersistedAccountSetup(persisted)).toBe(true);
  });

  it('stops the onboarding loop when an outdated callable writes old legal versions', async () => {
    getDocFromServer.mockResolvedValue({
      data: () => ({
        onboarding: {
          profileDetailsVersion: 1,
          profileDetailsCompletedAt: { seconds: 1 },
        },
        legal: {
          termsVersion: '2026-08-15-community-safety',
          privacyVersion: '2026-08-15-community-safety',
          acceptedAt: { seconds: 1 },
        },
      }),
    });

    await expect(completeAccountSetup({ displayName: 'Admin', acceptedLegal: true }))
      .rejects.toMatchObject({ code: 'profile/account-setup-persistence-mismatch' });
  });
});
