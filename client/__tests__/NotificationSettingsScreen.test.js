import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import NotificationSettingsScreen from '../src/features/notifications/screens/NotificationSettingsScreen';

const mockNavigation = { goBack: jest.fn() };
let mockIsAdmin = false;
let mockAdminLoading = false;

jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNavigation }));
jest.mock('../src/hooks/useAdminClaim', () => ({
  useAdminClaim: () => ({ isAdmin: mockIsAdmin, loading: mockAdminLoading }),
}));
jest.mock('../src/features/notifications/push/callables', () => ({
  getPushPreferences: jest.fn(),
  setPushPreferences: jest.fn(),
}));
jest.mock('@expo/vector-icons', () => {
  const ReactRuntime = require('react');
  const { Text } = require('react-native');
  const Icon = ({ name, ...props }) => ReactRuntime.createElement(Text, props, name);
  return { Ionicons: Icon };
});
jest.mock('react-native-safe-area-context', () => {
  const ReactRuntime = require('react');
  const { View } = require('react-native');
  return { SafeAreaView: ({ children, ...props }) => ReactRuntime.createElement(View, props, children) };
});

const storedPreferences = {
  pushEnabled: false,
  likes: true,
  comments: true,
  system: true,
  adminReports: true,
  adminDestinations: true,
};

describe('NotificationSettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAdmin = false;
    mockAdminLoading = false;
  });

  it('loads canonical defaults and persists an explicit preference patch', async () => {
    const loadPreferences = jest.fn().mockResolvedValue(storedPreferences);
    const savePreferences = jest.fn().mockImplementation((value) => Promise.resolve(value));
    const screen = render(
      <NotificationSettingsScreen
        loadPreferences={loadPreferences}
        savePreferences={savePreferences}
      />
    );

    await waitFor(() => expect(screen.getByTestId('notification-preference-pushEnabled')).toBeTruthy());
    fireEvent(screen.getByTestId('notification-preference-pushEnabled'), 'valueChange', true);
    fireEvent(screen.getByTestId('notification-preference-comments'), 'valueChange', false);
    fireEvent.press(screen.getByTestId('notification-settings-save'));

    await waitFor(() => expect(savePreferences).toHaveBeenCalledWith(
      {
        ...storedPreferences,
        pushEnabled: true,
        comments: false,
      },
      storedPreferences
    ));
    expect(await screen.findByTestId('notification-settings-saved')).toBeTruthy();
  });

  it('only renders report and destination preferences for admins', async () => {
    const loadPreferences = jest.fn().mockResolvedValue(storedPreferences);
    const screen = render(<NotificationSettingsScreen loadPreferences={loadPreferences} />);

    await waitFor(() => expect(screen.getByTestId('notification-preference-likes')).toBeTruthy());
    expect(screen.queryByTestId('notification-admin-preferences')).toBeNull();

    mockIsAdmin = true;
    screen.rerender(<NotificationSettingsScreen loadPreferences={loadPreferences} />);
    expect(screen.getByTestId('notification-admin-preferences')).toBeTruthy();
    expect(screen.getByTestId('notification-preference-adminReports')).toBeTruthy();
    expect(screen.getByTestId('notification-preference-adminDestinations')).toBeTruthy();
  });

  it('supports a retry after a safe loading error', async () => {
    const loadPreferences = jest.fn()
      .mockRejectedValueOnce(new Error('internal details'))
      .mockResolvedValueOnce(storedPreferences);
    const screen = render(<NotificationSettingsScreen loadPreferences={loadPreferences} />);

    expect(await screen.findByTestId('notification-settings-error')).toBeTruthy();
    fireEvent.press(screen.getByTestId('notification-settings-retry'));

    await waitFor(() => expect(loadPreferences).toHaveBeenCalledTimes(2));
    expect(await screen.findByTestId('notification-preference-likes')).toBeTruthy();
  });
});
