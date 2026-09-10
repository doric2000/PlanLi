import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import { CAPABILITIES } from '../src/constants/authPolicy';

const mockEnsure = jest.fn(async () => false);
let mockAuth = { isGuest: true, isActive: false, loading: false, status: 'guest', ensureCapability: mockEnsure };
const mockScreen = jest.fn(() => null);
jest.mock('@react-navigation/stack', () => ({
  CardStyleInterpolators: { forHorizontalIOS: jest.fn() },
  TransitionPresets: { SlideFromRightIOS: {} },
  createStackNavigator: () => ({ Navigator: ({ children }) => children, Screen: (props) => mockScreen(props) }),
}));
jest.mock('@react-navigation/native', () => ({
  NavigationContainer: ({ children }) => children,
  createNavigationContainerRef: () => ({ isReady: () => false, getCurrentRoute: () => ({ name: 'Home' }) }),
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaProvider: ({ children }) => children, SafeAreaView: View };
});
jest.mock('../src/features/auth/AuthContext', () => ({
  AuthProvider: ({ children }) => children, useAuth: () => mockAuth,
}));
jest.mock('../src/features/profile/services/NoyaOnboardingStorage', () => ({ beginNoyaVisit: async () => {} }));
jest.mock('../src/services/ErrorReporting', () => ({ addDiagnosticBreadcrumb: jest.fn(), setDiagnosticTag: jest.fn() }));
jest.mock('../src/navigation/CreateMenuScreen', () => () => null);
jest.mock('../src/navigation/LegacyRoutesScreen', () => () => null);
jest.mock('../src/features/notifications/screens/NotificationScreen', () => 'InboxContent');

const leaves = [
  'auth/screens/VerifyEmailScreen', 'auth/screens/CompleteAccountScreen', 'auth/screens/TotpEnrollmentScreen',
  'legal/screens/LegalDocumentScreen', 'profile/screens/ChangeNameScreen', 'profile/screens/ChangePasswordScreen',
  'community/screens/AddRecommendationScreen', 'community/screens/RecommendationDetailScreen',
  'roadtrip/screens/AddRoutesScreen', 'profile/screens/UserProfileScreen', 'roadtrip/screens/RouteDetailScreen',
  'roadtrip/screens/RouteMapScreen', 'profile/screens/SettingsScreen', 'profile/screens/BlockedUsersScreen',
  'destination/screens/LandingPageScreen', 'profile/screens/EditProfileScreen', 'profile/screens/PreferenceSetupScreen',
  'notifications/screens/NotificationSettingsScreen', 'notifications/push/NotificationPushBridge',
  'admin/screens/AdminPanelScreen', 'publishing/ContentPublishBanner', 'auth/components/AuthGateModal',
  'noya/NoyaTourOverlay', 'profile/components/GuestPersonalizationBridge', 'region/screens/RegionSelectorScreen',
  'operations/OperationBanner', 'operations/ActivityScreen',
];
for (const leaf of leaves) jest.doMock('../src/features/' + leaf, () => () => null);
jest.mock('../src/navigation/PreferenceSetupGate', () => () => null);
jest.mock('../src/components/AppFontProvider', () => ({ children }) => children);
jest.mock('../src/features/notifications/context/NotificationCenterContext', () => ({ NotificationCenterProvider: ({ children }) => children }));
jest.mock('../src/features/publishing/ContentPublishContext', () => ({ ContentPublishProvider: ({ children }) => children }));
jest.mock('../src/features/operations/OperationContext', () => ({ OperationProvider: ({ children }) => children }));
jest.mock('../src/features/operations/ProfilePhotoContext', () => ({ ProfilePhotoProvider: ({ children }) => children }));
jest.mock('../src/features/moderation/BlockedUsersContext', () => ({ BlockedUsersProvider: ({ children }) => children }));
jest.mock('../src/features/noya/NoyaTourContext', () => ({ NoyaTourProvider: ({ children }) => children }));
jest.mock('../src/features/profile/context/PersonalizationFeedbackContext', () => ({ PersonalizationFeedbackProvider: ({ children }) => children }));
jest.mock('../src/features/region/context/RegionSelectionContext', () => ({ RegionSelectionProvider: ({ children }) => children }));
const App = require('../App').default;

beforeEach(() => { jest.clearAllMocks(); mockAuth = { ...mockAuth, isGuest: true, isActive: false }; });
it('registers Create as a transparent root sheet and keeps both old route links', () => {
  render(<App />);
  const screens = mockScreen.mock.calls.map(([props]) => props);
  const create = screens.find((s) => s.name === 'CreateMenu');
  expect(create.options.presentation).toBe('transparentModal');
  expect(screens.find((s) => s.name === 'Route').component).toBe(screens.find((s) => s.name === 'Routes').component);
});
it('keeps the root notification entry protected, then renders the authenticated inbox', async () => {
  const root = render(<App />);
  const Inbox = mockScreen.mock.calls.find(([props]) => props.name === 'Notifications')[0].component;
  root.unmount();
  const screen = render(<Inbox route={{ name: 'Notifications', params: { notificationId: 'n1' } }} />);
  await waitFor(() => expect(mockEnsure).toHaveBeenCalledWith(CAPABILITIES.SIGNED_IN, { name: 'Notifications', params: { notificationId: 'n1' } }, { blockedRoute: true }));
  expect(screen.queryByTestId('inbox-content')).toBeNull();
  mockAuth = { ...mockAuth, isGuest: false, isActive: true };
  screen.rerender(<Inbox route={{ name: 'Notifications' }} />);
  await act(async () => {});
  expect(screen.toJSON().type).toBe('InboxContent');
});

it('keeps every profile destination header in its moving screen card', () => {
  render(<App />);
  const screens = mockScreen.mock.calls.map(([props]) => props);
  const { profileStackScreenOptions } = require('../src/navigation/rtlStackOptions');
  for (const name of ['EditProfile', 'Settings', 'Notifications', 'NotificationSettings', 'ChangeName', 'ChangePassword', 'BlockedUsers', 'TotpEnrollment', 'Terms', 'Privacy', 'CommunityGuidelines', 'RegionSelector', 'AdminPanel']) {
    expect(screens.find((screen) => screen.name === name).options).toBe(profileStackScreenOptions);
    expect(screens.find((screen) => screen.name === name).options.headerMode).toBe('screen');
  }
  expect(screens.find((screen) => screen.name === 'CreateMenu').options.presentation).toBe('transparentModal');
});
