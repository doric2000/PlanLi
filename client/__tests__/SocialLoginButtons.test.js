import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { SocialLoginButtons } from '../src/features/auth/components/SocialLoginButtons';

const mockAppleAvailable = jest.fn();

jest.mock('expo-apple-authentication', () => ({
  isAvailableAsync: (...args) => mockAppleAvailable(...args),
}));

describe('SocialLoginButtons', () => {
  const originalPlatform = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    Platform.OS = 'ios';
    mockAppleAvailable.mockResolvedValue(true);
  });

  afterEach(() => {
    Platform.OS = originalPlatform;
  });

  it('renders equally sized circular Apple and official round Google controls', async () => {
    const onAppleLogin = jest.fn();
    const onGoogleLogin = jest.fn();
    const screen = render(
      <SocialLoginButtons onAppleLogin={onAppleLogin} onGoogleLogin={onGoogleLogin} />
    );

    const apple = await waitFor(() => screen.getByTestId('auth-apple-button'));
    const google = screen.getByTestId('auth-google-button');

    expect(StyleSheet.flatten(apple.props.style)).toMatchObject({
      width: 48,
      height: 48,
      borderRadius: 24,
    });
    expect(StyleSheet.flatten(google.props.style)).toMatchObject({
      width: 48,
      height: 48,
      borderRadius: 24,
    });
    expect(StyleSheet.flatten(screen.getByTestId('auth-google-icon').props.style)).toMatchObject({
      width: 44,
      height: 44,
      borderRadius: 22,
    });
    expect(screen.getByTestId('auth-google-icon').props.resizeMode).toBe('contain');
    expect(google.props.accessibilityLabel).toBe('המשך עם Google');
    expect(apple.props.accessibilityLabel).toBe('המשך עם Apple');

    fireEvent.press(google);
    fireEvent.press(apple);
    expect(onGoogleLogin).toHaveBeenCalledTimes(1);
    expect(onAppleLogin).toHaveBeenCalledTimes(1);
  });

  it('keeps provider controls disabled and exposes the active loading state', async () => {
    const screen = render(
      <SocialLoginButtons
        onAppleLogin={jest.fn()}
        onGoogleLogin={jest.fn()}
        disabled
        loadingProvider="google"
      />
    );

    await waitFor(() => screen.getByTestId('auth-apple-button'));
    expect(screen.getByTestId('auth-google-button').props.accessibilityState).toEqual({
      disabled: true,
      busy: true,
    });
    expect(screen.getByTestId('auth-apple-button').props.accessibilityState).toEqual({
      disabled: true,
      busy: false,
    });
  });
});
