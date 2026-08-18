import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { onIdTokenChanged } from 'firebase/auth';

import { auth, db } from '../../config/firebase';
import {
  AUTH_STATES,
  CAPABILITIES,
  deriveAuthState,
} from '../../constants/authPolicy';
import { getRequiredAuthState } from '../../services/CallableErrorService';
import {
  addDiagnosticBreadcrumb,
  captureDiagnosticException,
  setDiagnosticTag,
  setErrorReportingUser,
} from '../../services/ErrorReporting';
import { openAuthFlow } from '../../navigation/authNavigation';

const AuthContext = createContext(null);

const STATE_ROUTES = {
  [AUTH_STATES.EMAIL_VERIFICATION_REQUIRED]: 'VerifyEmail',
  [AUTH_STATES.ACCOUNT_SETUP_REQUIRED]: 'CompleteAccount',
  [AUTH_STATES.PREFERENCES_REQUIRED]: 'PreferenceSetup',
};

export function AuthProvider({ children, navigationRef }) {
  const [user, setUser] = useState(auth.currentUser);
  const [userDocument, setUserDocument] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState(null);
  const [gate, setGate] = useState(null);
  const [authFlowTransitionCount, setAuthFlowTransitionCount] = useState(0);
  const pendingReturnToRef = useRef(null);
  const previousStatusRef = useRef(null);

  useEffect(() => {
    let unsubscribeProfile = null;
    const unsubscribeAuth = onIdTokenChanged(auth, (nextUser) => {
      unsubscribeProfile?.();
      unsubscribeProfile = null;
      setUser(nextUser);
      setProfileError(null);
      if (!nextUser?.uid) {
        setUserDocument(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      unsubscribeProfile = onSnapshot(
        doc(db, 'users', nextUser.uid),
        (snapshot) => {
          setUserDocument(snapshot.exists() ? snapshot.data() : null);
          setProfileError(null);
          setLoading(false);
        },
        (error) => {
          addDiagnosticBreadcrumb({
            category: 'auth',
            message: 'Profile subscription failed',
            level: 'error',
            data: { operation: 'profile_snapshot', outcome: 'error', code: error?.code || 'unknown' },
          });
          captureDiagnosticException(error, {
            operation: 'profile_snapshot',
            code: error?.code || 'unknown',
          });
          setProfileError(error);
          setLoading(false);
        }
      );
    }, (error) => {
      addDiagnosticBreadcrumb({
        category: 'auth',
        message: 'Authentication listener failed',
        level: 'error',
        data: { operation: 'auth_listener', outcome: 'error', code: error?.code || 'unknown' },
      });
      captureDiagnosticException(error, {
        operation: 'auth_listener',
        code: error?.code || 'unknown',
      });
      setProfileError(error);
      setLoading(false);
    });
    return () => {
      unsubscribeProfile?.();
      unsubscribeAuth();
    };
  }, []);

  const status = deriveAuthState(user, userDocument, loading);

  useEffect(() => {
    setErrorReportingUser(user?.uid || null);
  }, [user?.uid]);

  useEffect(() => {
    const previousStatus = previousStatusRef.current;
    if (previousStatus !== status) {
      setDiagnosticTag('auth_state', status);
      addDiagnosticBreadcrumb({
        category: 'auth.state',
        message: 'Authentication state changed',
        data: { from: previousStatus || 'initial', to: status },
      });
      previousStatusRef.current = status;
    }
  }, [status]);

  useEffect(() => {
    if (status !== AUTH_STATES.READY || !pendingReturnToRef.current) return;
    if (!navigationRef?.isReady?.()) return;
    const returnTo = pendingReturnToRef.current;
    pendingReturnToRef.current = null;
    setGate(null);
    navigationRef.resetRoot({ index: 0, routes: [{ name: returnTo.name, params: returnTo.params }] });
  }, [navigationRef, status]);

  const dismissGate = useCallback(() => {
    const shouldLeaveBlockedRoute = gate?.blockedRoute === true;
    addDiagnosticBreadcrumb({
      category: 'auth',
      message: 'Authentication gate dismissed',
      data: { operation: 'dismiss_gate', status: gate?.status || status },
    });
    pendingReturnToRef.current = null;
    setGate(null);
    if (shouldLeaveBlockedRoute && navigationRef?.isReady?.()) {
      navigationRef.resetRoot({
        index: 0,
        routes: [{ name: 'Main', params: { allowIncomplete: true } }],
      });
    }
  }, [gate?.blockedRoute, gate?.status, navigationRef, status]);

  const openRequiredStep = useCallback(() => {
    const nextStatus = gate?.status || status;
    const routeName = STATE_ROUTES[nextStatus];
    addDiagnosticBreadcrumb({
      category: 'auth',
      message: 'Required account step opened',
      data: { operation: 'open_required_step', status: nextStatus, to: routeName || 'Login' },
    });
    setGate(null);
    if (!navigationRef?.isReady?.()) return;
    if (nextStatus === AUTH_STATES.GUEST) {
      openAuthFlow(navigationRef, 'Login');
      return;
    }
    if (routeName) navigationRef.navigate(routeName);
  }, [gate?.status, navigationRef, status]);

  const openRegistration = useCallback(() => {
    setGate(null);
    if (navigationRef?.isReady?.()) openAuthFlow(navigationRef, 'Register');
  }, [navigationRef]);

  const requireCapability = useCallback((capability, returnTo, options = {}) => {
    if (capability === CAPABILITIES.PUBLIC) return true;
    const signedInCapability = capability === CAPABILITIES.SIGNED_IN
      || capability === CAPABILITIES.ACCOUNT_MANAGEMENT;
    if (signedInCapability && user?.uid) return true;
    if (
      capability === CAPABILITIES.PREFERENCES_SETUP
      && [AUTH_STATES.PREFERENCES_REQUIRED, AUTH_STATES.READY].includes(status)
    ) return true;
    if (capability === CAPABILITIES.ACTIVE && status === AUTH_STATES.READY) return true;
    if (returnTo?.name) pendingReturnToRef.current = returnTo;
    addDiagnosticBreadcrumb({
      category: 'auth',
      message: 'Capability gate opened',
      data: { operation: 'require_capability', status, to: returnTo?.name || 'unknown' },
    });
    setGate({
      capability,
      status,
      returnTo: returnTo || null,
      blockedRoute: options.blockedRoute === true,
    });
    return false;
  }, [status, user?.uid]);

  const handleCallableAuthError = useCallback((error, returnTo) => {
    const requiredStatus = getRequiredAuthState(error);
    if (!requiredStatus) return false;
    addDiagnosticBreadcrumb({
      category: 'callable',
      message: 'Callable requires an account step',
      level: 'warning',
      data: {
        operation: 'handle_auth_error',
        outcome: 'blocked',
        reason: error?.details?.reason || 'unknown',
        code: error?.code || 'unknown',
      },
    });
    if (returnTo?.name) pendingReturnToRef.current = returnTo;
    setGate({ capability: CAPABILITIES.ACTIVE, status: requiredStatus, returnTo: returnTo || null });
    return true;
  }, []);

  const clearPendingReturn = useCallback(() => {
    pendingReturnToRef.current = null;
  }, []);

  const runAuthTransition = useCallback(async (operation, operationName = 'auth_flow') => {
    const startedAt = Date.now();
    addDiagnosticBreadcrumb({
      category: 'auth',
      message: 'Authentication operation started',
      data: { operation: operationName, outcome: 'started' },
    });
    setAuthFlowTransitionCount((count) => count + 1);
    try {
      const result = await operation();
      addDiagnosticBreadcrumb({
        category: 'auth',
        message: 'Authentication operation completed',
        data: { operation: operationName, outcome: 'success', durationMs: Date.now() - startedAt },
      });
      return result;
    } catch (error) {
      addDiagnosticBreadcrumb({
        category: 'auth',
        message: 'Authentication operation failed',
        level: 'error',
        data: {
          operation: operationName,
          outcome: 'error',
          code: error?.code || 'unknown',
          durationMs: Date.now() - startedAt,
        },
      });
      captureDiagnosticException(error, {
        operation: operationName,
        code: error?.code || 'unknown',
      });
      throw error;
    } finally {
      setAuthFlowTransitionCount((count) => Math.max(0, count - 1));
    }
  }, []);

  const authFlowInProgress = authFlowTransitionCount > 0;

  const value = useMemo(() => ({
    user,
    userDocument,
    status,
    loading,
    profileError,
    authFlowInProgress,
    runAuthTransition,
    isGuest: status === AUTH_STATES.GUEST,
    isActive: status === AUTH_STATES.READY,
    gate,
    dismissGate,
    openRequiredStep,
    openRegistration,
    requireCapability,
    handleCallableAuthError,
    clearPendingReturn,
  }), [
    clearPendingReturn,
    dismissGate,
    gate,
    loading,
    openRegistration,
    openRequiredStep,
    profileError,
    authFlowInProgress,
    runAuthTransition,
    requireCapability,
    handleCallableAuthError,
    status,
    user,
    userDocument,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}

export function useRequireCapability() {
  return useAuth().requireCapability;
}
