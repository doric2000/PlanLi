import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { doc, getDocFromServer, onSnapshot } from 'firebase/firestore';
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
import { getAuthFallbackTab, openAuthFlow } from '../../navigation/authNavigation';

const AuthContext = createContext(null);

const STATE_ROUTES = {
  [AUTH_STATES.EMAIL_VERIFICATION_REQUIRED]: 'VerifyEmail',
  [AUTH_STATES.ACCOUNT_SETUP_REQUIRED]: 'CompleteAccount',
  [AUTH_STATES.LEGAL_CONSENT_REQUIRED]: 'CompleteAccount',
  [AUTH_STATES.PREFERENCES_REQUIRED]: 'PreferenceSetup',
};

function timestampToMillis(value) {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') {
    return (value.seconds * 1000) + Math.floor((value.nanoseconds || 0) / 1000000);
  }
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function capabilityAllowed(capability, status, user) {
  if (capability === CAPABILITIES.PUBLIC) return true;
  if (
    [CAPABILITIES.SIGNED_IN, CAPABILITIES.ACCOUNT_MANAGEMENT].includes(capability)
    && user?.uid
  ) return true;
  if (
    capability === CAPABILITIES.PREFERENCES_SETUP
    && [AUTH_STATES.PREFERENCES_REQUIRED, AUTH_STATES.READY].includes(status)
  ) return true;
  return capability === CAPABILITIES.ACTIVE && status === AUTH_STATES.READY;
}

export function AuthProvider({ children, navigationRef }) {
  const [user, setUser] = useState(auth.currentUser);
  const [userDocument, setUserDocument] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState(null);
  const [profileConfirmedUid, setProfileConfirmedUid] = useState(null);
  const [gate, setGate] = useState(null);
  const [authFlowTransitionCount, setAuthFlowTransitionCount] = useState(0);
  const pendingReturnToRef = useRef(null);
  const previousStatusRef = useRef(null);
  const serverConfirmedProfileUidRef = useRef(null);
  const activeUserRef = useRef(auth.currentUser);
  const activeProfileUidRef = useRef(auth.currentUser?.uid || null);
  const userDocumentRef = useRef(null);
  const profileRevisionRef = useRef(null);
  const profileRefreshRef = useRef(null);
  const sessionSequenceRef = useRef(0);
  const bootstrapUidRef = useRef(null);

  const adoptUserDocument = useCallback((
    uid,
    nextDocument,
    { authoritative = false, allowUnversioned = false } = {}
  ) => {
    if (!uid || activeProfileUidRef.current !== uid) return userDocumentRef.current;
    const nextRevision = timestampToMillis(nextDocument?.updatedAt);
    if (
      profileRevisionRef.current !== null
      && nextRevision !== null
      && nextRevision < profileRevisionRef.current
    ) {
      return userDocumentRef.current;
    }
    if (
      authoritative
      && !allowUnversioned
      && profileRevisionRef.current !== null
      && nextRevision === null
    ) {
      return userDocumentRef.current;
    }
    if (!authoritative && serverConfirmedProfileUidRef.current === uid) {
      return userDocumentRef.current;
    }
    userDocumentRef.current = nextDocument || null;
    if (authoritative && nextRevision !== null) profileRevisionRef.current = nextRevision;
    if (authoritative) {
      serverConfirmedProfileUidRef.current = uid;
      setProfileConfirmedUid(uid);
    }
    setUserDocument(nextDocument || null);
    setProfileError(null);
    return nextDocument || null;
  }, []);

  const refreshUserDocumentFromServer = useCallback(async () => {
    const currentUser = activeUserRef.current;
    const uid = currentUser?.uid;
    if (!uid) return { document: null, status: AUTH_STATES.GUEST };
    if (profileRefreshRef.current?.uid === uid) return profileRefreshRef.current.promise;

    const sessionSequence = sessionSequenceRef.current;
    const promise = (async () => {
      try {
        const snapshot = await getDocFromServer(doc(db, 'users', uid));
        if (
          activeProfileUidRef.current !== uid
          || activeUserRef.current?.uid !== uid
          || sessionSequenceRef.current !== sessionSequence
        ) {
          return { document: userDocumentRef.current, status: AUTH_STATES.LOADING, discarded: true };
        }
        const nextDocument = snapshot.exists() ? snapshot.data() : null;
        const acceptedDocument = adoptUserDocument(uid, nextDocument, { authoritative: true });
        return {
          document: acceptedDocument,
          status: deriveAuthState(activeUserRef.current, acceptedDocument, false),
        };
      } finally {
        if (profileRefreshRef.current?.promise === promise) profileRefreshRef.current = null;
      }
    })();
    profileRefreshRef.current = { uid, promise };
    return promise;
  }, [adoptUserDocument]);

  useEffect(() => {
    let unsubscribeProfile = null;
    const unsubscribeAuth = onIdTokenChanged(auth, (nextUser) => {
      unsubscribeProfile?.();
      unsubscribeProfile = null;
      sessionSequenceRef.current += 1;
      activeUserRef.current = nextUser;
      activeProfileUidRef.current = nextUser?.uid || null;
      userDocumentRef.current = null;
      profileRevisionRef.current = null;
      profileRefreshRef.current = null;
      bootstrapUidRef.current = nextUser?.uid || null;
      serverConfirmedProfileUidRef.current = null;
      setProfileConfirmedUid(null);
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
        { includeMetadataChanges: true },
        (snapshot) => {
          if (activeProfileUidRef.current !== nextUser.uid) return;
          const fromCache = snapshot.metadata?.fromCache === true;
          adoptUserDocument(
            nextUser.uid,
            snapshot.exists() ? snapshot.data() : null,
            { authoritative: !fromCache }
          );
          if (!fromCache && bootstrapUidRef.current !== nextUser.uid) setLoading(false);
        },
        (error) => {
          if (activeProfileUidRef.current !== nextUser.uid) return;
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
          if (bootstrapUidRef.current !== nextUser.uid) setLoading(false);
        }
      );

      refreshUserDocumentFromServer()
        .catch((error) => {
          if (activeProfileUidRef.current !== nextUser.uid) return;
          addDiagnosticBreadcrumb({
            category: 'auth',
            message: 'Authoritative profile refresh failed',
            level: 'error',
            data: { operation: 'profile_server_read', outcome: 'error', code: error?.code || 'unknown' },
          });
          captureDiagnosticException(error, {
            operation: 'profile_server_read',
            code: error?.code || 'unknown',
          });
          setProfileError(error);
        })
        .finally(() => {
          if (activeProfileUidRef.current !== nextUser.uid) return;
          bootstrapUidRef.current = null;
          setLoading(false);
        });
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
  }, [adoptUserDocument, refreshUserDocumentFromServer]);

  const confirmedUserDocument = profileConfirmedUid === user?.uid ? userDocument : null;
  const status = deriveAuthState(user, confirmedUserDocument, loading);

  const synchronizeUserDocument = useCallback((nextUserDocument) => {
    const currentUser = activeUserRef.current;
    if (!currentUser?.uid) return AUTH_STATES.GUEST;
    const acceptedDocument = adoptUserDocument(currentUser.uid, nextUserDocument, {
      authoritative: true,
      allowUnversioned: true,
    });
    setLoading(false);
    return deriveAuthState(currentUser, acceptedDocument, false);
  }, [adoptUserDocument]);

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
      openAuthFlow(navigationRef, 'Login', {
        fallbackTab: getAuthFallbackTab(navigationRef.getCurrentRoute?.()?.name),
      });
      return;
    }
    if (routeName) navigationRef.navigate(routeName);
  }, [gate?.status, navigationRef, status]);

  const openRegistration = useCallback(() => {
    setGate(null);
    if (navigationRef?.isReady?.()) {
      openAuthFlow(navigationRef, 'Register', {
        fallbackTab: getAuthFallbackTab(navigationRef.getCurrentRoute?.()?.name),
      });
    }
  }, [navigationRef]);

  const openCapabilityGate = useCallback((capability, gateStatus, returnTo, options = {}) => {
    if (returnTo?.name) pendingReturnToRef.current = returnTo;
    addDiagnosticBreadcrumb({
      category: 'auth',
      message: 'Capability gate opened',
      data: { operation: 'require_capability', status: gateStatus, to: returnTo?.name || 'unknown' },
    });
    setGate({
      capability,
      status: gateStatus,
      returnTo: returnTo || null,
      blockedRoute: options.blockedRoute === true,
    });
  }, []);

  const requireCapability = useCallback((capability, returnTo, options = {}) => {
    if (capabilityAllowed(capability, status, user)) return true;
    openCapabilityGate(capability, status, returnTo, options);
    return false;
  }, [openCapabilityGate, status, user]);

  const ensureCapability = useCallback(async (capability, returnTo, options = {}) => {
    const currentUser = activeUserRef.current;
    const currentDocument = serverConfirmedProfileUidRef.current === currentUser?.uid
      ? userDocumentRef.current
      : null;
    const currentStatus = deriveAuthState(currentUser, currentDocument, loading);
    if (capabilityAllowed(capability, currentStatus, currentUser)) return true;
    if (!currentUser?.uid) {
      openCapabilityGate(capability, AUTH_STATES.GUEST, returnTo, options);
      return false;
    }
    if (currentStatus === AUTH_STATES.EMAIL_VERIFICATION_REQUIRED) {
      openCapabilityGate(capability, currentStatus, returnTo, options);
      return false;
    }

    try {
      const refreshed = await refreshUserDocumentFromServer();
      if (refreshed.discarded) return false;
      if (capabilityAllowed(capability, refreshed.status, activeUserRef.current)) {
        setLoading(false);
        setGate(null);
        return true;
      }
      openCapabilityGate(capability, refreshed.status, returnTo, options);
      return false;
    } catch (_error) {
      const fallbackDocument = serverConfirmedProfileUidRef.current === activeUserRef.current?.uid
        ? userDocumentRef.current
        : null;
      const fallbackStatus = deriveAuthState(activeUserRef.current, fallbackDocument, false);
      openCapabilityGate(capability, fallbackStatus, returnTo, options);
      return false;
    }
  }, [loading, openCapabilityGate, refreshUserDocumentFromServer]);

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
    ensureCapability,
    handleCallableAuthError,
    clearPendingReturn,
    synchronizeUserDocument,
    refreshUserDocumentFromServer,
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
    ensureCapability,
    handleCallableAuthError,
    refreshUserDocumentFromServer,
    status,
    synchronizeUserDocument,
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
