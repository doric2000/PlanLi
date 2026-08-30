import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import TotpEnrollmentScreen from '../src/features/auth/screens/TotpEnrollmentScreen';

const mockBeginTotpEnrollment = jest.fn();
const mockCancelTotpEnrollment = jest.fn();
const mockFinishTotpEnrollment = jest.fn();
const mockLeaveAuthFlow = jest.fn();
const mockResetToAuthFlow = jest.fn();
const mockSignOutCentral = jest.fn();

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }) => children,
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('react-native-qrcode-svg', () => () => null);

jest.mock('../src/components/AppText', () => {
  const ReactModule = require('react');
  const { Text } = require('react-native');
  return function MockAppText(props) {
    return ReactModule.createElement(Text, props, props.children);
  };
});

jest.mock('../src/components/AuthInput', () => {
  const ReactModule = require('react');
  const { TextInput } = require('react-native');
  return {
    AuthInput: (props) => ReactModule.createElement(TextInput, props),
  };
});

jest.mock('../src/features/auth/components/AuthLayout', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  return function MockAuthLayout({ children, testID }) {
    return ReactModule.createElement(View, { testID }, children);
  };
});

jest.mock('../src/styles', () => ({
  authStyles: {},
}));

jest.mock('../src/services/AuthService', () => ({
  formatAuthError: (error) => error?.message || 'שגיאה',
  signOutCentral: (...args) => mockSignOutCentral(...args),
}));

jest.mock('../src/services/MfaService', () => ({
  beginTotpEnrollment: (...args) => mockBeginTotpEnrollment(...args),
  cancelTotpEnrollment: (...args) => mockCancelTotpEnrollment(...args),
  finishTotpEnrollment: (...args) => mockFinishTotpEnrollment(...args),
}));

jest.mock('../src/navigation/authNavigation', () => ({
  leaveAuthFlow: (...args) => mockLeaveAuthFlow(...args),
  resetToAuthFlow: (...args) => mockResetToAuthFlow(...args),
}));

describe('TotpEnrollmentScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockSignOutCentral.mockResolvedValue();
    mockFinishTotpEnrollment.mockResolvedValue({ enrolled: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows an active state instead of an error when TOTP is already enrolled', async () => {
    const alreadyEnrolled = Object.assign(new Error('provider detail'), {
      code: 'auth/second-factor-already-in-use',
    });
    mockBeginTotpEnrollment.mockRejectedValue(alreadyEnrolled);
    const navigation = { goBack: jest.fn() };

    const screen = render(<TotpEnrollmentScreen navigation={navigation} />);

    await waitFor(() => expect(screen.getByText('אימות דו־שלבי כבר פעיל')).toBeTruthy());
    expect(screen.queryByTestId('totp-enrollment-error')).toBeNull();
    expect(screen.queryByTestId('totp-enrollment-submit')).toBeNull();

    fireEvent.press(screen.getByTestId('totp-enrollment-active-return'));
    expect(mockLeaveAuthFlow).toHaveBeenCalledWith(navigation);
  });

  it('signs out and clears the stale enrollment route after successful enrollment', async () => {
    mockBeginTotpEnrollment.mockResolvedValue({
      qrCodeUrl: 'otpauth://totp/PlanLi',
      secretKey: 'PRIVATESECRET',
    });
    const navigation = { goBack: jest.fn() };
    const screen = render(<TotpEnrollmentScreen navigation={navigation} />);

    await waitFor(() => expect(screen.getByTestId('totp-enrollment-code')).toBeTruthy());
    fireEvent.changeText(screen.getByTestId('totp-enrollment-code'), '123456');
    fireEvent.press(screen.getByTestId('totp-enrollment-submit'));

    await waitFor(() => expect(mockFinishTotpEnrollment).toHaveBeenCalledWith('123456'));
    expect(mockSignOutCentral).toHaveBeenCalledTimes(1);
    expect(mockResetToAuthFlow).toHaveBeenCalledWith(navigation, 'Login');
    expect(Alert.alert).toHaveBeenCalledWith(
      'האימות הופעל',
      expect.stringContaining('להתחבר מחדש')
    );
  });
});
