import { useEffect, useState } from "react";
import { auth, db } from "../config/firebase";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";

export function useFavoriteCityIds() {
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

    // Query the favorites sub-collection for cities
    const favoritesRef = collection(db, "users", user.uid, "favorites");
    const q = query(
      favoritesRef,
      where("type", "==", "cities"),
      orderBy("created_at", "desc")
    );

    getDocs(q)
      .then((querySnapshot) => {
        const favs = [];
        querySnapshot.forEach((doc) => {
          favs.push({ id: doc.id, ...doc.data() });
        });
        setFavorites(favs);
      })
      .catch((error) => {
        console.error("Error fetching favorite cities:", error);
        setFavorites([]);
      })
      .finally(() => setLoading(false));
  }, [user]);

  return { ids: favorites.map(fav => fav.id), favorites, loading };
}
