import {
  AUTH_STATES,
  deriveAuthState,
} from '../src/constants/authPolicy';

const passwordUser = (emailVerified) => ({
  uid: 'user-1',
  emailVerified,
  providerData: [{ providerId: 'password' }],
});
const activeDocument = {
  displayName: 'Dana Cohen',
  onboarding: { profileDetailsVersion: 1, profileDetailsCompletedAt: { seconds: 1 } },
  legal: {
    termsVersion: '2026-08-15-community-safety',
    privacyVersion: '2026-08-16-diagnostics',
    acceptedAt: { seconds: 1 },
  },
  smartProfile: { setupRequired: false, completedAt: { seconds: 1 } },
};

describe('auth state machine', () => {
  it('covers loading, guest and email verification states', () => {
    expect(deriveAuthState(null, null, true)).toBe(AUTH_STATES.LOADING);
    expect(deriveAuthState(null, null, false)).toBe(AUTH_STATES.GUEST);
    expect(deriveAuthState(passwordUser(false), activeDocument, false))
      .toBe(AUTH_STATES.EMAIL_VERIFICATION_REQUIRED);
  });

  it('requires account details, current consent and preferences in order', () => {
    const user = passwordUser(true);
    expect(deriveAuthState(user, null, false)).toBe(AUTH_STATES.ACCOUNT_SETUP_REQUIRED);
    expect(deriveAuthState(user, { ...activeDocument, legal: {} }, false))
      .toBe(AUTH_STATES.ACCOUNT_SETUP_REQUIRED);
    expect(deriveAuthState(user, { ...activeDocument, smartProfile: { setupRequired: true } }, false))
      .toBe(AUTH_STATES.PREFERENCES_REQUIRED);
    expect(deriveAuthState(user, { ...activeDocument, smartProfile: { completedAt: { seconds: 1 } } }, false))
      .toBe(AUTH_STATES.PREFERENCES_REQUIRED);
    expect(deriveAuthState(user, activeDocument, false)).toBe(AUTH_STATES.READY);
  });

  it('does not impose password email verification on Google or Apple accounts', () => {
    for (const providerId of ['google.com', 'apple.com']) {
      expect(deriveAuthState({ uid: 'social', emailVerified: false, providerData: [{ providerId }] }, activeDocument, false))
        .toBe(AUTH_STATES.READY);
    }
  });
});
