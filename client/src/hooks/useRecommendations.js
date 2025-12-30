import { useState, useCallback } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useFocusEffect } from '@react-navigation/native';

/**
 * Custom hook to fetch and manage recommendations data.
 * Supports sorting by 'popularity' (likes) or 'newest' (date).
 * * @param {string} sortBy - Sort criteria: 'popularity' | 'newest'
 */
export const useRecommendations = (sortBy = 'popularity') => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchRecommendations = async () => {
    // Show loading indicator only on initial load or sort change, not on refresh
    if (!refreshing) setLoading(true);

    try {
      // Determine the field to sort by
      const sortField = sortBy === 'newest' ? 'createdAt' : 'likes';
      
      const q = query(
        collection(db, 'recommendations'),
        orderBy(sortField, 'desc') // Always descending (Highest likes / Newest date)
      );
      
      const querySnapshot = await getDocs(q);
      const recs = [];
      querySnapshot.forEach((doc) => {
        recs.push({ id: doc.id, ...doc.data() });
      });
      
      setData(recs);
    } catch (error) {
      console.error("Error fetching recommendations: ", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Re-fetch when screen focuses or when 'sortBy' changes
  useFocusEffect(
    useCallback(() => {
      fetchRecommendations();
    }, [sortBy])
  );

  const refresh = () => {
    setRefreshing(true);
    fetchRecommendations();
  };

  const removeRecommendation = (id) => {
    setData((prev) => prev.filter((item) => item.id !== id));
  };

  return { 
    data, 
    loading, 
    refreshing, 
    refresh, 
    removeRecommendation 
  };
};