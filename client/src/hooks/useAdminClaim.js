import { useEffect, useState } from 'react';
import { multiFactor, onIdTokenChanged } from 'firebase/auth';
import { auth } from '../config/firebase';

export function useAdminClaim() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [hasTotpEnrollment, setHasTotpEnrollment] = useState(false);
  const [signedInWithTotp, setSignedInWithTotp] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onIdTokenChanged(auth, async (user) => {
      setLoading(true);
      try {
        if (!user) {
          setIsAdmin(false);
          setHasTotpEnrollment(false);
          setSignedInWithTotp(false);
          return;
        }
        const token = await user.getIdTokenResult();
        setIsAdmin(!!token?.claims?.admin);
        setHasTotpEnrollment(
          multiFactor(user).enrolledFactors.some((factor) => factor?.factorId === 'totp')
        );
        setSignedInWithTotp(token?.claims?.firebase?.sign_in_second_factor === 'totp');
      } catch {
        setIsAdmin(false);
        setHasTotpEnrollment(false);
        setSignedInWithTotp(false);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  return { isAdmin, hasTotpEnrollment, signedInWithTotp, loading };
}
