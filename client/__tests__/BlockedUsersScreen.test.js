import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render as renderNative, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import BlockedUsersScreen from '../src/features/profile/screens/BlockedUsersScreen';
import { useBlockedUsers } from '../src/features/moderation/BlockedUsersContext';
import { useAuth } from '../src/features/auth/AuthContext';
import { setBlockedUser } from '../src/services/SocialService';
import { useUserData } from '../src/hooks/useUserData';

const TEST_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const render = (ui) => renderNative(
  <SafeAreaProvider initialMetrics={TEST_METRICS}>{ui}</SafeAreaProvider>
);

jest.mock('../src/features/moderation/BlockedUsersContext', () => ({
  useBlockedUsers: jest.fn(),
}));

jest.mock('../src/features/auth/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../src/services/SocialService', () => ({
  setBlockedUser: jest.fn(),
}));

jest.mock('../src/hooks/useUserData', () => ({
  useUserData: jest.fn(),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

describe('BlockedUsersScreen', () => {
  const mockSetBlockedUser = setBlockedUser;
  const mockUseBlockedUsers = useBlockedUsers;
  const mockUseAuth = useAuth;
  const mockUseUserData = useUserData;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation((title, _message, buttons = []) => {
      if (title === 'הסרת חסימה') {
        const destructive = buttons.find((button) => button.style === 'destructive');
        destructive?.onPress?.();
      }
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows an empty state when no blocked users exist', () => {
    mockUseBlockedUsers.mockReturnValue({ blockedUserIds: new Set() });
    mockUseAuth.mockReturnValue({ handleCallableAuthError: jest.fn(() => false) });
    mockUseUserData.mockReturnValue({ displayName: 'Traveler', loading: false });

    const screen = render(<BlockedUsersScreen navigation={{ goBack: jest.fn() }} />);
    expect(screen.getByText('אין משתמשים חסומים')).toBeTruthy();
  });

  it('lists blocked users and supports unblocking', async () => {
    const userDataById = {
      'user-1': { displayName: 'Alice', loading: false },
      'user-2': { displayName: 'Bob', loading: false },
    };
    mockUseBlockedUsers.mockReturnValue({ blockedUserIds: new Set(['user-1', 'user-2']) });
    mockUseAuth.mockReturnValue({ handleCallableAuthError: jest.fn(() => false) });
    mockUseUserData.mockImplementation((id) => userDataById[id] || { displayName: 'Traveler', loading: false });
    mockSetBlockedUser.mockResolvedValue({ blocked: false, blockedUid: 'user-1' });

    const screen = render(<BlockedUsersScreen navigation={{ goBack: jest.fn() }} />);

    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('Bob')).toBeTruthy();
    fireEvent.press(screen.getByTestId('unblock-user-user-1'));

    await waitFor(() => {
      expect(mockSetBlockedUser).toHaveBeenCalledWith('user-1', false);
    });
  });
});
