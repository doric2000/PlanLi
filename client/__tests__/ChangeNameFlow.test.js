/**
 * UI flow: Settings -> Change Name.
 * - Tap "שינוי שם" in settings.
 * - Type new name and submit.
 * - Show success alert, tap OK, and navigate back.
 */
import React from 'react';
import { render as renderNative, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import SettingsScreen from '../src/features/profile/screens/SettingsScreen';
import ChangeNameScreen from '../src/features/profile/screens/ChangeNameScreen';
import { saveProfile } from '../src/services/ProfileService';

let mockUserDocument = {};

const TEST_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const render = (ui) => renderNative(
  <SafeAreaProvider initialMetrics={TEST_METRICS}>{ui}</SafeAreaProvider>
);

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const MockIcon = (props) => <mock-icon {...props} />;
  return { Ionicons: MockIcon };
});

jest.mock('../src/config/firebase', () => {
  const mockAuth = {
    currentUser: {
      uid: 'user-123',
      displayName: 'Old Name',
      emailVerified: true,
      reload: jest.fn(() => Promise.resolve()),
    },
  };
  return {
    auth: mockAuth,
    db: { __type: 'db' },
  };
});

jest.mock('firebase/auth', () => ({
  signOut: jest.fn(() => Promise.resolve()),
}));

jest.mock('../src/features/auth/AuthContext', () => ({
  useAuth: () => ({
    user: require('../src/config/firebase').auth.currentUser,
    userDocument: mockUserDocument,
  }),
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(() => ({ __type: 'docRef' })),
  setDoc: jest.fn(() => Promise.resolve()),
  serverTimestamp: jest.fn(() => 'SERVER_TIMESTAMP'),
}));

jest.mock('../src/services/ProfileService', () => ({
  saveProfile: jest.fn(() => Promise.resolve()),
  formatProfileUpdateError: (_error, fallback) => fallback,
}));

jest.mock('../src/services/AuthService', () => ({
  formatAuthError: (error) => error?.message || 'error',
  getProviderIds: () => [],
  isProviderCancellation: () => false,
  reauthenticateWithApple: jest.fn(),
  reauthenticateWithGoogle: jest.fn(),
  reauthenticateWithPassword: jest.fn(),
}));

jest.mock('../src/services/SocialService', () => ({
  requestAccountDeletion: jest.fn(() => Promise.resolve()),
}));

jest.mock('../src/services/PersonalizationService', () => ({
  resetPersonalizationActivity: jest.fn(() => Promise.resolve()),
  setBehavioralPersonalizationEnabled: jest.fn(() => Promise.resolve()),
}));

const { auth: mockedAuth } = require('../src/config/firebase');

describe('ChangeNameFlow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserDocument = {};
    mockedAuth.currentUser.emailVerified = true;
  });

  it('updates the name and navigates back after confirming success', async () => {
    const settingsNav = { navigate: jest.fn(), goBack: jest.fn() };
    const changeNameNav = {
      goBack: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
      dispatch: jest.fn(),
    };

    const alertSpy = jest
      .spyOn(Alert, 'alert')
      .mockImplementation((title, message, buttons) => {
        // Simulate tapping the first button (OK) in the alert.
        if (Array.isArray(buttons)) {
          buttons[0]?.onPress?.();
        }
        return undefined;
      });

    const { getByTestId: getSettingsByTestId, unmount } = render(
      <SettingsScreen navigation={settingsNav} />
    );

    // Navigate from settings to ChangeName.
    fireEvent.press(getSettingsByTestId('settings-change-name-button'));
    expect(settingsNav.navigate).toHaveBeenCalledWith('ChangeName');

    // Move to ChangeName screen and perform update.
    unmount();
    const { getByTestId } = render(
      <ChangeNameScreen navigation={changeNameNav} />
    );

    expect(mockedAuth.currentUser).toEqual({
      uid: 'user-123',
      displayName: 'Old Name',
      emailVerified: true,
      reload: expect.any(Function),
    });
    expect(getByTestId('change-name-input').props.value).toBe(
      mockedAuth.currentUser.displayName
    );
    fireEvent.changeText(getByTestId('change-name-input'), 'test');
    fireEvent.press(getByTestId('change-name-submit'));

    await waitFor(() => {
      expect(saveProfile).toHaveBeenCalledWith({ displayName: 'test' });
      expect(mockedAuth.currentUser.reload).toHaveBeenCalled();
      expect(Alert.alert).toHaveBeenCalledWith(
        'הצלחה',
        'השם עודכן בהצלחה',
        expect.arrayContaining([
          expect.objectContaining({ text: 'אישור' }),
        ])
      );
      expect(changeNameNav.goBack).toHaveBeenCalled();
    });

    alertSpy.mockRestore?.();
  });

  it('blocks name changes until the email address is verified', () => {
    mockedAuth.currentUser.emailVerified = false;
    const { getByTestId } = render(
      <ChangeNameScreen navigation={{ addListener: jest.fn(() => jest.fn()), goBack: jest.fn() }} />
    );

    expect(getByTestId('change-name-notice').props.children).toContain('לאמת');
    expect(getByTestId('change-name-input').props.editable).toBe(false);
    expect(getByTestId('change-name-submit').props.accessibilityState.disabled).toBe(true);
    expect(saveProfile).not.toHaveBeenCalled();
  });

  it('blocks a second name change when the one-time change was already used', () => {
    mockUserDocument = {
      profileManagement: { displayNameChangedAt: { seconds: 1 } },
    };
    const { getByTestId } = render(
      <ChangeNameScreen navigation={{ addListener: jest.fn(() => jest.fn()), goBack: jest.fn() }} />
    );

    expect(getByTestId('change-name-notice').props.children).toContain('כבר השתמשת');
    expect(getByTestId('change-name-input').props.editable).toBe(false);
    expect(getByTestId('change-name-submit').props.accessibilityState.disabled).toBe(true);
    expect(saveProfile).not.toHaveBeenCalled();
  });
});
