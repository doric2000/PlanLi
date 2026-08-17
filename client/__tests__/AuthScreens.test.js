import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import ForgotPasswordScreen from '../src/features/auth/screens/ForgotPasswordScreen';
import AuthEntryScreen from '../src/features/auth/screens/AuthEntryScreen';
import LoginScreen from '../src/features/auth/screens/LoginScreen';
import RegisterScreen from '../src/features/auth/screens/RegisterScreen';
import CompleteAccountScreen from '../src/features/auth/screens/CompleteAccountScreen';
import { AUTH_STATES } from '../src/constants/authPolicy';

const mockSignInWithEmail = jest.fn();
const mockRegisterWithEmail = jest.fn();
const mockValidateNewPassword = jest.fn();
const mockSendResetEmail = jest.fn();
const mockEnsureAuthenticatedUserProfile = jest.fn();
const mockSignInWithGoogle = jest.fn();
const mockRunAuthTransition = jest.fn(async (operation) => operation());
const mockCompleteAccountSetup = jest.fn();
let mockAuthStatus = AUTH_STATES.ACCOUNT_SETUP_REQUIRED;
let mockUserDocument = { displayName: 'Admin' };

jest.mock('../src/features/auth/AuthContext', () => ({
  useAuth: () => ({
    runAuthTransition: mockRunAuthTransition,
    status: mockAuthStatus,
    user: { uid: 'user-1', email: 'a@b.com', displayName: 'Admin' },
    userDocument: mockUserDocument,
  }),
}));

jest.mock('../src/services/ProfileService', () => ({
  completeAccountSetup: (...args) => mockCompleteAccountSetup(...args),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: (props) => {
    const ReactModule = require('react');
    const { View } = require('react-native');
    return ReactModule.createElement(View, props);
  },
}));

jest.mock('../src/features/auth/components/SocialLoginButtons', () => {
  const ReactModule = require('react');
  const { TouchableOpacity, View } = require('react-native');
  return {
    SocialLoginButtons: ({ onGoogleLogin }) => ReactModule.createElement(
      View,
      { testID: 'mock-social-buttons' },
      ReactModule.createElement(TouchableOpacity, {
        testID: 'mock-google-login',
        onPress: onGoogleLogin,
      })
    ),
  };
});

jest.mock('../src/services/AuthService', () => ({
  ensureAuthenticatedUserProfile: (...args) => mockEnsureAuthenticatedUserProfile(...args),
  formatAuthError: (error) => error?.message || 'שגיאה',
  isProviderCancellation: () => false,
  normalizeEmail: (value) => String(value || '').trim().toLowerCase(),
  registerWithEmail: (...args) => mockRegisterWithEmail(...args),
  sendResetEmail: (...args) => mockSendResetEmail(...args),
  signInWithApple: jest.fn(),
  signInWithEmail: (...args) => mockSignInWithEmail(...args),
  signInWithGoogle: (...args) => mockSignInWithGoogle(...args),
  validateNewPassword: (...args) => mockValidateNewPassword(...args),
}));

describe('authentication screens', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockValidateNewPassword.mockResolvedValue({ isValid: true });
    mockEnsureAuthenticatedUserProfile.mockResolvedValue({ created: false });
    mockCompleteAccountSetup.mockResolvedValue({ ok: true });
    mockAuthStatus = AUTH_STATES.ACCOUNT_SETUP_REQUIRED;
    mockUserDocument = { displayName: 'Admin' };
  });

  it('uses the central email login service and returns to the app', async () => {
    const navigation = { reset: jest.fn(), replace: jest.fn(), navigate: jest.fn() };
    mockSignInWithEmail.mockResolvedValue({ uid: 'user-1' });
    const screen = render(<LoginScreen navigation={navigation} />);

    fireEvent.changeText(screen.getByTestId('login-email'), ' Person@Example.COM ');
    fireEvent.changeText(screen.getByTestId('login-password'), 'secret');
    fireEvent.press(screen.getByTestId('email-login-button'));

    await waitFor(() => {
      expect(mockSignInWithEmail).toHaveBeenCalledWith(' Person@Example.COM ', 'secret');
      expect(navigation.reset).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'Main' }] });
    });
  });

  it('opens the dedicated forgot-password flow', () => {
    const navigation = { navigate: jest.fn(), reset: jest.fn(), replace: jest.fn(), goBack: jest.fn() };
    const screen = render(<LoginScreen navigation={navigation} />);
    fireEvent.press(screen.getByText('שכחתי סיסמה'));
    expect(navigation.navigate).toHaveBeenCalledWith('ForgotPassword');
  });

  it('keeps social providers on login and provides a working back action', () => {
    const navigation = {
      navigate: jest.fn(), reset: jest.fn(), replace: jest.fn(), goBack: jest.fn(),
    };
    const screen = render(<LoginScreen navigation={navigation} />);
    expect(screen.getByTestId('mock-social-buttons')).toBeTruthy();
    fireEvent.press(screen.getByTestId('auth-back-button'));
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('sends a new external-provider user to legal consent before preferences', async () => {
    const navigation = {
      navigate: jest.fn(), reset: jest.fn(), replace: jest.fn(), goBack: jest.fn(),
    };
    const user = { uid: 'new-google-user' };
    mockSignInWithGoogle.mockResolvedValue({ user, profile: { displayName: 'Dana' } });
    mockEnsureAuthenticatedUserProfile.mockResolvedValue({ created: true });

    const screen = render(<LoginScreen navigation={navigation} />);
    fireEvent.press(screen.getByTestId('mock-google-login'));

    await waitFor(() => expect(navigation.reset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'CompleteAccount' }],
    }));
  });

  it('opens the Home tab when the guest continues browsing', () => {
    const rootNavigation = { navigate: jest.fn() };
    const tabNavigation = { getParent: jest.fn(() => rootNavigation) };
    const navigation = {
      navigate: jest.fn(),
      getParent: jest.fn(() => tabNavigation),
    };
    const screen = render(<AuthEntryScreen navigation={navigation} />);
    fireEvent.press(screen.getByTestId('continue-as-guest'));
    expect(rootNavigation.navigate).toHaveBeenCalledWith('Main', {
      screen: 'Tabs',
      params: { screen: 'Home' },
    });
  });

  it('sends a generic reset request and opens the sent confirmation', async () => {
    const navigation = { replace: jest.fn() };
    mockSendResetEmail.mockResolvedValue();
    const screen = render(<ForgotPasswordScreen navigation={navigation} />);
    fireEvent.changeText(screen.getByTestId('reset-email-input'), ' Person@Example.COM ');
    fireEvent.press(screen.getByTestId('send-reset-link'));
    await waitFor(() => {
      expect(mockSendResetEmail).toHaveBeenCalledWith('person@example.com');
      expect(navigation.replace).toHaveBeenCalledWith('ResetEmailSent', { email: 'person@example.com' });
    });
  });

  it('requires current legal consent and the password policy before registration', async () => {
    const navigation = {
      reset: jest.fn(), replace: jest.fn(), navigate: jest.fn(), goBack: jest.fn(),
    };
    mockRegisterWithEmail.mockResolvedValue({ uid: 'new-user' });
    const screen = render(<RegisterScreen navigation={navigation} />);

    fireEvent.changeText(screen.getByPlaceholderText('הזינו את שמכם המלא'), ' Dana Cohen ');
    fireEvent.changeText(screen.getByPlaceholderText('הזינו כתובת אימייל'), ' Dana@Example.COM ');
    fireEvent.changeText(screen.getByPlaceholderText('לפחות 10 תווים'), 'StrongPass1');
    fireEvent.changeText(screen.getByPlaceholderText('הזינו שוב את הסיסמה'), 'StrongPass1');
    fireEvent.press(screen.getByTestId('legal-consent-checkbox'));
    fireEvent.press(screen.getByTestId('email-register-button'));

    await waitFor(() => {
      expect(mockValidateNewPassword).toHaveBeenCalledWith('StrongPass1');
      expect(mockRegisterWithEmail).toHaveBeenCalledWith({
        displayName: 'Dana Cohen',
        email: ' Dana@Example.COM ',
        password: 'StrongPass1',
        acceptedLegal: true,
      });
      expect(navigation.reset).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'VerifyEmail' }] });
    });
  });

  it('waits for the persisted auth state before leaving account setup', async () => {
    const navigation = { reset: jest.fn(), navigate: jest.fn() };
    const screen = render(<CompleteAccountScreen navigation={navigation} />);
    fireEvent.press(screen.getByTestId('legal-consent-checkbox'));
    fireEvent.press(screen.getByTestId('complete-account-submit'));

    await waitFor(() => expect(mockCompleteAccountSetup).toHaveBeenCalledWith({
      displayName: 'Admin',
      acceptedLegal: true,
    }));
    expect(navigation.reset).not.toHaveBeenCalled();

    mockAuthStatus = AUTH_STATES.READY;
    screen.rerender(<CompleteAccountScreen navigation={navigation} />);
    await waitFor(() => expect(navigation.reset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'Main' }],
    }));
  });

  it('locks the existing display name when only renewed legal consent is required', () => {
    mockUserDocument = {
      displayName: 'Admin',
      onboarding: {
        profileDetailsVersion: 1,
        profileDetailsCompletedAt: { seconds: 1 },
      },
    };
    const screen = render(<CompleteAccountScreen navigation={{ reset: jest.fn(), navigate: jest.fn() }} />);

    expect(screen.getByText(/מדיניות הפרטיות עודכנה/)).toBeTruthy();
    expect(screen.getByPlaceholderText('הזינו את שמכם המלא').props.editable).toBe(false);
  });

  it('keeps registration email-only and provides a working back action', () => {
    const navigation = {
      reset: jest.fn(), replace: jest.fn(), navigate: jest.fn(), goBack: jest.fn(),
    };
    const screen = render(<RegisterScreen navigation={navigation} />);
    expect(screen.queryByTestId('mock-social-buttons')).toBeNull();
    fireEvent.press(screen.getByTestId('auth-back-button'));
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('shows the selected horizontal PlanLi wordmark on login and registration', () => {
    expect(render(<LoginScreen navigation={{ navigate: jest.fn() }} />).getByTestId('brand-wordmark')).toBeTruthy();
    expect(render(<RegisterScreen navigation={{ navigate: jest.fn() }} />).getByTestId('brand-wordmark')).toBeTruthy();
  });
});
