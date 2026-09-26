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

function Harness({ destination = { name: 'LandingPage', params: { cityId: 'tlv' } }, onContext }) {
  const context = useAuth();
  onContext?.(context);
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
    userDocument,
  } = useAuth();
  return (
    <>
      <Text testID="auth-status">{status}</Text>
      <Text testID="gate-status">{gate?.status || ''}</Text>
      <Text testID="profile-name">{userDocument?.displayName || ''}</Text>
      <TouchableOpacity
        testID="require-active"
        onPress={() => requireCapability(CAPABILITIES.ACTIVE, destination)}
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
        testID="synchronize-stale-profile"
        onPress={() => synchronizeUserDocument(
          { ...activeDocument, displayName: 'Stale first account' },
          'user-1'
        )}
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

  it.each(['SharedTrip', 'RouteDetail', 'RecommendationDetail'])('keeps a home destination after signing in from %s', async name => {
    const navigationRef = { isReady: jest.fn(() => true), resetRoot: jest.fn() };
    const destination = { name, params: { token: 'shared-token' } };
    const screen = render(<AuthProvider navigationRef={navigationRef}><Harness destination={destination} /></AuthProvider>);
    fireEvent.press(screen.getByTestId('require-active'));
    await act(async () => {
      authListener({ uid: 'user-1', emailVerified: true, providerData: [{ providerId: 'password' }] });
      profileListener({ exists: () => true, data: () => activeDocument });
    });
    await waitFor(() => expect(navigationRef.resetRoot).toHaveBeenCalledWith({
      index: 1, routes: [{ name: 'Main' }, destination],
    }));
  });

  function setupReturn({ navigationReady = true } = {}) {
    let context;
    const destination = { name: 'SharedTrip', params: { token: 'shared-token' } };
    const navigationRef = { isReady: jest.fn(() => navigationReady), resetRoot: jest.fn() };
    const harness = <Harness destination={destination} onContext={value => { context = value; }} />;
    const screen = render(<AuthProvider navigationRef={navigationRef} navigationReady={navigationReady}>{harness}</AuthProvider>);
    fireEvent.press(screen.getByTestId('require-active'));
    return { navigationRef, destination, screen, harness, context: () => context };
  }

  async function signIn({ uid = 'user-1', emailVerified = true } = {}) {
    await act(async () => {
      authListener({ uid, emailVerified, providerData: [{ providerId: 'password' }] });
    });
  }

  function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
  }

  it.each(['SharedTrip', 'RouteDetail', 'RecommendationDetail'])(
    'waits for slow sign-in bootstrap, restores %s once, and ignores subsequent token refreshes', async name => {
      const test = setupReturn();
      const destination = { name, params: { token: 'shared-token', id: 'item-1' } };
      act(() => test.context().requireCapability(CAPABILITIES.ACTIVE, destination));
      const bootstrap = deferred();
      let transition;
      act(() => { transition = test.context().runAuthTransition(() => bootstrap.promise, 'sign_in_email', { name: 'Main' }); });
      await signIn();
      expect(test.context().status).toBe(AUTH_STATES.READY);
      expect(test.navigationRef.resetRoot).not.toHaveBeenCalled();
      await act(async () => { bootstrap.resolve(); await transition; });
      expect(test.navigationRef.resetRoot).toHaveBeenCalledTimes(1);
      expect(test.navigationRef.resetRoot).toHaveBeenLastCalledWith({ index: 1, routes: [{ name: 'Main' }, destination] });
      await signIn();
      act(() => profileListener({ exists: () => true, data: () => activeDocument }));
      expect(test.navigationRef.resetRoot).toHaveBeenCalledTimes(1);
    }
  );

  it('waits for a server-confirmed profile when sign-in completes first', async () => {
    const profile = deferred();
    getDocFromServer.mockReturnValue(profile.promise);
    const test = setupReturn();
    await act(async () => {
      await test.context().runAuthTransition(async () => {
        authListener({ uid: 'user-1', emailVerified: true, providerData: [{ providerId: 'password' }] });
      }, 'sign_in_email', { name: 'Main' });
    });
    expect(test.navigationRef.resetRoot).not.toHaveBeenCalled();
    await act(async () => { profile.resolve({ exists: () => true, data: () => activeDocument }); });
    expect(test.navigationRef.resetRoot).toHaveBeenCalledTimes(1);
    expect(test.navigationRef.resetRoot).toHaveBeenCalledWith({ index: 1, routes: [{ name: 'Main' }, test.destination] });
  });

  it.each([false, true])('uses the normal destination without a pending link (admin=%s)', async admin => {
    const previous = process.env.EXPO_PUBLIC_ADMIN_WEB;
    process.env.EXPO_PUBLIC_ADMIN_WEB = String(admin);
    try {
      const test = setupReturn();
      act(() => test.context().clearPendingReturn());
      await signIn();
      await act(async () => { await test.context().runAuthTransition(async () => {}, 'sign_in_email', { name: 'Main' }); });
      expect(test.navigationRef.resetRoot).toHaveBeenCalledTimes(1);
      expect(test.navigationRef.resetRoot).toHaveBeenCalledWith({ index: 0, routes: [{ name: admin ? 'AdminPanel' : 'Main' }] });
    } finally {
      if (previous === undefined) delete process.env.EXPO_PUBLIC_ADMIN_WEB;
      else process.env.EXPO_PUBLIC_ADMIN_WEB = previous;
    }
  });

  it('retains the link through verification, legal completion and optional onboarding', async () => {
    const test = setupReturn();
    getDocFromServer.mockResolvedValue({ exists: () => true, data: () => ({ displayName: 'Dana' }) });
    await signIn({ emailVerified: false });
    await act(async () => { await test.context().runAuthTransition(async () => {}, 'register_email', { name: 'Main' }); });
    expect(test.navigationRef.resetRoot).toHaveBeenLastCalledWith({ index: 0, routes: [{ name: 'VerifyEmail' }] });
    await signIn();
    expect(test.navigationRef.resetRoot).toHaveBeenCalledTimes(1);
    act(() => test.context().completeAuthNavigation());
    expect(test.navigationRef.resetRoot).toHaveBeenLastCalledWith({ index: 0, routes: [{ name: 'CompleteAccount' }] });
    await act(async () => {
      await test.context().runAuthTransition(async () => {
        test.context().synchronizeUserDocument(activeDocument, 'user-1');
      }, 'complete_account', { name: 'PreferenceSetup', params: { source: 'new-account' } });
    });
    expect(test.navigationRef.resetRoot).toHaveBeenCalledTimes(3);
    expect(test.navigationRef.resetRoot).toHaveBeenLastCalledWith({ index: 0, routes: [{ name: 'PreferenceSetup', params: { source: 'new-account' } }] });
    act(() => profileListener({ exists: () => true, data: () => activeDocument }));
    expect(test.navigationRef.resetRoot).toHaveBeenCalledTimes(3);
    act(() => test.context().completeAuthNavigation());
    expect(test.navigationRef.resetRoot).toHaveBeenCalledTimes(4);
    expect(test.navigationRef.resetRoot).toHaveBeenLastCalledWith({ index: 1, routes: [{ name: 'Main' }, test.destination] });
  });

  it('does not resurrect a cancelled return when an in-flight login finishes', async () => {
    const test = setupReturn();
    const login = deferred();
    let transition;
    act(() => { transition = test.context().runAuthTransition(() => login.promise, 'sign_in_email', { name: 'Main' }); });
    act(() => test.context().clearPendingReturn());
    await signIn();
    await act(async () => { login.resolve(); await transition; });
    expect(test.navigationRef.resetRoot).not.toHaveBeenCalled();
    act(() => test.context().completeAuthNavigation());
    expect(test.navigationRef.resetRoot).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'Main' }] });
  });

  it('retains the return after a failed sign-in so a retry can complete it', async () => {
    const test = setupReturn();
    await act(async () => {
      await expect(test.context().runAuthTransition(async () => { throw new Error('offline'); }, 'sign_in_email', { name: 'Main' }))
        .rejects.toThrow('offline');
    });
    expect(test.navigationRef.resetRoot).not.toHaveBeenCalled();
    await signIn();
    expect(test.navigationRef.resetRoot).not.toHaveBeenCalled();
    await act(async () => { await test.context().runAuthTransition(async () => {}, 'sign_in_email', { name: 'Main' }); });
    expect(test.navigationRef.resetRoot).toHaveBeenCalledWith({ index: 1, routes: [{ name: 'Main' }, test.destination] });
  });

  it('keeps a completed navigation request until the navigator is ready', async () => {
    const test = setupReturn({ navigationReady: false });
    await signIn();
    act(() => test.context().completeAuthNavigation());
    expect(test.navigationRef.resetRoot).not.toHaveBeenCalled();
    test.navigationRef.isReady.mockReturnValue(true);
    test.screen.rerender(<AuthProvider navigationRef={test.navigationRef} navigationReady>{test.harness}</AuthProvider>);
    expect(test.navigationRef.resetRoot).toHaveBeenCalledTimes(1);
    expect(test.navigationRef.resetRoot).toHaveBeenCalledWith({ index: 1, routes: [{ name: 'Main' }, test.destination] });
  });

  it.each([null, { uid: 'user-2', emailVerified: true }])('clears a pending return on sign-out or account switch: %s', async nextUser => {
    const test = setupReturn();
    const login = deferred();
    let transition;
    act(() => { transition = test.context().runAuthTransition(() => login.promise, 'sign_in_email', { name: 'Main' }); });
    await signIn();
    await act(async () => { authListener(nextUser); });
    await act(async () => { login.resolve(); await transition; });
    expect(test.navigationRef.resetRoot).not.toHaveBeenCalled();
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

  it('resumes the pending destination once navigation becomes ready after auth', async () => {
    const navigationRef = { isReady: jest.fn(() => false), resetRoot: jest.fn(), navigate: jest.fn() };
    const screen = render(<AuthProvider navigationRef={navigationRef} navigationReady={false}><Harness /></AuthProvider>);
    fireEvent.press(screen.getByTestId('require-active'));
    await act(async () => {
      authListener({ uid: 'user-1', emailVerified: true, providerData: [{ providerId: 'password' }] });
      profileListener({ exists: () => true, data: () => activeDocument });
    });
    await waitFor(() => expect(screen.getByTestId('auth-status').props.children).toBe(AUTH_STATES.READY));
    expect(navigationRef.resetRoot).not.toHaveBeenCalled();
    navigationRef.isReady.mockReturnValue(true);
    screen.rerender(<AuthProvider navigationRef={navigationRef} navigationReady><Harness /></AuthProvider>);
    await waitFor(() => expect(navigationRef.resetRoot).toHaveBeenCalledWith({
      index: 0, routes: [{ name: 'LandingPage', params: { cityId: 'tlv' } }],
    }));
    expect(navigationRef.resetRoot).toHaveBeenCalledTimes(1);
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

  it('does not adopt a callable profile response after the authenticated UID changes', async () => {
    const screen = render(<AuthProvider><Harness /></AuthProvider>);
    const firstUser = { uid: 'user-1', emailVerified: true, providerData: [{ providerId: 'password' }] };
    const secondUser = { uid: 'user-2', emailVerified: true, providerData: [{ providerId: 'password' }] };
    const secondDocument = { ...activeDocument, displayName: 'Second account' };

    await act(async () => { authListener(firstUser); });
    getDocFromServer.mockResolvedValueOnce({ exists: () => true, data: () => secondDocument });
    await act(async () => {
      authListener(secondUser);
      profileListener({
        exists: () => true,
        data: () => secondDocument,
        metadata: { fromCache: false },
      });
    });
    await waitFor(() => expect(screen.getByTestId('profile-name').props.children)
      .toBe('Second account'));

    fireEvent.press(screen.getByTestId('synchronize-stale-profile'));

    expect(screen.getByTestId('profile-name').props.children).toBe('Second account');
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
