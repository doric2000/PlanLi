import { useCallback, useEffect, useState } from 'react';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';

import { db } from '../../../config/firebase';

export async function getProfileContentSnapshot(collectionName, uid) {
  try {
    return await getDocs(
      query(
        collection(db, collectionName),
        where('ownerId', '==', uid),
        where('status', '==', 'active'),
        orderBy('createdAt', 'desc'),
        limit(30)
      )
    );
  } catch (error) {
    console.log(`Ordered ${collectionName} query failed, fallback:`, error?.message);
    return getDocs(
      query(
        collection(db, collectionName),
        where('ownerId', '==', uid),
        where('status', '==', 'active'),
        limit(30)
      )
    );
  }
}

export function useProfileContent({ uid }) {
  const [recommendations, setRecommendations] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(Boolean(uid));

  const refresh = useCallback(async (isSilent = false) => {
    if (!uid) {
      setRecommendations([]);
      setRoutes([]);
      setLoading(false);
      return;
    }
    if (!isSilent) setLoading(true);

    try {
      const [recommendationSnapshot, routeSnapshot] = await Promise.all([
        getProfileContentSnapshot('recommendations', uid),
        getProfileContentSnapshot('routes', uid),
      ]);
      setRecommendations(recommendationSnapshot.docs.map((document) => ({
        id: document.id,
        ...document.data(),
      })));
      setRoutes(routeSnapshot.docs.map((document) => ({
        id: document.id,
        ...document.data(),
      })));
    } catch (error) {
      console.log('loadProfileContent error:', error?.message || error);
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    recommendations,
    routes,
    loading,
    refresh,
  };
}

export default useProfileContent;
