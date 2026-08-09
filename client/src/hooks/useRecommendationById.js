import { useCallback, useEffect, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';

import { db } from '../config/firebase';

export function useRecommendationById(id) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState(null);
  const requestSerial = useRef(0);

  const load = useCallback(async ({ keepData = true } = {}) => {
    const serial = ++requestSerial.current;
    if (!id) {
      setData(null);
      setError(null);
      setLoading(false);
      return null;
    }

    if (!keepData) setData(null);
    setLoading(true);
    setError(null);
    try {
      const snapshot = await getDoc(doc(db, 'recommendations', id));
      if (serial !== requestSerial.current) return null;
      const nextData = snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
      setData(nextData);
      return nextData;
    } catch (nextError) {
      if (serial === requestSerial.current) setError(nextError);
      return null;
    } finally {
      if (serial === requestSerial.current) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load({ keepData: false });
    return () => {
      requestSerial.current += 1;
    };
  }, [load]);

  const refresh = useCallback(() => load({ keepData: true }), [load]);
  return { data, loading, error, refresh };
}
