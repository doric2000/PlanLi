import { useCallback, useEffect, useRef, useState } from 'react';
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
import { REQUEST_RETRY_MS } from '../utils/requestCoordinator';

export function useFavorites(type, { enabled = true, pageSize = 50 } = {}) {
  const user = auth?.currentUser;
  const userId = user?.uid || null;
  const [favorites, setFavorites] = useState([]);
  const [favoritesOwnerId, setFavoritesOwnerId] = useState(userId);
  const [loading, setLoading] = useState(enabled);
  const [status, setStatus] = useState(enabled ? 'connecting' : 'idle');
  const [error, setError] = useState(null);
  const [lastServerSyncAt, setLastServerSyncAt] = useState(0);
  const [subscriptionVersion, setSubscriptionVersion] = useState(0);
  const retryAfterRef = useRef(0);
  const retryPromiseRef = useRef(null);

  useEffect(() => {
    setFavorites((current) => (favoritesOwnerId === userId ? current : []));
    setFavoritesOwnerId(userId);
    setLastServerSyncAt((current) => (favoritesOwnerId === userId ? current : 0));
    if (favoritesOwnerId !== userId) {
      setError(null);
      retryAfterRef.current = 0;
      retryPromiseRef.current?.resolve?.();
      retryPromiseRef.current = null;
    }
  }, [favoritesOwnerId, userId]);

  useEffect(() => {
    if (!enabled || !userId) {
      setLoading(false);
      setStatus('idle');
      return undefined;
    }
    setLoading(true);
    setStatus('connecting');
    setError(null);
    const favoritesQuery = query(
      collection(db, 'users', userId, 'favorites'),
      where('type', '==', type),
      orderBy('createdAt', 'desc'),
      limit(pageSize)
    );
    return onSnapshot(
      favoritesQuery,
      { includeMetadataChanges: true },
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
        setFavoritesOwnerId(userId);
        setLoading(false);
        setError(null);
        if (snapshot.metadata?.fromCache === false || snapshot.metadata == null) {
          setLastServerSyncAt(Date.now());
          setStatus('live');
        }
        retryPromiseRef.current?.resolve?.();
        retryPromiseRef.current = null;
      },
      (error) => {
        console.error(`Error fetching ${type} favorites:`, error);
        setLoading(false);
        setError(error);
        setStatus('error');
        retryPromiseRef.current?.reject?.(error);
        retryPromiseRef.current = null;
      }
    );
  }, [enabled, pageSize, type, userId, subscriptionVersion]);

  const reload = useCallback(() => {
    if (!enabled || !userId || status === 'live') {
      return { requested: false, source: status === 'live' ? 'live' : 'idle', promise: Promise.resolve() };
    }
    const now = Date.now();
    if (retryPromiseRef.current) {
      return { requested: false, source: 'in-flight', promise: retryPromiseRef.current.promise };
    }
    if (status !== 'error' || retryAfterRef.current > now) {
      return { requested: false, source: 'backoff', promise: Promise.resolve() };
    }
    retryAfterRef.current = now + REQUEST_RETRY_MS;
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    retryPromiseRef.current = { promise, resolve, reject };
    setSubscriptionVersion((current) => current + 1);
    return { requested: true, source: 'network', promise };
  }, [enabled, status, userId]);

  return {
    favorites: favoritesOwnerId === userId ? favorites : [],
    loading,
    status,
    error,
    lastServerSyncAt,
    reload,
  };
}

export default useFavorites;

