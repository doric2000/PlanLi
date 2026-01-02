import { useState, useMemo } from 'react';

/**
 * Custom hook to handle client-side filtering of recommendations.
 * Supports filtering by destination, category labels, tags, and budget.
 * * @param {Array} recommendations - The raw data from Firestore
 */
export const useRecommendationFilter = (recommendations) => {
  // --- 1. Filter State ---
  const [filters, setFilters] = useState({
    destination: '',
    categories: [], // Array of Hebrew labels (e.g., ["טבע ומסלולים"])
    tags: [],       // Array of Hebrew labels (e.g., ["מפלים", "טיול רגלי"])
    budgets: [],    // Array of strings (e.g., ["₪", "₪₪"])
  });

  // --- 2. Update Handlers ---
  const updateFilters = (newFilters) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  };

  const clearFilters = () => {
    setFilters({
      destination: '',
      categories: [],
      tags: [],
      budgets: [],
    });
  };

  // --- 3. Filtering Engine ---
  // We use useMemo to avoid re-calculating on every render unless data or filters change.
  const filteredData = useMemo(() => {
    if (!recommendations) return [];

    return recommendations.filter((item) => {
      // A. Destination Filter
      if (filters.destination) {
        const search = filters.destination.toLowerCase();
        const inLocation = item.location?.toLowerCase().includes(search);
        const inCountry = item.country?.toLowerCase().includes(search);
        if (!inLocation && !inCountry) return false;
      }

      // B. Category Filter
      if (filters.categories.length > 0) {
        if (!filters.categories.includes(item.category)) return false;
      }

      // C. Tags Filter (The Fix)
      // Logic: Checks if there is an intersection between item tags and filter tags.
      if (filters.tags.length > 0) {
        // Defensive check: ensure item.tags exists and is an array
        if (!item.tags || !Array.isArray(item.tags)) return false;

        // Check if AT LEAST ONE selected tag exists in the item's tags (OR logic)
        const hasMatchingTag = item.tags.some(tag => filters.tags.includes(tag));
        if (!hasMatchingTag) return false;
      }

      // D. Budget Filter
      if (filters.budgets.length > 0) {
        if (!filters.budgets.includes(item.budget)) return false;
      }

      return true;
    });
  }, [recommendations, filters]);

  // Helper boolean to show if any filter is currently active
  const isFiltered = 
    filters.destination !== '' || 
    filters.categories.length > 0 || 
    filters.tags.length > 0 || 
    filters.budgets.length > 0;

  return {
    filteredData,
    filters,
    isFiltered,
    updateFilters,
    clearFilters,
  };
};