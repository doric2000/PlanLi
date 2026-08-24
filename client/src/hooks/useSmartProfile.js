import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuthUser } from './useAuthUser';
import { normalizeClientSmartProfile } from '../features/profile/utils/preferenceSetup';

export const isSmartProfileComplete = (smartProfile) => {
  if (!smartProfile?.completedAt || smartProfile.setupRequired === true) return false;
  const normalized = normalizeClientSmartProfile(smartProfile);
  const onboardingVersion = Number(smartProfile.onboardingVersion || 1);
  const validInterestCount = onboardingVersion >= 2
    ? normalized.interests.length >= 2 && normalized.interests.length <= 4
    : normalized.interests.length >= 3 && normalized.interests.length <= 8;
  return validInterestCount &&
    Boolean(normalized.budget) && normalized.travelParties.length >= 1;
};
export const shouldRequirePreferenceSetup = (smartProfile) => (
  smartProfile?.setupRequired === true && !isSmartProfileComplete(smartProfile)
);

export function useSmartProfile(retryKey = 0) {
  const { user, loading: authLoading } = useAuthUser();
  const [smartProfile, setSmartProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (authLoading) return undefined;
    if (!user?.uid) {
      setSmartProfile(null);
      setError(null);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    setError(null);
    return onSnapshot(
      doc(db, 'users', user.uid),
      (snapshot) => {
        setSmartProfile(snapshot.data()?.smartProfile || null);
        setError(null);
        setLoading(false);
      },
      (snapshotError) => {
        setSmartProfile(null);
        setError(snapshotError);
        setLoading(false);
      }
    );
  }, [authLoading, retryKey, user?.uid]);

  return {
    smartProfile,
    loading: authLoading || loading,
    completed: isSmartProfileComplete(smartProfile),
    setupRequired: shouldRequirePreferenceSetup(smartProfile),
    error,
  };
}
