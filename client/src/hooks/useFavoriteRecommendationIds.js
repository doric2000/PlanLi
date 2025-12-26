import { useEffect, useState } from "react";
import { auth, db } from "../config/firebase";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore"; // Added onSnapshot

export function useFavoriteRecommendationIds() {
  const user = auth.currentUser;
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setFavorites([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const favoritesRef = collection(db, "users", user.uid, "favorites");
    const q = query(
      favoritesRef,
      where("type", "==", "recommendations"),
      orderBy("created_at", "desc")
    );

    // CHANGE HERE: onSnapshot instead of getDocs
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const favs = [];
      querySnapshot.forEach((doc) => {
        favs.push({ id: doc.id, ...doc.data() });
      });
      setFavorites(favs);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching favorite recommendations:", error);
      setFavorites([]);
      setLoading(false);
    });

    return () => unsubscribe();
    
  }, [user]);

  return { ids: favorites.map(fav => fav.id), favorites, loading };
}