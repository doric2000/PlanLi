import React from 'react';
import { render } from '@testing-library/react-native';

import { DrawerIdentity, getDrawerWidth } from '../src/navigation/RightDrawerNavigator';

jest.mock('@expo/vector-icons', () => {
  const ReactRuntime = require('react');
  const { Text } = require('react-native');
  return {
    Ionicons: ({ name, ...props }) => ReactRuntime.createElement(Text, props, name),
    MaterialIcons: ({ name, ...props }) => ReactRuntime.createElement(Text, props, name),
  };
});

jest.mock('expo-linear-gradient', () => {
  const ReactRuntime = require('react');
  const { View } = require('react-native');
  return { LinearGradient: (props) => ReactRuntime.createElement(View, props) };
});

jest.mock('../src/navigation/TabNavigator', () => () => null);
jest.mock('../src/services/AuthService', () => ({ signOutCentral: jest.fn() }));
jest.mock('../src/navigation/authNavigation', () => ({ openAuthFlow: jest.fn() }));
jest.mock('../src/features/notifications/hooks/useUnreadCount', () => ({ useUnreadCount: () => 0 }));
jest.mock('../src/hooks/useAuthUser', () => ({ useAuthUser: () => ({ isGuest: true }) }));
jest.mock('../src/hooks/useAdminClaim', () => ({ useAdminClaim: () => ({ isAdmin: false }) }));

describe('right drawer presentation', () => {
  it('keeps the drawer responsive between its mobile and wide caps', () => {
    expect(getDrawerWidth(320)).toBe(288);
    expect(getDrawerWidth(390)).toBeCloseTo(343.2);
    expect(getDrawerWidth(1200)).toBe(380);
  });

  it('prefers the private profile document for the signed-in identity', () => {
    const screen = render(
      <DrawerIdentity
        isGuest={false}
        user={{ displayName: 'שם Auth', email: 'traveler@example.com' }}
        userDocument={{ displayName: 'שם פרופיל' }}
      />
    );

    expect(screen.getByText('שם פרופיל')).toBeTruthy();
    expect(screen.getByText('traveler@example.com')).toBeTruthy();
  });

  it('shows a branded guest message without account data', () => {
    const screen = render(<DrawerIdentity isGuest user={null} userDocument={null} />);

    expect(screen.getByText('הטיול הבא מתחיל כאן')).toBeTruthy();
    expect(screen.getByText('מתחברים ושומרים את כל התוכניות במקום אחד')).toBeTruthy();
  });
});
