import { useFavorites } from './useFavorites';

export function useFavoriteRoadTripIds({ enabled = true } = {}) {
  const result = useFavorites('route', { enabled });
  return {
    ...result,
    ids: result.favorites.map((favorite) => favorite.target.id),
  };
}
