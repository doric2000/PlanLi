import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';

import NotificationScreen from '../src/features/notifications/screens/NotificationScreen';

const mockNavigation = { goBack: jest.fn(), navigate: jest.fn() };
let mockNotificationState;

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
}));

jest.mock('@expo/vector-icons', () => {
  const ReactRuntime = require('react');
  const { Text } = require('react-native');
  const Icon = ({ name, ...props }) => ReactRuntime.createElement(
    Text,
    { ...props, testID: props.testID || `icon-${name}` },
    name
  );
  return { Ionicons: Icon };
});

jest.mock('react-native-safe-area-context', () => {
  const ReactRuntime = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, ...props }) => ReactRuntime.createElement(View, props, children),
  };
});

jest.mock('../src/features/notifications/hooks/useNotifications', () => ({
  useNotifications: () => mockNotificationState,
}));

jest.mock('../src/features/notifications/hooks/useClearNotifications', () => ({
  useClearNotifications: () => ({
    clearAll: jest.fn(),
    markAsRead: jest.fn(),
    clearing: false,
  }),
}));

jest.mock('../src/features/notifications/components/', () => {
  const ReactRuntime = require('react');
  const { Text } = require('react-native');
  return {
    NotificationCard: ({ notification }) => ReactRuntime.createElement(
      Text,
      { testID: `notification-${notification.id}` },
      notification.id
    ),
  };
});

jest.mock('../src/config/firebase', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({ doc: jest.fn(), getDoc: jest.fn() }));
jest.mock('../src/services/RouteService', () => ({ loadRouteDetails: jest.fn() }));

describe('NotificationScreen refresh and RTL header', () => {
  beforeEach(() => {
    mockNotificationState = {
      notifications: [{ id: 'one' }],
      loading: false,
      refreshing: false,
      refresh: jest.fn(),
    };
  });

  it('places back on the right and the secondary action on the left', () => {
    const screen = render(<NotificationScreen />);
    const backSlot = StyleSheet.flatten(screen.getByTestId('notifications-header-back-slot').props.style);
    const actionSlot = StyleSheet.flatten(screen.getByTestId('notifications-header-action-slot').props.style);

    expect(backSlot.right).toBe(10);
    expect(actionSlot.left).toBe(10);
    expect(screen.getByTestId('icon-chevron-forward')).toBeTruthy();
  });

  it('keeps the header and replaces the list while refreshing', () => {
    mockNotificationState.refreshing = true;
    const screen = render(<NotificationScreen />);

    expect(screen.getByText('התראות')).toBeTruthy();
    expect(screen.getByTestId('notifications-refresh-state')).toBeTruthy();
    expect(screen.queryByTestId('notification-one')).toBeNull();
  });
});
