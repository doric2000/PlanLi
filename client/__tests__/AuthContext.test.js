import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { getDocFromServer } from 'firebase/firestore';

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
  getDocFromServer: jest.fn(),
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
  updatedAt: { seconds: 20 },
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
    ensureCapability,
    handleCallableAuthError,
    openRegistration,
    synchronizeUserDocument,
    refreshUserDocumentFromServer,
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
      <TouchableOpacity
        testID="ensure-active"
        onPress={() => ensureCapability(CAPABILITIES.ACTIVE, { name: 'Favorites' })}
      />
      <TouchableOpacity
        testID="refresh-twice"
        onPress={() => Promise.all([
          refreshUserDocumentFromServer(),
          refreshUserDocumentFromServer(),
        ])}
      />
    </>
  );
}

describe('AuthProvider capability gate', () => {
  beforeEach(() => {
    authListener = null;
    profileListener = null;
    getDocFromServer.mockReset();
    getDocFromServer.mockResolvedValue({ exists: () => true, data: () => activeDocument });
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
    await act(async () => {
      authListener(user);
      profileListener({ exists: () => true, data: () => activeDocument });
    });

    await waitFor(() => expect(screen.getByTestId('auth-status').props.children).toBe(AUTH_STATES.READY));
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
      .toBe(AUTH_STATES.LEGAL_CONSENT_REQUIRED);
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

  it('does not let a cached profile downgrade a server-confirmed account state', async () => {
    const navigationRef = {
      isReady: jest.fn(() => true),
      navigate: jest.fn(),
      resetRoot: jest.fn(),
    };
    const screen = render(
      <AuthProvider navigationRef={navigationRef}><Harness /></AuthProvider>
    );
    const user = { uid: 'user-1', emailVerified: true, providerData: [{ providerId: 'password' }] };

    await act(async () => {
      authListener(user);
      profileListener({
        exists: () => true,
        data: () => ({ displayName: 'Admin' }),
        metadata: { fromCache: true },
      });
    });
    await waitFor(() => expect(screen.getByTestId('auth-status').props.children).toBe(AUTH_STATES.READY));

    act(() => {
      profileListener({
        exists: () => true,
        data: () => ({ displayName: 'Admin' }),
        metadata: { fromCache: true },
      });
    });
    expect(screen.getByTestId('auth-status').props.children).toBe(AUTH_STATES.READY);
  });

  it('does not grant active access from an unconfirmed cached profile', async () => {
    getDocFromServer.mockRejectedValue(new Error('offline'));
    const screen = render(<AuthProvider><Harness /></AuthProvider>);
    const user = { uid: 'user-1', emailVerified: true, providerData: [{ providerId: 'password' }] };

    await act(async () => {
      authListener(user);
      profileListener({
        exists: () => true,
        data: () => activeDocument,
        metadata: { fromCache: true },
      });
    });

    await waitFor(() => expect(screen.getByTestId('auth-status').props.children)
      .toBe(AUTH_STATES.ACCOUNT_SETUP_REQUIRED));
    expect(screen.getByTestId('auth-status').props.children).not.toBe(AUTH_STATES.READY);
  });

  it('repairs a stale incomplete profile before allowing an active capability', async () => {
    const incompleteDocument = {
      displayName: 'Dana Cohen',
      updatedAt: { seconds: 10 },
      onboarding: activeDocument.onboarding,
      legal: {},
      smartProfile: activeDocument.smartProfile,
    };
    getDocFromServer
      .mockResolvedValueOnce({ exists: () => true, data: () => incompleteDocument })
      .mockResolvedValueOnce({ exists: () => true, data: () => activeDocument });
    const screen = render(<AuthProvider><Harness /></AuthProvider>);
    const user = { uid: 'user-1', emailVerified: true, providerData: [{ providerId: 'password' }] };

    await act(async () => { authListener(user); });
    await waitFor(() => expect(screen.getByTestId('auth-status').props.children)
      .toBe(AUTH_STATES.LEGAL_CONSENT_REQUIRED));
    await act(async () => { fireEvent.press(screen.getByTestId('ensure-active')); });

    await waitFor(() => expect(screen.getByTestId('auth-status').props.children).toBe(AUTH_STATES.READY));
    expect(screen.getByTestId('gate-status').props.children).toBe('');
    expect(getDocFromServer).toHaveBeenCalledTimes(2);
  });

  it('ignores an older server snapshot after accepting a newer profile revision', async () => {
    const screen = render(<AuthProvider><Harness /></AuthProvider>);
    const user = { uid: 'user-1', emailVerified: true, providerData: [{ providerId: 'password' }] };

    await act(async () => { authListener(user); });
    await waitFor(() => expect(screen.getByTestId('auth-status').props.children).toBe(AUTH_STATES.READY));
    act(() => {
      profileListener({
        exists: () => true,
        data: () => ({ displayName: 'Old profile', updatedAt: { seconds: 10 } }),
        metadata: { fromCache: false },
      });
    });

    expect(screen.getByTestId('auth-status').props.children).toBe(AUTH_STATES.READY);
  });

  it('discards a profile read that completes after the authenticated UID changes', async () => {
    let resolveFirstRead;
    getDocFromServer
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirstRead = resolve; }))
      .mockResolvedValueOnce({ exists: () => true, data: () => activeDocument });
    const screen = render(<AuthProvider><Harness /></AuthProvider>);
    const firstUser = { uid: 'user-1', emailVerified: true, providerData: [{ providerId: 'password' }] };
    const secondUser = { uid: 'user-2', emailVerified: true, providerData: [{ providerId: 'password' }] };

    act(() => { authListener(firstUser); });
    await act(async () => { authListener(secondUser); });
    await waitFor(() => expect(screen.getByTestId('auth-status').props.children).toBe(AUTH_STATES.READY));
    await act(async () => {
      resolveFirstRead({ exists: () => true, data: () => ({ displayName: 'Stale user' }) });
    });

    expect(screen.getByTestId('auth-status').props.children).toBe(AUTH_STATES.READY);
  });

  it('deduplicates concurrent authoritative profile refreshes for the same UID', async () => {
    const incompleteDocument = {
      displayName: 'Dana Cohen',
      updatedAt: { seconds: 10 },
      onboarding: activeDocument.onboarding,
      legal: {},
      smartProfile: activeDocument.smartProfile,
    };
    let resolveRefresh;
    getDocFromServer
      .mockResolvedValueOnce({ exists: () => true, data: () => incompleteDocument })
      .mockImplementationOnce(() => new Promise((resolve) => { resolveRefresh = resolve; }));
    const screen = render(<AuthProvider><Harness /></AuthProvider>);
    const user = { uid: 'user-1', emailVerified: true, providerData: [{ providerId: 'password' }] };
    await act(async () => { authListener(user); });
    await waitFor(() => expect(screen.getByTestId('auth-status').props.children)
      .toBe(AUTH_STATES.LEGAL_CONSENT_REQUIRED));

    act(() => { fireEvent.press(screen.getByTestId('refresh-twice')); });
    expect(getDocFromServer).toHaveBeenCalledTimes(2);
    await act(async () => {
      resolveRefresh({ exists: () => true, data: () => activeDocument });
    });
    await waitFor(() => expect(screen.getByTestId('auth-status').props.children).toBe(AUTH_STATES.READY));
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
