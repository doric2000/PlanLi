import { useAuth } from '../features/auth/AuthContext';

export function useAuthUser() {
  const {
    user,
    userDocument,
    loading,
    isGuest,
    isActive,
    status,
    requireCapability,
    handleCallableAuthError,
  } = useAuth();
  return {
    user,
    userDocument,
    loading,
    isGuest,
    isActive,
    status,
    requireCapability,
    handleCallableAuthError,
  };
}
