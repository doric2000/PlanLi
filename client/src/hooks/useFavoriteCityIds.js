import { useFavorites } from './useFavorites';

export function useFavoriteCityIds({ enabled = true } = {}) {
  const result = useFavorites('city', { enabled });
  const favorites = result.favorites.map((favorite) => ({
    id: favorite.target.id,
    countryId: favorite.target.countryId,
    name: favorite.preview?.title || '',
    imageUrl: favorite.preview?.thumbUrl || null,
    placeholderColor: favorite.preview?.placeholderColor,
    travelers: favorite.preview?.metrics?.travelers ?? 0,
    favoriteKey: favorite.favoriteKey,
  }));
  return {
    favorites,
    ids: favorites.map((favorite) => favorite.id),
    loading: result.loading,
  };
}
