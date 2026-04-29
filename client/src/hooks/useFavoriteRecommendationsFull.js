import { useEffect, useState, useRef, useCallback } from "react";
import { db } from "../config/firebase";
import { doc, getDoc } from "firebase/firestore";
import { useFavoriteRecommendationIds } from "./useFavoriteRecommendationIds";

/**
 * Fetches full recommendation objects for the user's favorite recommendation IDs.
 * Returns { favorites, loading }
 */
export function useFavoriteRecommendationsFull() {
  const { ids, loading: loadingIds } = useFavoriteRecommendationIds();
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reloadTick, setReloadTick] = useState(0);

  const prevIdsRef = useRef();

  const reload = useCallback(() => {
    prevIdsRef.current = undefined;
    setReloadTick((t) => t + 1);
  }, []);

  useEffect(() => {
    if (loadingIds) {
      setLoading(true);
      return;
    }
    // Only fetch if ids actually changed
    const idsString = (ids || []).join(',');
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
        const ref = doc(db, "recommendations", id);
        const snap = await getDoc(ref);
        return snap.exists() ? { id, ...snap.data() } : null;
      })
    )
      .then((results) => setFavorites(results.filter(Boolean)))
      .finally(() => setLoading(false));
  }, [ids, loadingIds, reloadTick]);

  return { favorites, loading, reload };
}
