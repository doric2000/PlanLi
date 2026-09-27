import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuthUser } from '../../../hooks/useAuthUser';
import { useBlockedUsers } from '../../moderation/BlockedUsersContext';
import { usePersonalizationFeedback } from '../../profile/context/PersonalizationFeedbackContext';
import { clearPersonalizationDiscoveryCache, requestPersonalizedRecommendations, requestPersonalizedRoutes, requestPersonalizedMapRecommendations } from '../../../services/PersonalizationService';
import { discoveryRequestFromFilters } from '../../../utils/discoveryFilters';

const loaders = { recommendations: requestPersonalizedRecommendations, routes: requestPersonalizedRoutes, map: requestPersonalizedMapRecommendations };

// Each surface owns its results and errors. City context is deliberately fixed:
// a global region or a destination accidentally left in filters cannot move it.
export function useCityDiscovery({ cityId, countryId, kind = 'recommendations', filters, viewport, enabled = true }) {
  const { user } = useAuthUser();
  const { isBlocked } = useBlockedUsers();
  const { isHidden } = usePersonalizationFeedback();
  const principal = user?.uid || 'guest';
  const payloadKey = JSON.stringify({
    ...discoveryRequestFromFilters(filters, { surface: kind === 'routes' ? 'routes' : 'recommendations' }),
    destinations: [], context: { cityId, countryId }, sort: 'popular',
    ...(kind === 'map' ? { viewport } : { limit: 30 }),
  });
  const identity = `${principal}:${kind}:${payloadKey}`;
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const serial = useRef(0);
  const [attempt, setAttempt] = useState(0);
  const retryRequested = useRef(false);
  const [state, setState] = useState({ identity: '', items: [], loading: true, error: null });
  const available = enabled && !!cityId && !!countryId && (kind !== 'map' || !!viewport);

  useEffect(() => {
    const request = ++serial.current;
    if (!available) return undefined;
    let cancelled = false;
    const retry = retryRequested.current;
    retryRequested.current = false;
    const timer = setTimeout(async () => {
      setState({ identity, items: [], loading: true, error: null });
      try {
        const payload = JSON.parse(payloadKey);
        const result = loaders[kind](payload, { forceRefresh: retry });
        const response = await result.promise;
        if (cancelled || serial.current !== request || currentIdentity.current !== identity) return;
        setState({ identity, items: Array.isArray(response?.items) ? response.items : [], loading: false, error: null,
          truncated: !!response?.truncated, zoomInRequired: !!response?.zoomInRequired });
      } catch {
        if (cancelled || serial.current !== request || currentIdentity.current !== identity) return;
        setState({ identity, items: [], loading: false, error: 'לא הצלחנו לטעון כרגע. אפשר לנסות שוב.' });
      }
    }, retry ? 0 : 300);
    return () => { cancelled = true; clearTimeout(timer); serial.current += 1; };
  }, [available, identity, payloadKey, kind, attempt]);

  const items = useMemo(() => state.identity !== identity || !available ? [] : state.items.filter((item) =>
    item?.id && (!item.status || item.status === 'active') && !isBlocked(item.ownerId)
      && !isHidden({ type: kind === 'routes' ? 'route' : 'recommendation', id: item.id })
  ), [state, identity, available, isBlocked, isHidden, kind]);
  const retry = useCallback(() => {
    clearPersonalizationDiscoveryCache(kind);
    retryRequested.current = true;
    setAttempt((value) => value + 1);
  }, [kind]);
  const removeItem = useCallback((id) => setState((previous) => ({ ...previous, items: previous.items.filter((item) => item.id !== id) })), []);
  return { items, loading: available && (state.identity !== identity || state.loading),
    error: state.identity === identity ? state.error : null,
    truncated: state.identity === identity && state.truncated,
    zoomInRequired: state.identity === identity && state.zoomInRequired, retry, removeItem };
}
