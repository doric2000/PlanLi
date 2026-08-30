const mockGetMultiFactorResolver = jest.fn();
const mockMultiFactor = jest.fn();
const mockAssertionForSignIn = jest.fn();
const mockAssertionForEnrollment = jest.fn();
const mockGenerateSecret = jest.fn();

jest.mock('firebase/auth', () => ({
  getMultiFactorResolver: (...args) => mockGetMultiFactorResolver(...args),
  multiFactor: (...args) => mockMultiFactor(...args),
  TotpMultiFactorGenerator: {
    assertionForEnrollment: (...args) => mockAssertionForEnrollment(...args),
    assertionForSignIn: (...args) => mockAssertionForSignIn(...args),
    generateSecret: (...args) => mockGenerateSecret(...args),
  },
}));

jest.mock('../src/config/firebase', () => ({
  auth: { currentUser: null },
}));

const { auth } = require('../src/config/firebase');
const {
  beginTotpEnrollment,
  captureTotpSignIn,
  clearPendingTotpSignIn,
  completeTotpSignIn,
  finishTotpEnrollment,
  hasPendingTotpSignIn,
  hasTotpEnrollment,
} = require('../src/services/MfaService');

describe('MfaService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearPendingTotpSignIn();
    auth.currentUser = null;
  });

  it('keeps the Firebase resolver private and resolves only a TOTP hint', async () => {
    const resolveSignIn = jest.fn(async () => ({ user: { uid: 'admin-1' } }));
    mockGetMultiFactorResolver.mockReturnValue({
      hints: [{ factorId: 'phone', uid: 'phone-1' }, { factorId: 'totp', uid: 'totp-1' }],
      resolveSignIn,
    });
    mockAssertionForSignIn.mockReturnValue({ factorId: 'totp' });
    const source = Object.assign(new Error('raw provider details'), {
      code: 'auth/multi-factor-auth-required',
    });

    const challenge = captureTotpSignIn(source, { profile: { displayName: 'Admin' } });
    expect(challenge).toMatchObject({
      code: 'auth/multi-factor-auth-required',
      customData: { factorCount: 1 },
    });
    expect(challenge).not.toHaveProperty('resolver');
    expect(hasPendingTotpSignIn()).toBe(true);

    await expect(completeTotpSignIn('123 456')).resolves.toEqual({
      user: { uid: 'admin-1' },
      profile: { displayName: 'Admin' },
    });
    expect(mockAssertionForSignIn).toHaveBeenCalledWith('totp-1', '123456');
    expect(resolveSignIn).toHaveBeenCalledWith({ factorId: 'totp' });
    expect(hasPendingTotpSignIn()).toBe(false);
  });

  it('refuses an MFA account that has no TOTP enrollment', () => {
    mockGetMultiFactorResolver.mockReturnValue({ hints: [{ factorId: 'phone', uid: 'phone-1' }] });
    const source = Object.assign(new Error('SMS only'), {
      code: 'auth/multi-factor-auth-required',
    });
    expect(() => captureTotpSignIn(source)).toThrow(expect.objectContaining({
      code: 'auth/unsupported-second-factor',
    }));
  });

  it('creates an in-memory TOTP secret and enrolls the current user', async () => {
    const enroll = jest.fn(async () => {});
    const getSession = jest.fn(async () => ({ session: 'mfa' }));
    const getIdToken = jest.fn(async () => 'fresh-token');
    auth.currentUser = { uid: 'admin-1', email: 'admin@example.com', getIdToken };
    mockMultiFactor.mockReturnValue({ enrolledFactors: [], getSession, enroll });
    const secret = {
      secretKey: 'PRIVATESECRET',
      enrollmentCompletionDeadline: '2030-01-01T00:00:00Z',
      generateQrCodeUrl: jest.fn(() => 'otpauth://totp/PlanLi'),
    };
    mockGenerateSecret.mockResolvedValue(secret);
    mockAssertionForEnrollment.mockReturnValue({ factorId: 'totp' });

    await expect(beginTotpEnrollment()).resolves.toEqual({
      secretKey: 'PRIVATESECRET',
      qrCodeUrl: 'otpauth://totp/PlanLi',
      expiresAt: '2030-01-01T00:00:00Z',
    });
    await expect(finishTotpEnrollment('654321')).resolves.toEqual({ enrolled: true });
    expect(mockAssertionForEnrollment).toHaveBeenCalledWith(secret, '654321');
    expect(enroll).toHaveBeenCalledWith({ factorId: 'totp' }, 'PlanLi Authenticator');
    expect(getIdToken).toHaveBeenCalledWith(true);
  });

  it('detects only a TOTP enrollment and validates six numeric digits', async () => {
    const resolveSignIn = jest.fn();
    auth.currentUser = { uid: 'admin-1' };
    mockMultiFactor.mockReturnValue({ enrolledFactors: [{ factorId: 'phone' }] });
    expect(hasTotpEnrollment()).toBe(false);
    mockMultiFactor.mockReturnValue({ enrolledFactors: [{ factorId: 'totp' }] });
    expect(hasTotpEnrollment()).toBe(true);

    mockGetMultiFactorResolver.mockReturnValue({
      hints: [{ factorId: 'totp', uid: 'totp-1' }],
      resolveSignIn,
    });
    captureTotpSignIn(Object.assign(new Error('challenge'), {
      code: 'auth/multi-factor-auth-required',
    }));
    await expect(completeTotpSignIn('12-3456')).rejects.toMatchObject({
      code: 'auth/invalid-verification-code',
    });
    expect(resolveSignIn).not.toHaveBeenCalled();
  });
});
