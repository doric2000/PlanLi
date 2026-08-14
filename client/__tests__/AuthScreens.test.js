import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import LoginScreen from '../src/features/auth/screens/LoginScreen';
import RegisterScreen from '../src/features/auth/screens/RegisterScreen';

const mockSignInWithEmailAndPassword = jest.fn();
const mockCreateUserWithEmailAndPassword = jest.fn();
const mockSendEmailVerification = jest.fn();
const mockSendPasswordResetEmail = jest.fn();
const mockUpdateProfile = jest.fn();
const mockCompleteAuthentication = jest.fn();

jest.mock('@expo/vector-icons', () => ({
  Ionicons: (props) => {
    const React = require('react');
    const { View } = require('react-native');
    return React.createElement(View, props);
  },
}));

jest.mock('expo-linear-gradient', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    LinearGradient: ({ children, ...props }) => React.createElement(View, props, children),
  };
});

jest.mock('../src/features/auth/components/SocialLoginButtons', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SocialLoginButtons: () => React.createElement(View, { testID: 'mock-social-buttons' }),
  };
});

jest.mock('../src/config/firebase', () => ({
  auth: { currentUser: null, languageCode: null },
}));

jest.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: (...args) => mockSignInWithEmailAndPassword(...args),
  createUserWithEmailAndPassword: (...args) => mockCreateUserWithEmailAndPassword(...args),
  sendEmailVerification: (...args) => mockSendEmailVerification(...args),
  sendPasswordResetEmail: (...args) => mockSendPasswordResetEmail(...args),
  updateProfile: (...args) => mockUpdateProfile(...args),
}));

jest.mock('../src/services/AuthService', () => ({
  completeAuthentication: (...args) => mockCompleteAuthentication(...args),
  formatAuthError: (error) => error?.message || 'שגיאה',
  isProviderCancellation: () => false,
  normalizeEmail: (value) => String(value || '').trim().toLowerCase(),
  signInWithApple: jest.fn(),
  signInWithGoogle: jest.fn(),
}));

const { auth } = require('../src/config/firebase');

describe('authentication screens', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.currentUser = null;
  });

  it('normalizes email, completes the private profile, and navigates after password login', async () => {
    const navigation = { reset: jest.fn(), replace: jest.fn() };
    const user = { uid: 'user-1' };
    mockSignInWithEmailAndPassword.mockResolvedValue({ user });
    mockCompleteAuthentication.mockResolvedValue({ routeName: 'Main' });
    const screen = render(<LoginScreen navigation={navigation} />);

    fireEvent.changeText(screen.getByPlaceholderText('הזינו כתובת אימייל'), ' Person@Example.COM ');
    fireEvent.changeText(screen.getByPlaceholderText('הזינו סיסמה'), 'secret');
    fireEvent.press(screen.getByTestId('email-login-button'));

    await waitFor(() => {
      expect(mockSignInWithEmailAndPassword).toHaveBeenCalledWith(
        expect.anything(),
        'person@example.com',
        'secret'
      );
      expect(mockCompleteAuthentication).toHaveBeenCalledWith(user, undefined);
      expect(navigation.reset).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'Main' }] });
    });
  });

  it('sends a Hebrew password-reset email using the normalized address', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockSendPasswordResetEmail.mockResolvedValue();
    const screen = render(<LoginScreen navigation={{ reset: jest.fn(), replace: jest.fn() }} />);

    fireEvent.changeText(screen.getByPlaceholderText('הזינו כתובת אימייל'), ' Person@Example.COM ');
    fireEvent.press(screen.getByTestId('forgot-password-button'));

    await waitFor(() => {
      expect(mockSendPasswordResetEmail).toHaveBeenCalledWith(expect.anything(), 'person@example.com');
      expect(Alert.alert).toHaveBeenCalledWith('המייל נשלח', expect.any(String));
    });
  });

  it('creates the Firebase account and private profile before opening verification', async () => {
    const navigation = { reset: jest.fn(), replace: jest.fn() };
    const user = { uid: 'new-user' };
    mockCreateUserWithEmailAndPassword.mockResolvedValue({ user });
    mockUpdateProfile.mockResolvedValue();
    mockCompleteAuthentication.mockResolvedValue({ routeName: 'VerifyEmail' });
    mockSendEmailVerification.mockResolvedValue();
    const screen = render(<RegisterScreen navigation={navigation} />);

    fireEvent.changeText(screen.getByPlaceholderText('הזינו את שמכם המלא'), ' Dana Cohen ');
    fireEvent.changeText(screen.getByPlaceholderText('הזינו כתובת אימייל'), ' Dana@Example.COM ');
    fireEvent.changeText(screen.getByPlaceholderText('הזינו סיסמה'), 'secret1');
    fireEvent.changeText(screen.getByPlaceholderText('הזינו שוב את הסיסמה'), 'secret1');
    fireEvent.press(screen.getByTestId('email-register-button'));

    await waitFor(() => {
      expect(mockCreateUserWithEmailAndPassword).toHaveBeenCalledWith(
        expect.anything(),
        'dana@example.com',
        'secret1'
      );
      expect(mockCompleteAuthentication).toHaveBeenCalledWith(user, {
        displayName: 'Dana Cohen',
        photoURL: null,
      });
      expect(mockSendEmailVerification).toHaveBeenCalledWith(user);
      expect(navigation.reset).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'VerifyEmail' }] });
    });
  });

  it('retries profile creation without creating a duplicate Firebase Auth account', async () => {
    const navigation = { reset: jest.fn(), replace: jest.fn() };
    const pendingUser = {
      uid: 'pending-user',
      email: 'dana@example.com',
      providerData: [{ providerId: 'password' }],
    };
    auth.currentUser = pendingUser;
    mockUpdateProfile.mockResolvedValue();
    mockCompleteAuthentication.mockResolvedValue({ routeName: 'VerifyEmail' });
    mockSendEmailVerification.mockResolvedValue();
    const screen = render(<RegisterScreen navigation={navigation} />);

    fireEvent.changeText(screen.getByPlaceholderText('הזינו את שמכם המלא'), 'Dana Cohen');
    fireEvent.changeText(screen.getByPlaceholderText('הזינו כתובת אימייל'), 'dana@example.com');
    fireEvent.changeText(screen.getByPlaceholderText('הזינו סיסמה'), 'secret1');
    fireEvent.changeText(screen.getByPlaceholderText('הזינו שוב את הסיסמה'), 'secret1');
    fireEvent.press(screen.getByTestId('email-register-button'));

    await waitFor(() => {
      expect(mockCreateUserWithEmailAndPassword).not.toHaveBeenCalled();
      expect(mockCompleteAuthentication).toHaveBeenCalledWith(pendingUser, {
        displayName: 'Dana Cohen',
        photoURL: null,
      });
      expect(navigation.reset).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'VerifyEmail' }] });
    });
  });
});
