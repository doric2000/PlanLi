import { useState, useEffect, useCallback } from 'react';
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db, auth } from '../config/firebase';

/**
 * useFavorite - Generic hook for favoriting different types of items
 * @param {string} type - Type of item ('recommendations', 'routes', 'cities', etc.)
 * @param {string} id - ID of the item to favorite
 * @returns { isFavorite, toggleFavorite, loading }
 */
export function useFavorite(type, id) {
  const user = auth.currentUser;
  const [isFavorite, setIsFavorite] = useState(false);
  const [loading, setLoading] = useState(false);

  // Get the field name based on type
  const getFieldName = (type) => {
    switch (type) {
      case 'recommendations':
        return 'favoriteRecommendations';
      case 'routes':
        return 'favoriteRoutes';
      case 'cities':
        return 'favoriteCities';
      default:
        return `favorite${type.charAt(0).toUpperCase() + type.slice(1)}`;
    }
  };

  const fieldName = getFieldName(type);

  // Check if this item is in user's favorites
  const checkFavorite = useCallback(async () => {
    if (!user || !id) return;
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        const favs = userDoc.data()[fieldName] || [];
        setIsFavorite(favs.includes(id));
      }
    } catch (e) {
      // ignore
    }
  }, [user, id, fieldName]);

  useEffect(() => {
    checkFavorite();
  }, [checkFavorite]);

  // Toggle favorite status
  const toggleFavorite = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const userDocRef = doc(db, 'users', user.uid);
      if (isFavorite) {
        await updateDoc(userDocRef, {
          [fieldName]: arrayRemove(id)
        });
        setIsFavorite(false);
      } else {
        await updateDoc(userDocRef, {
          [fieldName]: arrayUnion(id)
        });
        setIsFavorite(true);
      }
    } catch (e) {
      console.error('Error toggling favorite:', e);
    } finally {
      setLoading(false);
    }
  };

  return { isFavorite, toggleFavorite, loading };
}