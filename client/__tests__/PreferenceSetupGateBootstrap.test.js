import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import PreferenceSetupGate from '../src/navigation/PreferenceSetupGate';
import { AUTH_STATES } from '../src/constants/authPolicy';

let mockStatus = AUTH_STATES.READY;
let mockLoading = false;
let mockAuthFlowInProgress = false;

jest.mock('../src/navigation/RightDrawerNavigator', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  return () => ReactModule.createElement(View, { testID: 'main-navigator' });
});

jest.mock('../src/features/auth/AuthContext', () => ({
  useAuth: () => ({
    status: mockStatus,
    loading: mockLoading,
    authFlowInProgress: mockAuthFlowInProgress,
  }),
}));

describe('PreferenceSetupGate auth state routing', () => {
  beforeEach(() => {
    mockStatus = AUTH_STATES.READY;
    mockLoading = false;
    mockAuthFlowInProgress = false;
  });

  it.each([
    [AUTH_STATES.EMAIL_VERIFICATION_REQUIRED, 'VerifyEmail'],
    [AUTH_STATES.ACCOUNT_SETUP_REQUIRED, 'CompleteAccount'],
    [AUTH_STATES.PREFERENCES_REQUIRED, 'PreferenceSetup'],
  ])('routes %s to %s', async (status, routeName) => {
    mockStatus = status;
    const navigation = { reset: jest.fn() };
    render(<PreferenceSetupGate navigation={navigation} />);
    await waitFor(() => expect(navigation.reset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: routeName }],
    }));
  });

  it('renders public navigation for ready and guest states', () => {
    const navigation = { reset: jest.fn() };
    const screen = render(<PreferenceSetupGate navigation={navigation} />);
    expect(screen.getByTestId('main-navigator')).toBeTruthy();
    expect(navigation.reset).not.toHaveBeenCalled();
  });

  it('keeps the current auth screen mounted while registration is finishing', () => {
    mockStatus = AUTH_STATES.EMAIL_VERIFICATION_REQUIRED;
    mockAuthFlowInProgress = true;
    const navigation = { reset: jest.fn() };
    const screen = render(<PreferenceSetupGate navigation={navigation} />);
    expect(screen.getByTestId('main-navigator')).toBeTruthy();
    expect(navigation.reset).not.toHaveBeenCalled();
  });
});
