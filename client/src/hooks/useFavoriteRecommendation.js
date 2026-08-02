import { useFavorite } from './useFavorite';

/**
 * useFavoriteRecommendation
 * @param {string} recommendationId
 * @returns { isFavorite, toggleFavorite, loading }
 */
export function useFavoriteRecommendation(recommendationId) {
  return useFavorite('recommendation', recommendationId);
}
