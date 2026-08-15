import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { getPersonalizedRecommendations } from '../services/PersonalizationService';
import { useBlockedUsers } from '../features/moderation/BlockedUsersContext';

const serverSort = (sortBy) => sortBy === 'personalized'
  ? 'forYou'
  : sortBy === 'newest' ? 'newest' : 'popular';

export const useRecommendations = (sortBy = 'popularity') => {
  const { isBlocked } = useBlockedUsers();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [discoveryRequest, setDiscoveryRequest] = useState({});
  const [debouncedRequest, setDebouncedRequest] = useState({});
  const requestSerial = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedRequest(discoveryRequest), 350);
    return () => clearTimeout(timer);
  }, [JSON.stringify(discoveryRequest)]);

  const requestKey = JSON.stringify(debouncedRequest);
  const fetchRecommendations = useCallback(async ({ showLoader = true } = {}) => {
    const serial = requestSerial.current + 1;
    requestSerial.current = serial;
    if (showLoader) setLoading(true);
    setError(null);
    try {
      const response = await getPersonalizedRecommendations({
        ...debouncedRequest,
        sort: serverSort(sortBy),
        limit: 30,
      });
      if (requestSerial.current !== serial) return;
      setData(Array.isArray(response?.items) ? response.items.filter((item) => !isBlocked(item.ownerId)) : []);
    } catch (error) {
      if (requestSerial.current !== serial) return;
      console.error('Error fetching recommendations:', error);
      setData([]);
      setError(error);
    } finally {
      if (requestSerial.current !== serial) return;
      setLoading(false);
      setRefreshing(false);
    }
  }, [requestKey, sortBy, isBlocked]);

  useFocusEffect(useCallback(() => {
    fetchRecommendations({ showLoader: data.length === 0 });
  }, [fetchRecommendations]));

  const refresh = () => {
    setRefreshing(true);
    fetchRecommendations({ showLoader: false });
  };
  const removeRecommendation = (id) => setData((previous) => previous.filter((item) => item.id !== id));
  return { data, error, loading, refreshing, refresh, removeRecommendation, setDiscoveryRequest };
};
