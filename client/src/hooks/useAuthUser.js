import { useAuth } from '../features/auth/AuthContext';

export function useAuthUser() {
  const {
    user,
    userDocument,
    loading,
    isGuest,
    isActive,
    status,
    authFlowInProgress,
    requireCapability,
    ensureCapability,
    handleCallableAuthError,
  } = useAuth();
  return {
    user,
    userDocument,
    loading,
    isGuest,
    isActive,
    status,
    authFlowInProgress,
    requireCapability,
    ensureCapability,
    handleCallableAuthError,
  };
}
