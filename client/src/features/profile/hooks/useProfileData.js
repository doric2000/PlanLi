import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';

import { auth, db } from '../../../config/firebase';
import { primeUserDataCache } from '../../../hooks/useUserData';
import { calculateCredibilityScore, getCredibilityLevelLabel } from '../utils/credibility';

const DEFAULT_STATS = {
  trips: 0,
  reviews: 0,
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

const fetchTripsCount = async (uid) => {
  try {
    const tripsQ = query(collection(db, 'routes'), where('userId', '==', uid));
    const tripsAgg = await getCountFromServer(tripsQ);
    return tripsAgg.data().count || 0;
  } catch (error) {
    console.warn('Trips count failed:', error);
    return 0;
  }
};

const fetchRecommendationStats = async (uid) => {
  try {
    const recQ = query(collection(db, 'recommendations'), where('userId', '==', uid));
    const recSnap = await getDocs(recQ);

    let likesReceived = 0;
    recSnap.forEach((recommendationDoc) => {
      likesReceived += Number(recommendationDoc.data().likes || 0);
    });

    return {
      reviews: recSnap.size,
      likesReceived,
    };
  } catch (error) {
    console.warn('Recommendations stats failed:', error);
    return {
      reviews: 0,
      likesReceived: 0,
    };
  }
};

const fetchProfileStats = async (uid) => {
  const [trips, recommendationStats] = await Promise.all([
    fetchTripsCount(uid),
    fetchRecommendationStats(uid),
  ]);

  const credibilityScore = calculateCredibilityScore({
    recommendationsCount: recommendationStats.reviews,
    likesReceived: recommendationStats.likesReceived,
  });

  return {
    trips,
    reviews: recommendationStats.reviews,
    likesReceived: recommendationStats.likesReceived,
    credibilityScore,
    credibilityLabel: getCredibilityLevelLabel(credibilityScore),
  };
};

export function useProfileData({ uid, user }) {
  const isOwnProfile = Boolean(uid && auth.currentUser?.uid === uid);
  const userDisplayName = isOwnProfile ? user?.displayName : null;
  const userPhotoURL = isOwnProfile ? user?.photoURL : null;
  const userEmail = isOwnProfile ? user?.email : '';
  const initialUserData = useMemo(
    () => buildDefaultUserData({ email: userEmail }),
    [userEmail]
  );
  const [userData, setUserData] = useState(initialUserData);
  const [stats, setStats] = useState(DEFAULT_STATS);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const userDataRef = useRef(initialUserData);
  const refreshSequenceRef = useRef(0);

  const userDocRef = useMemo(
    () =>
      uid
        ? doc(db, isOwnProfile ? 'users' : 'publicProfiles', uid)
        : null,
    [uid, isOwnProfile]
  );

  useEffect(() => {
    userDataRef.current = userData;
  }, [userData]);

  const refresh = useCallback(async (isSilent = false) => {
    const refreshSequence = refreshSequenceRef.current + 1;
    refreshSequenceRef.current = refreshSequence;

    if (!uid || !userDocRef) {
      const fallbackUserData = buildDefaultUserData({ email: userEmail });
      userDataRef.current = fallbackUserData;
      setUserData(fallbackUserData);
      setStats(DEFAULT_STATS);
      setLoading(false);
      setStatsLoading(false);
      return;
    }

    if (!isSilent) {
      setLoading(true);
    }
    setStatsLoading(true);

    // Start the independent aggregate requests immediately. Identity can render
    // as soon as its single document resolves, without waiting for these stats.
    const statsPromise = fetchProfileStats(uid);
    let resolvedUserData;

    try {
      const userDoc = await getDoc(userDocRef);
      const data = userDoc.exists() ? userDoc.data() : null;

      resolvedUserData = {
        displayName:
          data?.displayName || data?.fullName || userDisplayName || 'Traveler',
        photoURL: data?.photoURL || userPhotoURL || null,
        email: isOwnProfile ? data?.email || userEmail || '' : '',
        isExpert: Boolean(data?.isExpert),
        smartProfile: data?.smartProfile || null,
      };
    } catch (error) {
      console.error('Error fetching profile data:', error);
      const previousUserData = userDataRef.current;
      resolvedUserData = {
        ...previousUserData,
        displayName: userDisplayName || previousUserData.displayName,
        photoURL: userPhotoURL || previousUserData.photoURL,
        email: isOwnProfile ? userEmail || previousUserData.email : '',
      };
    }

    if (refreshSequenceRef.current === refreshSequence) {
      userDataRef.current = resolvedUserData;
      setUserData(resolvedUserData);
      primeUserDataCache(uid, resolvedUserData);
      setLoading(false);
    }

    try {
      const nextStats = await statsPromise;
      if (refreshSequenceRef.current === refreshSequence) {
        setStats(nextStats);
      }
    } catch (error) {
      console.error('Error fetching profile stats:', error);
    } finally {
      if (refreshSequenceRef.current === refreshSequence) {
        setStatsLoading(false);
      }
    }
  }, [uid, userDocRef, userDisplayName, userPhotoURL, userEmail, isOwnProfile]);

  useEffect(() => {
    refresh();

    return () => {
      refreshSequenceRef.current += 1;
    };
  }, [refresh]);

  const resetProfileState = useCallback(() => {
    const fallbackUserData = buildDefaultUserData({ email: userEmail });
    userDataRef.current = fallbackUserData;
    setUserData(fallbackUserData);
    setStats(DEFAULT_STATS);
  }, [userEmail]);

  const updateLocalUserData = useCallback((next) => {
    const previousUserData = userDataRef.current;
    const update = typeof next === 'function' ? next(previousUserData) : next;
    const mergedUserData = { ...previousUserData, ...update };

    userDataRef.current = mergedUserData;
    setUserData(mergedUserData);

    if (uid) {
      primeUserDataCache(uid, mergedUserData);
    }
  }, [uid]);

  return {
    userData,
    stats,
    loading,
    statsLoading,
    refresh,
    resetProfileState,
    setUserData: updateLocalUserData,
    setStats,
  };
}

export default useProfileData;
