import { useEffect, useState } from "react";
import { auth, db } from "../config/firebase";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore"; // Added onSnapshot

export function useFavoriteCityIds() {
  const user = auth.currentUser;
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // If no user, reset and stop loading
    if (!user) {
      setFavorites([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    // Reference the collection
    const favoritesRef = collection(db, "users", user.uid, "favorites");
    
    // Create the query
    const q = query(
      favoritesRef,
      where("type", "==", "cities"),
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
      console.error("Error fetching favorite cities:", error);
      setFavorites([]);
      setLoading(false);
    });

    // Cleanup: This function runs when the component unmounts to stop listening
    return () => unsubscribe();

  }, [user]);

  return { ids: favorites.map(fav => fav.id), favorites, loading };
}