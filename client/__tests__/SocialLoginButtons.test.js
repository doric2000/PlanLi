import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';

import { SocialLoginButtons } from '../src/features/auth/components/SocialLoginButtons';

jest.mock('@react-native-google-signin/google-signin', () => {
  const ReactModule = require('react');
  const { View: NativeView } = require('react-native');
  const GoogleSigninButton = (props) => ReactModule.createElement(NativeView, props);
  GoogleSigninButton.Size = { Icon: 'icon', Standard: 'standard', Wide: 'wide' };
  GoogleSigninButton.Color = { Light: 'light' };
  return { GoogleSigninButton };
});

jest.mock('expo-apple-authentication', () => ({
  isAvailableAsync: jest.fn(() => Promise.resolve(true)),
}));

describe('SocialLoginButtons', () => {
  const originalPlatform = Platform.OS;

  beforeAll(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
  });

  it('renders accessible icon-only provider buttons at equal touch-target sizes', async () => {
    const screen = render(
      <SocialLoginButtons
        onGoogleLogin={jest.fn()}
        onAppleLogin={jest.fn()}
      />
    );

    await waitFor(() => expect(screen.getByTestId('auth-apple-button')).toBeTruthy());

    expect(StyleSheet.flatten(screen.getByTestId('auth-google-button').props.style)).toMatchObject({
      width: 48,
      height: 48,
    });
    expect(StyleSheet.flatten(screen.getByTestId('auth-apple-button').props.style)).toMatchObject({
      width: 48,
      height: 48,
    });
    expect(screen.getByLabelText('המשך עם Google')).toBeTruthy();
    expect(screen.getByLabelText('המשך עם Apple')).toBeTruthy();
  });
});
