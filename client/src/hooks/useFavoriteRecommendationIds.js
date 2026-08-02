import { useFavorites } from './useFavorites';

export function useFavoriteRecommendationIds({ enabled = true } = {}) {
  const result = useFavorites('recommendation', { enabled });
  return {
    ...result,
    ids: result.favorites.map((favorite) => favorite.target.id),
  };
}
