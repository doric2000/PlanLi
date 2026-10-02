import React from 'react';
import { render } from '@testing-library/react-native';

let mockScreenOptions = null;

jest.mock('@react-navigation/stack', () => {
  const ReactModule = require('react');
  return {
    createStackNavigator: () => ({
      Navigator: ({ screenOptions, children }) => {
        mockScreenOptions = screenOptions;
        return ReactModule.createElement(ReactModule.Fragment, null, children);
      },
      Screen: () => null,
    }),
  };
});
jest.mock('@react-navigation/native', () => ({
  NavigationContainer: ({ children }) => children,
  createNavigationContainerRef: () => ({}),
}));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaProvider: ({ children }) => children, initialWindowMetrics: null }));
jest.mock('../src/navigation/rtlStackOptions', () => ({ rtlStackScreenOptions: { headerShown: false } }));
jest.mock('../src/components/AppFontProvider', () => ({ children }) => children);
jest.mock('../src/features/auth/AuthContext', () => ({ AuthProvider: ({ children }) => children, useAuth: () => ({}) }));
jest.mock('../src/features/auth/screens/TotpEnrollmentScreen', () => () => null);
jest.mock('../src/features/admin/navigation/AdminAuthNavigator', () => () => null);
jest.mock('../src/features/admin/screens/AdminPanelScreen', () => () => null);

const AdminWebApp = require('../AdminWebApp').default;

describe('AdminWebApp layout', () => {
  it('keeps each web card at window height so admin sections scroll inside the console', () => {
    render(<AdminWebApp />);
    // Without this, React Navigation lets the card grow with its content on web
    // and the console's section ScrollView never becomes scrollable.
    expect(mockScreenOptions.cardStyle).toEqual({ flex: 1 });
    expect(mockScreenOptions.headerShown).toBe(false);
  });
});
