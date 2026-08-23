import React from 'react';
import { Keyboard, ScrollView, StyleSheet } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import ForgotPasswordScreen from '../src/features/auth/screens/ForgotPasswordScreen';
import AuthEntryScreen from '../src/features/auth/screens/AuthEntryScreen';
import LoginScreen from '../src/features/auth/screens/LoginScreen';
import RegisterScreen from '../src/features/auth/screens/RegisterScreen';
import CompleteAccountScreen from '../src/features/auth/screens/CompleteAccountScreen';
import { shouldEnableAccessibleAuthOverflow } from '../src/features/auth/components/AuthFormLayout';
import { AUTH_STATES } from '../src/constants/authPolicy';

const mockSignInWithEmail = jest.fn();
const mockRegisterWithEmail = jest.fn();
const mockValidateNewPassword = jest.fn();
const mockSendResetEmail = jest.fn();
const mockEnsureAuthenticatedUserProfile = jest.fn();
const mockSignInWithGoogle = jest.fn();
const mockRunAuthTransition = jest.fn(async (operation) => operation());
const mockCompleteAccountSetup = jest.fn();
const mockSynchronizeUserDocument = jest.fn();
const mockClearPendingReturn = jest.fn();
let mockAuthStatus = AUTH_STATES.ACCOUNT_SETUP_REQUIRED;
let mockUserDocument = { displayName: 'Admin' };

jest.mock('../src/features/auth/AuthContext', () => ({
  useAuth: () => ({
    runAuthTransition: mockRunAuthTransition,
    clearPendingReturn: mockClearPendingReturn,
    status: mockAuthStatus,
    user: { uid: 'user-1', email: 'a@b.com', displayName: 'Admin' },
    userDocument: mockUserDocument,
    synchronizeUserDocument: mockSynchronizeUserDocument,
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
    mockCompleteAccountSetup.mockResolvedValue({ ok: true, userDocument: { displayName: 'Admin' } });
    mockSynchronizeUserDocument.mockReturnValue(AUTH_STATES.PREFERENCES_REQUIRED);
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
      canGoBack: jest.fn(() => true),
    };
    const screen = render(<LoginScreen navigation={navigation} />);
    expect(screen.getByTestId('mock-social-buttons')).toBeTruthy();
    fireEvent.press(screen.getByTestId('auth-back-button'));
    expect(navigation.goBack).toHaveBeenCalled();
    expect(mockClearPendingReturn).toHaveBeenCalled();
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

  it('adopts the verified server profile before opening preference setup', async () => {
    const navigation = { reset: jest.fn(), navigate: jest.fn() };
    const screen = render(<CompleteAccountScreen navigation={navigation} />);
    fireEvent.press(screen.getByTestId('legal-consent-checkbox'));
    fireEvent.press(screen.getByTestId('complete-account-submit'));

    await waitFor(() => expect(mockCompleteAccountSetup).toHaveBeenCalledWith({
      displayName: 'Admin',
      acceptedLegal: true,
    }));
    expect(mockSynchronizeUserDocument).toHaveBeenCalledWith({ displayName: 'Admin' });
    expect(navigation.reset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'PreferenceSetup' }],
    });
  });

  it('locks the existing display name when only renewed legal consent is required', () => {
    mockAuthStatus = AUTH_STATES.LEGAL_CONSENT_REQUIRED;
    mockUserDocument = {
      displayName: 'Admin',
      onboarding: {
        profileDetailsVersion: 1,
        profileDetailsCompletedAt: { seconds: 1 },
      },
    };
    const screen = render(<CompleteAccountScreen navigation={{ reset: jest.fn(), navigate: jest.fn() }} />);

    expect(screen.getByText(/מדיניות הפרטיות עודכנה/)).toBeTruthy();
    expect(screen.queryByPlaceholderText('הזינו את שמכם המלא')).toBeNull();
    expect(screen.getByText('אישור והמשך')).toBeTruthy();
  });

  it('renews legal consent with the stored server-confirmed name', async () => {
    mockAuthStatus = AUTH_STATES.LEGAL_CONSENT_REQUIRED;
    mockUserDocument = {
      displayName: 'Admin',
      onboarding: {
        profileDetailsVersion: 1,
        profileDetailsCompletedAt: { seconds: 1 },
      },
    };
    mockSynchronizeUserDocument.mockReturnValue(AUTH_STATES.READY);
    const navigation = { reset: jest.fn(), navigate: jest.fn() };
    const screen = render(<CompleteAccountScreen navigation={navigation} />);

    fireEvent.press(screen.getByTestId('legal-consent-checkbox'));
    fireEvent.press(screen.getByTestId('complete-account-submit'));

    await waitFor(() => expect(mockCompleteAccountSetup).toHaveBeenCalledWith({
      displayName: 'Admin',
      acceptedLegal: true,
    }));
    expect(navigation.reset).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'Main' }] });
  });

  it('leaves a stale account-setup route when the server confirms the account is ready', () => {
    mockAuthStatus = AUTH_STATES.READY;
    const navigation = { reset: jest.fn(), navigate: jest.fn() };

    render(<CompleteAccountScreen navigation={navigation} />);

    expect(navigation.reset).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'Main' }] });
  });

  it('keeps registration email-only and provides a working back action', () => {
    const rootNavigation = { navigate: jest.fn() };
    const tabNavigation = { getParent: jest.fn(() => rootNavigation) };
    const navigation = {
      reset: jest.fn(), replace: jest.fn(), navigate: jest.fn(), goBack: jest.fn(),
      canGoBack: jest.fn(() => false),
      getParent: jest.fn(() => tabNavigation),
    };
    const screen = render(
      <RegisterScreen navigation={navigation} route={{ params: { fallbackTab: 'Community' } }} />
    );
    expect(screen.queryByTestId('mock-social-buttons')).toBeNull();
    fireEvent.press(screen.getByTestId('auth-back-button'));
    expect(navigation.goBack).not.toHaveBeenCalled();
    expect(mockClearPendingReturn).toHaveBeenCalled();
    expect(rootNavigation.navigate).toHaveBeenCalledWith('Main', {
      screen: 'Tabs',
      params: { screen: 'Community' },
    });
  });

  it('shows the selected horizontal PlanLi wordmark on login and registration', () => {
    expect(render(<LoginScreen navigation={{ navigate: jest.fn() }} />).getByTestId('brand-wordmark')).toBeTruthy();
    expect(render(<RegisterScreen navigation={{ navigate: jest.fn() }} />).getByTestId('brand-wordmark')).toBeTruthy();
  });

  it('keeps login and registration static, compact, and direction-aware', () => {
    const dimensions = jest.spyOn(require('react-native'), 'useWindowDimensions').mockReturnValue({
      width: 375,
      height: 667,
      scale: 2,
      fontScale: 1,
    });
    const navigation = { navigate: jest.fn(), replace: jest.fn() };
    const login = render(<LoginScreen navigation={navigation} />);

    expect(login.UNSAFE_queryAllByType(ScrollView)).toHaveLength(0);
    expect(login.getByTestId('auth-error-slot')).toBeTruthy();
    expect(StyleSheet.flatten(login.getByTestId('login-password').props.style)).toMatchObject({
      textAlign: 'right',
      writingDirection: 'rtl',
    });

    const email = login.getByTestId('login-email');
    expect(StyleSheet.flatten(email.props.style)).toMatchObject({
      textAlign: 'right',
      writingDirection: 'rtl',
    });
    fireEvent.changeText(email, 'person@example.com');
    expect(StyleSheet.flatten(login.getByTestId('login-email').props.style)).toMatchObject({
      textAlign: 'right',
      writingDirection: 'ltr',
    });

    login.unmount();
    const registration = render(<RegisterScreen navigation={navigation} />);
    expect(registration.UNSAFE_queryAllByType(ScrollView)).toHaveLength(0);
    expect(registration.getByTestId('auth-error-slot')).toBeTruthy();
    fireEvent.changeText(registration.getByTestId('register-email'), 'person@example.com');
    expect(StyleSheet.flatten(registration.getByTestId('register-email').props.style)).toMatchObject({
      textAlign: 'right',
      writingDirection: 'ltr',
    });

    registration.unmount();
    const forgotPassword = render(<ForgotPasswordScreen navigation={{ replace: jest.fn(), goBack: jest.fn() }} />);
    fireEvent.changeText(forgotPassword.getByTestId('reset-email-input'), 'person@example.com');
    expect(StyleSheet.flatten(forgotPassword.getByTestId('reset-email-input').props.style)).toMatchObject({
      textAlign: 'right',
      writingDirection: 'ltr',
    });
    dimensions.mockRestore();
  });

  it('reserves scrolling for accessibility font scaling', () => {
    expect(shouldEnableAccessibleAuthOverflow(1)).toBe(false);
    expect(shouldEnableAccessibleAuthOverflow(1.2)).toBe(false);
    expect(shouldEnableAccessibleAuthOverflow(1.21)).toBe(true);

    const dimensions = jest.spyOn(require('react-native'), 'useWindowDimensions').mockReturnValue({
      width: 375,
      height: 667,
      scale: 2,
      fontScale: 1.21,
    });
    const screen = render(<LoginScreen navigation={{ navigate: jest.fn(), replace: jest.fn() }} />);
    expect(screen.getByTestId('auth-accessible-scroll')).toBeTruthy();
    dimensions.mockRestore();
  });

  it('hides secondary chrome while the keyboard is visible and restores it afterward', () => {
    const callbacks = {};
    const addListener = jest.spyOn(Keyboard, 'addListener').mockImplementation((event, callback) => {
      callbacks[event] = callback;
      return { remove: jest.fn() };
    });

    const screen = render(<LoginScreen navigation={{ navigate: jest.fn(), replace: jest.fn() }} />);
    expect(screen.getByTestId('auth-form-brand')).toBeTruthy();
    expect(screen.getByTestId('auth-form-footer')).toBeTruthy();
    expect(screen.getByTestId('mock-social-buttons')).toBeTruthy();

    act(() => callbacks.keyboardDidShow());
    expect(screen.queryByTestId('auth-form-brand')).toBeNull();
    expect(screen.queryByTestId('auth-form-footer')).toBeNull();
    expect(screen.queryByTestId('mock-social-buttons')).toBeNull();
    expect(screen.queryByTestId('auth-back-button')).toBeNull();
    expect(screen.getByTestId('login-email')).toBeTruthy();
    expect(screen.getByTestId('login-password')).toBeTruthy();
    expect(screen.getByTestId('email-login-button')).toBeTruthy();

    act(() => callbacks.keyboardDidHide());
    expect(screen.getByTestId('auth-form-brand')).toBeTruthy();
    expect(screen.getByTestId('auth-form-footer')).toBeTruthy();

    screen.unmount();
    const registration = render(<RegisterScreen navigation={{ navigate: jest.fn(), replace: jest.fn() }} />);
    act(() => callbacks.keyboardDidShow());
    expect(registration.queryByTestId('auth-form-brand')).toBeNull();
    expect(registration.getByTestId('register-name')).toBeTruthy();
    expect(registration.getByTestId('register-email')).toBeTruthy();
    expect(registration.getByTestId('register-password')).toBeTruthy();
    expect(registration.getByTestId('register-confirm-password')).toBeTruthy();
    expect(registration.getByTestId('legal-consent-checkbox')).toBeTruthy();
    expect(registration.getByTestId('email-register-button')).toBeTruthy();
    addListener.mockRestore();
  });
});
