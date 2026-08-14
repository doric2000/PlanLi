const mockGoogleSignIn = jest.fn();
const mockGoogleConfigure = jest.fn();
const mockAppleSignIn = jest.fn();
const mockRegisterUserDocument = jest.fn();
const mockSignInWithCredential = jest.fn();
const mockReauthenticateWithCredential = jest.fn();
const mockUpdateProfile = jest.fn();

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: (...args) => mockGoogleConfigure(...args),
    signIn: (...args) => mockGoogleSignIn(...args),
    signOut: jest.fn(),
    revokeAccess: jest.fn(),
  },
  isCancelledResponse: (response) => response?.type === 'cancelled',
}));

jest.mock('expo-apple-authentication', () => ({
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  signInAsync: (...args) => mockAppleSignIn(...args),
  formatFullName: (name) => [name?.givenName, name?.familyName].filter(Boolean).join(' '),
}));

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  getRandomBytesAsync: jest.fn(async () => new Uint8Array(32).fill(1)),
  digestStringAsync: jest.fn(async () => 'hashed-nonce'),
}));

jest.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: jest.fn(),
  EmailAuthProvider: { credential: jest.fn((email, password) => ({ email, password })) },
  GoogleAuthProvider: { credential: jest.fn((idToken) => ({ providerId: 'google.com', idToken })) },
  OAuthProvider: jest.fn().mockImplementation(() => ({
    credential: ({ idToken, rawNonce }) => ({ providerId: 'apple.com', idToken, rawNonce }),
  })),
  reauthenticateWithCredential: (...args) => mockReauthenticateWithCredential(...args),
  sendEmailVerification: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  signInWithCredential: (...args) => mockSignInWithCredential(...args),
  signOut: jest.fn(),
  updateProfile: (...args) => mockUpdateProfile(...args),
  validatePassword: jest.fn(async () => ({ isValid: true })),
}));

jest.mock('../src/config/firebase', () => ({
  auth: { currentUser: null },
}));

jest.mock('../src/services/ProfileService', () => ({
  registerUserDocument: (...args) => mockRegisterUserDocument(...args),
}));

process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = 'web-client.apps.googleusercontent.com';

const { auth } = require('../src/config/firebase');
const {
  DEFAULT_DISPLAY_NAME,
  ensureAuthenticatedUserProfile,
  formatAuthError,
  normalizeEmail,
  reauthenticateWithApple,
  signInWithApple,
  signInWithGoogle,
} = require('../src/services/AuthService');

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.currentUser = null;
  });

  it('normalizes email and provides a safe account-collision message', () => {
    expect(normalizeEmail('  Person@Example.COM ')).toBe('person@example.com');
    expect(formatAuthError({ code: 'auth/account-exists-with-different-credential' }))
      .toContain('שיטת ההתחברות המקורית');
  });

  it('creates or repairs the private profile without choosing a navigation destination', async () => {
    const socialUser = {
      uid: 'social-1',
      email: 'social@example.com',
      displayName: 'Traveler',
      photoURL: null,
      providerData: [{ providerId: 'google.com' }],
    };
    mockRegisterUserDocument.mockResolvedValueOnce({ created: true, setupRequired: true });
    await expect(ensureAuthenticatedUserProfile(socialUser)).resolves.toEqual({ created: true, setupRequired: true });
    expect(mockRegisterUserDocument).toHaveBeenCalledWith({ displayName: 'Traveler', photoURL: null });
  });

  it('uses the native Google ID token and handles cancellation separately', async () => {
    const user = { uid: 'google-1', displayName: 'Google User' };
    mockGoogleSignIn.mockResolvedValueOnce({
      type: 'success',
      data: { idToken: 'google-id-token', user: { name: 'Google User', photo: null } },
    });
    mockSignInWithCredential.mockResolvedValueOnce({ user });

    await expect(signInWithGoogle()).resolves.toEqual({
      user,
      profile: { displayName: 'Google User', photoURL: undefined },
    });
    expect(mockGoogleConfigure).toHaveBeenCalledWith({
      webClientId: 'web-client.apps.googleusercontent.com',
      offlineAccess: false,
    });

    mockGoogleSignIn.mockResolvedValueOnce({ type: 'cancelled', data: null });
    await expect(signInWithGoogle()).rejects.toMatchObject({ code: 'auth/provider-cancelled' });
  });

  it('rejects a Google response that does not contain an ID token', async () => {
    mockGoogleSignIn.mockResolvedValueOnce({
      type: 'success',
      data: { idToken: null, user: { name: 'Google User' } },
    });

    await expect(signInWithGoogle()).rejects.toMatchObject({ code: 'auth/missing-token' });
    expect(mockSignInWithCredential).not.toHaveBeenCalled();
  });

  it('preserves Google network failures for the localized error mapper', async () => {
    const networkError = Object.assign(new Error('offline'), { code: 'auth/network-request-failed' });
    mockGoogleSignIn.mockRejectedValueOnce(networkError);

    await expect(signInWithGoogle()).rejects.toBe(networkError);
    expect(formatAuthError(networkError)).toContain('אינטרנט');
  });

  it('stores the Apple name only when Firebase has no display name', async () => {
    const user = { uid: 'apple-1', displayName: null };
    mockAppleSignIn.mockResolvedValueOnce({
      identityToken: 'apple-id-token',
      authorizationCode: 'apple-code',
      fullName: { givenName: 'Dana', familyName: 'Cohen' },
    });
    mockSignInWithCredential.mockResolvedValueOnce({ user });

    await expect(signInWithApple()).resolves.toEqual({
      user,
      profile: { displayName: 'Dana Cohen', photoURL: undefined },
    });
    expect(mockUpdateProfile).toHaveBeenCalledWith(user, { displayName: 'Dana Cohen' });
  });

  it('uses the safe PlanLi name when Apple no longer returns name or email', async () => {
    const user = { uid: 'apple-returning', displayName: null, photoURL: null };
    mockAppleSignIn.mockResolvedValueOnce({
      identityToken: 'apple-id-token',
      authorizationCode: 'apple-code',
      fullName: null,
      email: null,
    });
    mockSignInWithCredential.mockResolvedValueOnce({ user });
    mockRegisterUserDocument.mockResolvedValueOnce({ created: true, setupRequired: true });

    const result = await signInWithApple();
    await ensureAuthenticatedUserProfile(result.user, result.profile);

    expect(mockUpdateProfile).not.toHaveBeenCalled();
    expect(mockRegisterUserDocument).toHaveBeenCalledWith({
      displayName: DEFAULT_DISPLAY_NAME,
      photoURL: null,
    });
  });

  it('reauthenticates Apple deletion and returns the fresh authorization code', async () => {
    auth.currentUser = { uid: 'apple-1' };
    mockAppleSignIn.mockResolvedValueOnce({
      identityToken: 'apple-id-token',
      authorizationCode: 'fresh-code',
      fullName: null,
    });

    await expect(reauthenticateWithApple()).resolves.toEqual({ appleAuthorizationCode: 'fresh-code' });
    expect(mockReauthenticateWithCredential).toHaveBeenCalledWith(
      auth.currentUser,
      expect.objectContaining({ providerId: 'apple.com' })
    );
  });
});
