import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuthUser } from './useAuthUser';
import { normalizeClientSmartProfile } from '../features/profile/utils/preferenceSetup';

export const isSmartProfileComplete = (smartProfile) => {
  if (!smartProfile?.completedAt || smartProfile.setupRequired === true) return false;
  const normalized = normalizeClientSmartProfile(smartProfile);
  return normalized.interests.length >= 3 && normalized.interests.length <= 8 &&
    Boolean(normalized.budget) && normalized.travelParties.length >= 1;
};
export const shouldRequirePreferenceSetup = (smartProfile) => (
  smartProfile?.setupRequired === true && !isSmartProfileComplete(smartProfile)
);

export function useSmartProfile() {
  const { user, loading: authLoading } = useAuthUser();
  const [smartProfile, setSmartProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return undefined;
    if (!user?.uid) {
      setSmartProfile(null);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    return onSnapshot(
      doc(db, 'users', user.uid),
      (snapshot) => {
        setSmartProfile(snapshot.data()?.smartProfile || null);
        setLoading(false);
      },
      () => {
        setSmartProfile(null);
        setLoading(false);
      }
    );
  }, [authLoading, user?.uid]);

  return {
    smartProfile,
    loading: authLoading || loading,
    completed: isSmartProfileComplete(smartProfile),
    setupRequired: shouldRequirePreferenceSetup(smartProfile),
  };
}
