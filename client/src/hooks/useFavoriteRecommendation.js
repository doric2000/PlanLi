import { useState, useEffect, useCallback } from 'react';
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db, auth } from '../config/firebase';

/**
 * useFavoriteRecommendation
 * @param {string} recommendationId
 * @returns { isFavorite, toggleFavorite, loading }
 */
export function useFavoriteRecommendation(recommendationId) {
  const user = auth.currentUser;
  const [isFavorite, setIsFavorite] = useState(false);
  const [loading, setLoading] = useState(false);

  // Check if this recommendation is in user's favorites
  const checkFavorite = useCallback(async () => {
    if (!user || !recommendationId) return;
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        const favs = userDoc.data().favoriteRecommendations || [];
        setIsFavorite(favs.includes(recommendationId));
      }
    } catch (e) {
      // ignore
    }
  }, [user, recommendationId]);

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
          favoriteRecommendations: arrayRemove(recommendationId)
        });
        setIsFavorite(false);
      } else {
        await updateDoc(userDocRef, {
          favoriteRecommendations: arrayUnion(recommendationId)
        });
        setIsFavorite(true);
      }
    } catch (e) {
      // handle error if needed
    } finally {
      setLoading(false);
    }
  };

  return { isFavorite, toggleFavorite, loading };
}
