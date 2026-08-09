import { useCallback, useMemo } from 'react';
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
  const favoriteKeys = useMemo(
    () => new Set(favorites.map((favorite) => `${favorite.countryId}:${favorite.id}`)),
    [favorites]
  );
  const toggleFavorite = useCallback(async (city) => {
    if (!city?.id || !city?.countryId) return;
    const { setFavorite } = await import('../services/SocialService');
    const target = { type: 'city', id: city.id, countryId: city.countryId };
    await setFavorite(target, !favoriteKeys.has(`${city.countryId}:${city.id}`));
  }, [favoriteKeys]);
  return {
    favorites,
    ids: favorites.map((favorite) => favorite.id),
    loading: result.loading,
    toggleFavorite,
  };
}
