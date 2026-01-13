import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../config/firebase';

export function useAdminClaim() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setLoading(true);
      try {
        if (!user) {
          setIsAdmin(false);
          return;
        }
        const token = await user.getIdTokenResult();
        setIsAdmin(!!token?.claims?.admin);
      } catch {
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  return { isAdmin, loading };
}
