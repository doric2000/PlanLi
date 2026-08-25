import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  clearPersonalizationDiscoveryCache,
  requestPersonalizedRecommendations,
} from '../services/PersonalizationService';
import { useBlockedUsers } from '../features/moderation/BlockedUsersContext';
import { useAuthUser } from './useAuthUser';
import { isDiscoveryRateLimitError } from '../utils/discoveryErrors';
import { waitForRefreshConfirmation } from '../utils/refreshFeedback';
import { invalidateProfileResources } from '../utils/profileResourceInvalidation';

const serverSort = (sortBy) => sortBy === 'personalized'
  ? 'forYou'
  : sortBy === 'newest' ? 'newest' : 'popular';

export const useRecommendations = (sortBy = 'popularity') => {
  const { isBlocked } = useBlockedUsers();
  const { user } = useAuthUser();
  const principal = user?.uid || 'guest';
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [requesting, setRequesting] = useState(true);
  const [settledRequestIdentity, setSettledRequestIdentity] = useState('');
  const [error, setError] = useState(null);
  const [discoveryRequest, setDiscoveryRequest] = useState({});
  const [debouncedRequest, setDebouncedRequest] = useState({});
  const requestSerial = useRef(0);

  useEffect(() => {
    requestSerial.current += 1;
    setData([]);
    setError(null);
    setLoading(true);
    setRefreshing(false);
    setConfirming(false);
    setRequesting(true);
    setSettledRequestIdentity('');
  }, [principal]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedRequest(discoveryRequest), 350);
    return () => clearTimeout(timer);
  }, [JSON.stringify(discoveryRequest)]);

  const requestKey = JSON.stringify(debouncedRequest);
  const discoveryRequestKey = JSON.stringify(discoveryRequest);
  const requestIdentity = JSON.stringify([principal, sortBy, requestKey]);
  const fetchRecommendations = useCallback(async ({ showLoader = true, refreshFeedback = false } = {}) => {
    const serial = requestSerial.current + 1;
    requestSerial.current = serial;
    const requestedIdentity = requestIdentity;
    setRequesting(true);
    if (showLoader) setLoading(true);
    setError(null);
    try {
      const attempt = requestPersonalizedRecommendations({
        ...debouncedRequest,
        sort: serverSort(sortBy),
        limit: 30,
      });
      if (refreshFeedback) {
        const networkPending = attempt.requested || attempt.source === 'in-flight';
        setRefreshing(networkPending);
        setConfirming(!networkPending);
      }
      const response = await attempt.promise;
      if (refreshFeedback && !attempt.requested && attempt.source !== 'in-flight') {
        await waitForRefreshConfirmation();
      }
      if (requestSerial.current !== serial) return;
      setData(Array.isArray(response?.items) ? response.items.filter((item) => !isBlocked(item.ownerId)) : []);
    } catch (error) {
      if (requestSerial.current !== serial) return;
      if (isDiscoveryRateLimitError(error)) {
        console.info('discovery_request_throttled', { surface: 'recommendations' });
      } else {
        console.error('Error fetching recommendations:', error);
      }
      setError(error);
    } finally {
      if (requestSerial.current !== serial) return;
      setSettledRequestIdentity(requestedIdentity);
      setRequesting(false);
      setLoading(false);
      setRefreshing(false);
      setConfirming(false);
    }
  }, [requestIdentity, requestKey, sortBy, isBlocked, principal]);

  useFocusEffect(useCallback(() => {
    fetchRecommendations({ showLoader: data.length === 0 });
  }, [fetchRecommendations]));

  const refresh = useCallback(() => {
    return fetchRecommendations({ showLoader: false, refreshFeedback: true });
  }, [fetchRecommendations]);
  const removeRecommendation = (id) => {
    requestSerial.current += 1;
    clearPersonalizationDiscoveryCache('recommendations');
    if (user?.uid) invalidateProfileResources(user.uid);
    setLoading(false);
    setRefreshing(false);
    setConfirming(false);
    setRequesting(false);
    setSettledRequestIdentity(requestIdentity);
    setData((previous) => previous.filter((item) => item.id !== id));
  };
  const requestSettled = !requesting
    && discoveryRequestKey === requestKey
    && settledRequestIdentity === requestIdentity;
  return {
    data,
    error,
    loading,
    refreshing,
    confirming,
    requestSettled,
    refresh,
    removeRecommendation,
    setDiscoveryRequest,
  };
};
