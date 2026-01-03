import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';

import { db } from '../../../config/firebase';
import { calculateCredibilityScore, getCredibilityLevelLabel } from '../utils/credibility';

const DEFAULT_STATS = {
  trips: 0,
  reviews: 0,
  photos: 0,
  likesReceived: 0,
  credibilityScore: 0,
  credibilityLabel: 'Level 1 Traveler',
};

const buildDefaultUserData = (user) => ({
  displayName: 'Traveler',
  photoURL: null,
  email: user?.email || '',
  isExpert: false,
  smartProfile: null,
});

export function useProfileData({ uid, user }) {
  const [userData, setUserData] = useState(() => buildDefaultUserData(user));
  const [stats, setStats] = useState(DEFAULT_STATS);
  const [loading, setLoading] = useState(true);

  const userDocRef = useMemo(() => (uid ? doc(db, 'users', uid) : null), [uid]);

  const refresh = useCallback(async () => {
    if (!uid || !userDocRef) {
      setUserData(buildDefaultUserData(user));
      setStats(DEFAULT_STATS);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      let data = null;

      const userDoc = await getDoc(userDocRef);
      data = userDoc.exists() ? userDoc.data() : null;

      const resolvedDisplayName =
        data?.displayName || data?.fullName || user?.displayName || 'Traveler';
      const resolvedPhotoURL = data?.photoURL || user?.photoURL || null;
      const resolvedEmail = data?.email || user?.email || '';
      const resolvedIsExpert = Boolean(data?.isExpert);
      const resolvedSmartProfile = data?.smartProfile || null;

      setUserData({
        displayName: resolvedDisplayName,
        photoURL: resolvedPhotoURL,
        email: resolvedEmail,
        isExpert: resolvedIsExpert,
        smartProfile: resolvedSmartProfile,
      });

      let tripsCount = 0;
      try {
        const tripsQ = query(collection(db, 'routes'), where('userId', '==', uid));
        const tripsAgg = await getCountFromServer(tripsQ);
        tripsCount = tripsAgg.data().count || 0;
      } catch (e) {
        console.warn('Trips count failed:', e);
      }

      let reviewsCount = 0;
      let photosCount = 0;
      let likesReceived = 0;

      try {
        const recQ = query(collection(db, 'recommendations'), where('userId', '==', uid));
        const recSnap = await getDocs(recQ);

        reviewsCount = recSnap.size;

        recSnap.forEach((d) => {
          const r = d.data();
          const imgs = Array.isArray(r.images) ? r.images : [];
          photosCount += imgs.length;

          const likes = Number(r.likes || 0);
          likesReceived += likes;
        });
      } catch (e) {
        console.warn('Recommendations stats failed:', e);
      }

      const credibilityScore = calculateCredibilityScore({
        recommendationsCount: reviewsCount,
        likesReceived,
      });
      const credibilityLabel = getCredibilityLevelLabel(credibilityScore);

      setStats({
        trips: tripsCount,
        reviews: reviewsCount,
        photos: photosCount,
        likesReceived,
        credibilityScore,
        credibilityLabel,
      });
    } catch (error) {
      console.error('Error fetching profile data:', error);
      setUserData((prev) => ({
        ...prev,
        displayName: user?.displayName || prev.displayName,
        photoURL: user?.photoURL || prev.photoURL,
        email: user?.email || prev.email,
      }));
    } finally {
      setLoading(false);
    }
  }, [uid, userDocRef, user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const resetProfileState = useCallback(() => {
    setUserData(buildDefaultUserData(user));
    setStats(DEFAULT_STATS);
  }, [user]);

  const updateLocalUserData = useCallback((next) => {
    setUserData((prev) => {
      const update = typeof next === 'function' ? next(prev) : next;
      return { ...prev, ...update };
    });
  }, []);

  return {
    userData,
    stats,
    loading,
    refresh,
    resetProfileState,
    setUserData: updateLocalUserData,
    setStats,
  };
}

export default useProfileData;
