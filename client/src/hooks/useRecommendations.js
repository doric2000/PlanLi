import { useState, useCallback } from 'react';
import { collection, getDocs, limit, query, orderBy, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useFocusEffect } from '@react-navigation/native';
import { getPersonalizedRecommendations } from '../services/PersonalizationService';

/**
 * Custom hook to fetch and manage recommendations data.
 * Supports sorting by 'popularity' (likes) or 'newest' (date).
 * * @param {string} sortBy - Sort criteria: 'popularity' | 'newest'
 */
export const useRecommendations = (sortBy = 'popularity') => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [personalizationFilters, setPersonalizationFilters] = useState({});
  const personalizationFilterKey = JSON.stringify(personalizationFilters);

  const fetchRecommendations = async ({ showLoader = true } = {}) => {
    if (showLoader) setLoading(true);
    try {
      if (sortBy === 'personalized') {
        const response = await getPersonalizedRecommendations({
          filters: personalizationFilters,
          limit: 30,
        });
        setData(Array.isArray(response?.items) ? response.items : []);
        return;
      }
      // Determine the field to sort by
      const sortField = sortBy === 'newest' ? 'createdAt' : 'stats.likeCount';
      
      const q = query(
        collection(db, 'recommendations'),
        where('status', '==', 'active'),
        orderBy(sortField, 'desc'),
        limit(30)
      );
      
      const querySnapshot = await getDocs(q);
      const recs = [];
      querySnapshot.forEach((doc) => {
        recs.push({ id: doc.id, ...doc.data() });
      });
      
      setData(recs);
    } catch (error) {
      console.error("Error fetching recommendations: ", error);
      if (sortBy === 'personalized') {
        try {
          const fallback = query(
            collection(db, 'recommendations'),
            where('status', '==', 'active'),
            orderBy('stats.likeCount', 'desc'),
            limit(30)
          );
          const snapshot = await getDocs(fallback);
          setData(snapshot.docs.map((document) => ({ id: document.id, ...document.data() })));
        } catch (fallbackError) {
          console.error('Personalized fallback failed: ', fallbackError);
        }
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Re-fetch when screen focuses or when 'sortBy' changes
  useFocusEffect(
    useCallback(() => {
      fetchRecommendations({ showLoader: false });
    }, [sortBy, personalizationFilterKey])
  );

  const refresh = () => {
    setRefreshing(true);
    fetchRecommendations({ showLoader: false });
  };

  const removeRecommendation = (id) => {
    setData((prev) => prev.filter((item) => item.id !== id));
  };

  return { 
    data, 
    loading, 
    refreshing, 
    refresh, 
    removeRecommendation,
    setPersonalizationFilters,
  };
};
