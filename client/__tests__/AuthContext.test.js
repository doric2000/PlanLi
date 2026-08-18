import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';

import { AuthProvider, useAuth } from '../src/features/auth/AuthContext';
import { AUTH_STATES, CAPABILITIES } from '../src/constants/authPolicy';

let authListener;
let profileListener;

jest.mock('../src/services/ErrorReporting', () => ({
  addDiagnosticBreadcrumb: jest.fn(),
  captureDiagnosticException: jest.fn(),
  setDiagnosticTag: jest.fn(),
  setErrorReportingUser: jest.fn(),
}));

jest.mock('firebase/auth', () => ({
  onIdTokenChanged: (_auth, callback) => {
    authListener = callback;
    callback(null);
    return jest.fn();
  },
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(() => ({ path: 'users/user-1' })),
  onSnapshot: (_reference, _options, callback) => {
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
    privacyVersion: '2026-08-18-beta-observability',
    acceptedAt: { seconds: 1 },
  },
  smartProfile: { setupRequired: false, completedAt: { seconds: 1 } },
};

function Harness() {
  const {
    status,
    gate,
    dismissGate,
    requireCapability,
    handleCallableAuthError,
    openRegistration,
    synchronizeUserDocument,
  } = useAuth();
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
      <TouchableOpacity
        testID="require-blocked-route"
        onPress={() => requireCapability(
          CAPABILITIES.ACTIVE,
          { name: 'PreferenceSetup' },
          { blockedRoute: true }
        )}
      />
      <TouchableOpacity testID="dismiss-gate" onPress={dismissGate} />
      <TouchableOpacity testID="open-registration" onPress={openRegistration} />
      <TouchableOpacity
        testID="synchronize-profile"
        onPress={() => synchronizeUserDocument(activeDocument)}
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
    act(() => {});
    expect(screen.getByTestId('auth-status').props.children).toBe(AUTH_STATES.GUEST);
    fireEvent.press(screen.getByTestId('require-active'));
    expect(screen.getByTestId('gate-status').props.children).toBe(AUTH_STATES.GUEST);

    const user = { uid: 'user-1', emailVerified: true, providerData: [{ providerId: 'password' }] };
    act(() => {
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
    act(() => {});
    fireEvent.press(screen.getByTestId('handle-server-auth-error'));
    expect(screen.getByTestId('gate-status').props.children)
      .toBe(AUTH_STATES.ACCOUNT_SETUP_REQUIRED);
  });

  it('opens registration with the originating public tab as its safe back destination', () => {
    const navigationRef = {
      getCurrentRoute: jest.fn(() => ({ name: 'Community' })),
      isReady: jest.fn(() => true),
      navigate: jest.fn(),
      resetRoot: jest.fn(),
    };
    const screen = render(
      <AuthProvider navigationRef={navigationRef}><Harness /></AuthProvider>
    );

    fireEvent.press(screen.getByTestId('require-active'));
    fireEvent.press(screen.getByTestId('open-registration'));

    expect(navigationRef.navigate).toHaveBeenCalledWith('Main', {
      screen: 'Tabs',
      params: {
        screen: 'Auth',
        params: {
          screen: 'Register',
          params: { fallbackTab: 'Community' },
        },
      },
    });
  });

  it('does not let a cached profile downgrade a server-confirmed account state', () => {
    const navigationRef = {
      isReady: jest.fn(() => true),
      navigate: jest.fn(),
      resetRoot: jest.fn(),
    };
    const screen = render(
      <AuthProvider navigationRef={navigationRef}><Harness /></AuthProvider>
    );
    const user = { uid: 'user-1', emailVerified: true, providerData: [{ providerId: 'password' }] };

    act(() => {
      authListener(user);
      profileListener({
        exists: () => true,
        data: () => ({ displayName: 'Admin' }),
        metadata: { fromCache: true },
      });
    });
    expect(screen.getByTestId('auth-status').props.children).toBe(AUTH_STATES.LOADING);

    fireEvent.press(screen.getByTestId('synchronize-profile'));
    expect(screen.getByTestId('auth-status').props.children).toBe(AUTH_STATES.READY);

    act(() => {
      profileListener({
        exists: () => true,
        data: () => ({ displayName: 'Admin' }),
        metadata: { fromCache: true },
      });
    });
    expect(screen.getByTestId('auth-status').props.children).toBe(AUTH_STATES.READY);
  });

  it('leaves a blocked route safely when the user chooses not now', async () => {
    const navigationRef = {
      isReady: jest.fn(() => true),
      navigate: jest.fn(),
      resetRoot: jest.fn(),
    };
    const screen = render(
      <AuthProvider navigationRef={navigationRef}><Harness /></AuthProvider>
    );
    act(() => {});
    fireEvent.press(screen.getByTestId('require-blocked-route'));
    fireEvent.press(screen.getByTestId('dismiss-gate'));
    expect(navigationRef.resetRoot).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'Main', params: { allowIncomplete: true } }],
    });
    expect(screen.getByTestId('gate-status').props.children).toBe('');
  });
});
