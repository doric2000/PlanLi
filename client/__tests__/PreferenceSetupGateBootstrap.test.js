import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import PreferenceSetupGate from '../src/navigation/PreferenceSetupGate';

const mockEnsureAuthenticatedUserProfile = jest.fn();

jest.mock('../src/navigation/RightDrawerNavigator', () => {
  const React = require('react');
  const { View } = require('react-native');
  return () => React.createElement(View, { testID: 'main-navigator' });
});

jest.mock('../src/hooks/useAuthUser', () => ({
  useAuthUser: () => ({ user: { uid: 'user-1', providerData: [] }, loading: false }),
}));

jest.mock('../src/hooks/useSmartProfile', () => ({
  useSmartProfile: (retryKey) => ({
    loading: false,
    setupRequired: false,
    error: retryKey === 0 ? new Error('profile read failed') : null,
  }),
}));

jest.mock('../src/services/AuthService', () => ({
  ensureAuthenticatedUserProfile: (...args) => mockEnsureAuthenticatedUserProfile(...args),
  formatAuthError: (error) => error?.message || 'שגיאה',
}));

jest.mock('../src/utils/userTier', () => ({
  getUserTier: () => 'verified',
}));

describe('PreferenceSetupGate profile bootstrap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnsureAuthenticatedUserProfile.mockResolvedValue({ setupRequired: false });
  });

  it('blocks a partial profile on read failure and retries the server flow', async () => {
    const navigation = { reset: jest.fn() };
    const screen = render(<PreferenceSetupGate navigation={navigation} />);

    const retryButton = await screen.findByTestId('profile-bootstrap-retry');
    expect(screen.queryByTestId('main-navigator')).toBeNull();
    fireEvent.press(retryButton);

    await waitFor(() => {
      expect(mockEnsureAuthenticatedUserProfile).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId('main-navigator')).toBeTruthy();
    });
  });
});
