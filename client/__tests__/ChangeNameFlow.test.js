/**
 * UI flow: Settings -> Change Name.
 * - Tap "שינוי שם" in settings.
 * - Type new name and submit.
 * - Show success alert, tap OK, and navigate back.
 */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import SettingsScreen from '../src/features/profile/screens/SettingsScreen';
import ChangeNameScreen from '../src/features/profile/screens/ChangeNameScreen';
import { saveProfile } from '../src/services/ProfileService';

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const MockIcon = (props) => <mock-icon {...props} />;
  return { Ionicons: MockIcon };
});

jest.mock('../src/config/firebase', () => {
  const mockAuth = {
    currentUser: { uid: 'user-123', displayName: 'Old Name', reload: jest.fn(() => Promise.resolve()) },
  };
  return {
    auth: mockAuth,
    db: { __type: 'db' },
  };
});

jest.mock('firebase/auth', () => ({
  signOut: jest.fn(() => Promise.resolve()),
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(() => ({ __type: 'docRef' })),
  setDoc: jest.fn(() => Promise.resolve()),
  serverTimestamp: jest.fn(() => 'SERVER_TIMESTAMP'),
}));

jest.mock('../src/services/ProfileService', () => ({
  saveProfile: jest.fn(() => Promise.resolve()),
}));

jest.mock('../src/services/SocialService', () => ({
  requestAccountDeletion: jest.fn(() => Promise.resolve()),
}));

const { auth: mockedAuth } = require('../src/config/firebase');

describe('ChangeNameFlow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
});
