import { useEffect } from 'react';

import { AUTH_STATES } from '../../../constants/authPolicy';
import { mergePendingGuestPersonalization } from '../../../services/PersonalizationService';
import { useAuth } from '../../auth/AuthContext';

export default function GuestPersonalizationBridge() {
  const { status, user } = useAuth();

  useEffect(() => {
    if (status !== AUTH_STATES.READY || !user?.uid) return undefined;
    let cancelled = false;
    let retryTimer = null;
    let retryCount = 0;
    const merge = async () => {
      try {
        await mergePendingGuestPersonalization();
      } catch {
        if (cancelled) return;
        const delayMs = Math.min(30_000, 1_000 * (2 ** retryCount));
        retryCount += 1;
        retryTimer = setTimeout(merge, delayMs);
      }
    };
    merge();
    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
    };
  }, [status, user?.uid]);

  return null;
}
