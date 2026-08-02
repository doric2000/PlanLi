import { useEffect, useState } from 'react';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { primeUserDataCache } from './useUserData';

export function useFavorites(type, { enabled = true, pageSize = 50 } = {}) {
  const user = auth.currentUser;
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled || !user) {
      setFavorites([]);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const favoritesQuery = query(
      collection(db, 'users', user.uid, 'favorites'),
      where('type', '==', type),
      orderBy('createdAt', 'desc'),
      limit(pageSize)
    );
    return onSnapshot(
      favoritesQuery,
      (snapshot) => {
        const next = snapshot.docs.map((entry) => {
          const data = entry.data();
          const owner = data?.preview?.owner;
          if (owner?.id) {
            primeUserDataCache(owner.id, {
              displayName: owner.displayName,
              photoURL: owner.photoURL,
            });
          }
          return {
            favoriteKey: entry.id,
            ...data,
            id: data?.target?.id,
          };
        });
        setFavorites(next);
        setLoading(false);
      },
      (error) => {
        console.error(`Error fetching ${type} favorites:`, error);
        setFavorites([]);
        setLoading(false);
      }
    );
  }, [enabled, pageSize, type, user]);

  return { favorites, loading };
}

export default useFavorites;

