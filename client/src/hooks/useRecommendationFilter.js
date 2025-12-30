import { useState, useMemo } from 'react';

/**
 * Hook to manage filtering logic for recommendations.
 * @param {Array} rawData - The complete list of recommendations
 */
export const useRecommendationFilter = (rawData) => {
  const [filters, setFilters] = useState({
    categories: [],
    budgets: [],
    destination: '',
  });

  const filteredData = useMemo(() => {
    return rawData.filter((item) => {
      // 1. Destination / Text Search
      const queries = filters.destination
        .split(',')
        .map((q) => q.trim().toLowerCase())
        .filter((q) => q.length > 0);

      if (queries.length > 0) {
        const title = (item.title || '').toLowerCase();
        const location = (item.location || '').toLowerCase();
        const description = (item.description || '').toLowerCase();
        const city = (item.city || '').toLowerCase();
        const country = (item.country || '').toLowerCase();

        const text = `${title} ${location} ${description} ${city} ${country}`;
        const matchesText = queries.some((q) => text.includes(q));
        if (!matchesText) return false;
      }

      // 2. Categories
      if (filters.categories.length > 0 && !filters.categories.includes(item.category)) {
        return false;
      }

      // 3. Budgets
      if (filters.budgets.length > 0 && !filters.budgets.includes(item.budget)) {
        return false;
      }

      return true;
    });
  }, [rawData, filters]);

  const isFiltered = 
    filters.destination !== '' || 
    filters.categories.length > 0 || 
    filters.budgets.length > 0;

  const clearFilters = () => {
    setFilters({ categories: [], budgets: [], destination: '' });
  };

  const updateFilters = (newFilters) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  };

  return {
    filteredData,
    filters,
    isFiltered,
    updateFilters,
    clearFilters
  };
};