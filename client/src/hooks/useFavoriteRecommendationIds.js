import { useEffect, useState } from "react";
import { auth, db } from "../config/firebase";
import { doc, getDoc } from "firebase/firestore";

export function useFavoriteRecommendationIds() {
  const user = auth.currentUser;
  const [ids, setIds] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setIds([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    getDoc(doc(db, "users", user.uid))
      .then((userDoc) => {
        if (userDoc.exists()) {
          setIds(userDoc.data().favoriteRecommendations || []);
        } else {
          setIds([]);
        }
      })
      .finally(() => setLoading(false));
  }, [user]);

  return { ids, loading };
}
