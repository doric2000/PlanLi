import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  clearPersonalizationDiscoveryCache,
  getPersonalizedRecommendations,
} from '../services/PersonalizationService';
import { useBlockedUsers } from '../features/moderation/BlockedUsersContext';
import { useAuthUser } from './useAuthUser';
import { isDiscoveryRateLimitError } from '../utils/discoveryErrors';

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
  }, [principal]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedRequest(discoveryRequest), 350);
    return () => clearTimeout(timer);
  }, [JSON.stringify(discoveryRequest)]);

  const requestKey = JSON.stringify(debouncedRequest);
  const fetchRecommendations = useCallback(async ({ forceRefresh = false, showLoader = true } = {}) => {
    const serial = requestSerial.current + 1;
    requestSerial.current = serial;
    if (showLoader) setLoading(true);
    setError(null);
    try {
      const response = await getPersonalizedRecommendations({
        ...debouncedRequest,
        sort: serverSort(sortBy),
        limit: 30,
      }, { forceRefresh });
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
      setLoading(false);
      setRefreshing(false);
    }
  }, [requestKey, sortBy, isBlocked, principal]);

  useFocusEffect(useCallback(() => {
    fetchRecommendations({ showLoader: data.length === 0 });
  }, [fetchRecommendations]));

  const refresh = useCallback(() => {
    setRefreshing(true);
    return fetchRecommendations({ forceRefresh: true, showLoader: false });
  }, [fetchRecommendations]);
  const removeRecommendation = (id) => {
    requestSerial.current += 1;
    clearPersonalizationDiscoveryCache('recommendations');
    setLoading(false);
    setRefreshing(false);
    setData((previous) => previous.filter((item) => item.id !== id));
  };
  return { data, error, loading, refreshing, refresh, removeRecommendation, setDiscoveryRequest };
};
