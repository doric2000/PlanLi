import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render as renderNative, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import SettingsScreen from '../src/features/profile/screens/SettingsScreen';

let mockProviderIds = [];
const mockReauthenticateWithApple = jest.fn();
const mockReauthenticateWithGoogle = jest.fn();
const mockReauthenticateWithPassword = jest.fn();
const mockRequestAccountDeletion = jest.fn();
const mockSignOut = jest.fn();
const mockRevokeGoogleAccess = jest.fn();

const TEST_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const render = (ui) => renderNative(
  <SafeAreaProvider initialMetrics={TEST_METRICS}>{ui}</SafeAreaProvider>
);

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { Ionicons: (props) => React.createElement(View, props) };
});

jest.mock('../src/config/firebase', () => ({
  auth: { currentUser: { uid: 'user-1' } },
}));

jest.mock('../src/features/auth/AuthContext', () => ({
  useAuth: () => ({ userDocument: { personalization: { behaviorEnabled: true } } }),
}));

jest.mock('../src/services/AuthService', () => ({
  formatAuthError: (error) => error?.message || 'שגיאה',
  getProviderIds: () => mockProviderIds,
  isProviderCancellation: () => false,
  reauthenticateWithApple: (...args) => mockReauthenticateWithApple(...args),
  reauthenticateWithGoogle: (...args) => mockReauthenticateWithGoogle(...args),
  reauthenticateWithPassword: (...args) => mockReauthenticateWithPassword(...args),
  revokeGoogleAccessForDeletion: (...args) => mockRevokeGoogleAccess(...args),
  signOutCentral: (...args) => mockSignOut(...args),
}));

jest.mock('../src/services/SocialService', () => ({
  requestAccountDeletion: (...args) => mockRequestAccountDeletion(...args),
}));

jest.mock('../src/services/PersonalizationService', () => ({
  resetPersonalizationActivity: jest.fn(),
  setBehavioralPersonalizationEnabled: jest.fn(() => Promise.resolve()),
}));

describe('Settings authentication behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProviderIds = [];
    mockRequestAccountDeletion.mockResolvedValue({ status: 'complete' });
    mockSignOut.mockResolvedValue();
    mockRevokeGoogleAccess.mockResolvedValue();
    jest.spyOn(Alert, 'alert').mockImplementation((title, _message, buttons) => {
      if (title === 'מחיקת חשבון') buttons?.[1]?.onPress?.();
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows password settings only for password-provider users', () => {
    mockProviderIds = ['google.com'];
    const socialScreen = render(<SettingsScreen navigation={{ navigate: jest.fn(), goBack: jest.fn() }} />);
    expect(socialScreen.queryByTestId('settings-change-password-button')).toBeNull();
    socialScreen.unmount();

    mockProviderIds = ['password'];
    const passwordScreen = render(<SettingsScreen navigation={{ navigate: jest.fn(), goBack: jest.fn() }} />);
    expect(passwordScreen.getByTestId('settings-change-password-button')).toBeTruthy();
  });

  it('reauthenticates Apple and sends the fresh authorization code to deletion', async () => {
    mockProviderIds = ['apple.com'];
    mockReauthenticateWithApple.mockResolvedValue({ appleAuthorizationCode: 'fresh-code' });
    const screen = render(<SettingsScreen navigation={{ navigate: jest.fn(), goBack: jest.fn() }} />);

    fireEvent.press(screen.getByTestId('settings-delete-account-button'));

    await waitFor(() => {
      expect(mockReauthenticateWithApple).toHaveBeenCalled();
      expect(mockRequestAccountDeletion).toHaveBeenCalledWith({ appleAuthorizationCode: 'fresh-code' });
      expect(mockSignOut).toHaveBeenCalled();
    });
  });

  it('collects the current password before deleting a password account', async () => {
    mockProviderIds = ['password'];
    mockReauthenticateWithPassword.mockResolvedValue({});
    const screen = render(<SettingsScreen navigation={{ navigate: jest.fn(), goBack: jest.fn() }} />);

    fireEvent.press(screen.getByTestId('settings-delete-account-button'));
    const passwordInput = await waitFor(() => screen.getByTestId('delete-account-password-input'));
    fireEvent.changeText(passwordInput, 'current-password');
    fireEvent.press(screen.getByTestId('delete-account-password-confirm'));

    await waitFor(() => {
      expect(mockReauthenticateWithPassword).toHaveBeenCalledWith('current-password');
      expect(mockRequestAccountDeletion).toHaveBeenCalledWith({});
      expect(mockSignOut).toHaveBeenCalled();
    });
  });

  it('revokes Google access before deleting the Firebase account', async () => {
    mockProviderIds = ['google.com'];
    mockReauthenticateWithGoogle.mockResolvedValue({});
    const screen = render(<SettingsScreen navigation={{ navigate: jest.fn(), goBack: jest.fn() }} />);

    fireEvent.press(screen.getByTestId('settings-delete-account-button'));

    await waitFor(() => {
      expect(mockReauthenticateWithGoogle).toHaveBeenCalled();
      expect(mockRevokeGoogleAccess).toHaveBeenCalled();
      expect(mockRequestAccountDeletion).toHaveBeenCalledWith({});
    });
    expect(mockRevokeGoogleAccess.mock.invocationCallOrder[0])
      .toBeLessThan(mockRequestAccountDeletion.mock.invocationCallOrder[0]);
  });

  it('opens blocked users management from settings', () => {
    const mockNavigate = jest.fn();
    const screen = render(<SettingsScreen navigation={{ navigate: mockNavigate, goBack: jest.fn() }} />);
    fireEvent.press(screen.getByTestId('settings-blocked-users-button'));
    expect(mockNavigate).toHaveBeenCalledWith('BlockedUsers');
  });

  it('renders the modern grouped settings sections', () => {
    const screen = render(<SettingsScreen navigation={{ navigate: jest.fn(), goBack: jest.fn() }} />);

    expect(screen.getByTestId('settings-account-section')).toBeTruthy();
    expect(screen.getByTestId('settings-personalization-section')).toBeTruthy();
    expect(screen.getByTestId('settings-legal-section')).toBeTruthy();
    expect(screen.getByTestId('settings-danger-section')).toBeTruthy();
    expect(screen.getByText('למידה מהפעילות פעילה')).toBeTruthy();
    expect(
      screen.getByTestId('settings-personalization-section').findByProps({ name: 'options-outline' })
    ).toBeTruthy();
  });

  it('uses an RTL-facing back arrow in the right-side header slot', () => {
    const screen = render(<SettingsScreen navigation={{ navigate: jest.fn(), goBack: jest.fn() }} />);
    const backButton = screen.getByTestId('settings-back-button');

    expect(backButton.findByProps({ name: 'arrow-forward' })).toBeTruthy();
  });
});
