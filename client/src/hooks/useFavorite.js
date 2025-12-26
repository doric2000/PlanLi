import { useState, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../config/firebase';

/**
 * useFavorite - Generic hook for favoriting different types of items using sub-collections
 * @param {string} type - Type of item ('recommendations', 'routes', 'cities', etc.)
 * @param {string} id - ID of the item to favorite
 * @param {Object} snapshotData - Optional snapshot data (name, thumbnail_url, sub_text, rating)
 * @returns { isFavorite, toggleFavorite, loading }
 */
export function useFavorite(type, id, snapshotData = {}) {
  const user = auth.currentUser;
  const [isFavorite, setIsFavorite] = useState(false);
  const [loading, setLoading] = useState(false);

  // Check if this item is in user's favorites (subcollection for all types)
  const checkFavorite = useCallback(async () => {
    if (!user || !id) return;
    try {
      const favoriteDoc = await getDoc(doc(db, 'users', user.uid, 'favorites', id));
      setIsFavorite(favoriteDoc.exists());
    } catch (e) {
      console.error('Error checking favorite status:', e);
      setIsFavorite(false);
    }
  }, [user, id]);

  useEffect(() => {
    checkFavorite();
  }, [checkFavorite]);

  // Toggle favorite status
  const toggleFavorite = async () => {
    console.log('[FavoriteButton] toggleFavorite called:', { type, id, user, snapshotData });
    if (!user) {
      console.warn('No authenticated user!');
      Alert && Alert.alert && Alert.alert('Error', 'You must be logged in to favorite.');
      return;
    }
    if (!id) {
      console.warn('No item ID provided!');
      Alert && Alert.alert && Alert.alert('Error', 'No item ID provided.');
      return;
    }
    setLoading(true);
    try {
      const favoriteDocRef = doc(db, 'users', user.uid, 'favorites', id);
      if (isFavorite) {
        await deleteDoc(favoriteDocRef);
        setIsFavorite(false);
        console.log('[FavoriteButton] Removed from favorites:', id);
      } else {
        // Remove undefined fields from snapshotData
        const cleanSnapshotData = Object.fromEntries(
          Object.entries(snapshotData).filter(([_, v]) => v !== undefined)
        );
        const favoriteData = {
          id,
          type,
          created_at: serverTimestamp(),
          ...cleanSnapshotData
        };
        await setDoc(favoriteDocRef, favoriteData);
        setIsFavorite(true);
        console.log('[FavoriteButton] Added to favorites:', favoriteData);
      }
    } catch (e) {
      console.error('Error toggling favorite:', e);
      Alert.alert('Error', e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  return { isFavorite, toggleFavorite, loading };
}