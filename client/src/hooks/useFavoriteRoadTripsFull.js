import { useEffect, useRef, useState } from "react";
import { db } from "../config/firebase";
import { doc, getDoc } from "firebase/firestore";
import { useFavoriteRoadTripIds } from "./useFavoriteRoadTripIds";

/**
 * Fetches full route objects for the user's favorite route IDs.
 * Returns { favorites, loading }
 */
export function useFavoriteRoadTripsFull() {
  const { ids, loading: loadingIds } = useFavoriteRoadTripIds();
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const prevIdsRef = useRef();

  useEffect(() => {
    if (loadingIds) {
      setLoading(true);
      return;
    }

    const idsString = (ids || []).join(",");
    if (prevIdsRef.current === idsString) {
      setLoading(false);
      return;
    }
    prevIdsRef.current = idsString;

    if (!ids || ids.length === 0) {
      setFavorites([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    Promise.all(
      ids.map(async (id) => {
        const ref = doc(db, "routes", id);
        const snap = await getDoc(ref);
        return snap.exists() ? { id, ...snap.data() } : null;
      })
    )
      .then((results) => setFavorites(results.filter(Boolean)))
      .finally(() => setLoading(false));
  }, [ids, loadingIds]);

  return { favorites, loading };
}
