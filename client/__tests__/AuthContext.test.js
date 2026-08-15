import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';

import { AuthProvider, useAuth } from '../src/features/auth/AuthContext';
import { AUTH_STATES, CAPABILITIES } from '../src/constants/authPolicy';

let authListener;
let profileListener;

jest.mock('firebase/auth', () => ({
  onIdTokenChanged: (_auth, callback) => {
    authListener = callback;
    callback(null);
    return jest.fn();
  },
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(() => ({ path: 'users/user-1' })),
  onSnapshot: (_reference, callback) => {
    profileListener = callback;
    return jest.fn();
  },
}));

jest.mock('../src/config/firebase', () => ({
  auth: { currentUser: null },
  db: {},
}));

const activeDocument = {
  displayName: 'Dana Cohen',
  onboarding: { profileDetailsVersion: 1, profileDetailsCompletedAt: { seconds: 1 } },
  legal: {
    termsVersion: '2026-08-15-community-safety',
    privacyVersion: '2026-08-15-community-safety',
    acceptedAt: { seconds: 1 },
  },
  smartProfile: { setupRequired: false, completedAt: { seconds: 1 } },
};

function Harness() {
  const { status, gate, requireCapability, handleCallableAuthError } = useAuth();
  return (
    <>
      <Text testID="auth-status">{status}</Text>
      <Text testID="gate-status">{gate?.status || ''}</Text>
      <TouchableOpacity
        testID="require-active"
        onPress={() => requireCapability(CAPABILITIES.ACTIVE, {
          name: 'LandingPage', params: { cityId: 'tlv' },
        })}
      />
      <TouchableOpacity
        testID="handle-server-auth-error"
        onPress={() => handleCallableAuthError({
          code: 'functions/failed-precondition',
          details: { reason: 'LEGAL_CONSENT_REQUIRED' },
        }, { name: 'LandingPage', params: { cityId: 'tlv' } })}
      />
    </>
  );
}

describe('AuthProvider capability gate', () => {
  beforeEach(() => {
    authListener = null;
    profileListener = null;
  });

  it('preserves return context and navigates back only after the account becomes active', async () => {
    const navigationRef = {
      isReady: jest.fn(() => true),
      navigate: jest.fn(),
      resetRoot: jest.fn(),
    };
    const screen = render(
      <AuthProvider navigationRef={navigationRef}><Harness /></AuthProvider>
    );
    await act(async () => {});
    expect(screen.getByTestId('auth-status').props.children).toBe(AUTH_STATES.GUEST);
    fireEvent.press(screen.getByTestId('require-active'));
    expect(screen.getByTestId('gate-status').props.children).toBe(AUTH_STATES.GUEST);

    const user = { uid: 'user-1', emailVerified: true, providerData: [{ providerId: 'password' }] };
    await act(async () => {
      authListener(user);
      profileListener({ exists: () => true, data: () => activeDocument });
    });

    expect(screen.getByTestId('auth-status').props.children).toBe(AUTH_STATES.READY);
    expect(navigationRef.resetRoot).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'LandingPage', params: { cityId: 'tlv' } }],
    });
  });

  it('opens the same central gate for structured server authorization errors', async () => {
    const navigationRef = {
      isReady: jest.fn(() => true),
      navigate: jest.fn(),
      resetRoot: jest.fn(),
    };
    const screen = render(
      <AuthProvider navigationRef={navigationRef}><Harness /></AuthProvider>
    );
    await act(async () => {});
    fireEvent.press(screen.getByTestId('handle-server-auth-error'));
    expect(screen.getByTestId('gate-status').props.children)
      .toBe(AUTH_STATES.ACCOUNT_SETUP_REQUIRED);
  });
});
