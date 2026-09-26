import { useCallback, useRef } from 'react';
import { Alert, Share } from 'react-native';
import { shareUrl } from '../config/publicLinks.generated';

// Cards and detail screens share the same public-content contract. Keep the
// lock synchronous: two taps can arrive before React renders again.
export function useContentShare({ kind, id, title, status }) {
  const pending = useRef(false);

  return useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    try {
      if (status !== 'active' || !['recommendation', 'route'].includes(kind)) {
        throw new Error('Content is unavailable.');
      }
      const url = shareUrl(kind, id);
      const shareTitle = title || (kind === 'route' ? 'מסלול ב־PlanLi' : 'המלצה ב־PlanLi');
      // A dismissed native sheet resolves normally; it is not a sharing failure.
      await Share.share({ title: shareTitle, message: `${shareTitle}\n${url}` });
    } catch {
      Alert.alert('השיתוף לא זמין', 'לא הצלחנו לפתוח את אפשרויות השיתוף כרגע.');
    } finally {
      pending.current = false;
    }
  }, [kind, id, title, status]);
}
