import { useState } from 'react';
import { createEmptyDiscoveryFilters, hasDiscoveryFilters } from '../utils/discoveryFilters';

export const useRecommendationFilter = (recommendations) => {
  const [filters, setFilters] = useState(createEmptyDiscoveryFilters);
  const updateFilters = (newFilters) => setFilters((previous) => ({ ...previous, ...newFilters }));
  const replaceFilters = (newFilters) => setFilters({ ...createEmptyDiscoveryFilters(), ...(newFilters || {}) });
  const clearFilters = () => setFilters(createEmptyDiscoveryFilters());
  return {
    filteredData: Array.isArray(recommendations) ? recommendations : [],
    filters,
    isFiltered: hasDiscoveryFilters(filters),
    updateFilters,
    replaceFilters,
    clearFilters,
  };
};
