import { useCallback, useMemo } from 'react';
import { useFavorites } from './useFavorites';

const asRoutePreview = (favorite) => {
  const preview = favorite.preview || {};
  const thumbUrl = preview.thumbUrl;
  return {
    id: favorite.target.id,
    ownerId: preview.owner?.id || null,
    title: preview.title || '',
    description: preview.subtitle || '',
    status: 'active',
    dayCount: preview.metrics?.days ?? null,
    distanceKm: preview.metrics?.distanceKm ?? null,
    media: thumbUrl
      ? [{
          assetId: `favorite-${favorite.favoriteKey}`,
          large: { url: thumbUrl },
          feed: { url: thumbUrl },
          thumb: { url: thumbUrl },
          placeholder: { color: preview.placeholderColor || '#E5E7EB' },
        }]
      : [],
    favoriteTarget: favorite.target,
    isFavoritePreview: true,
  };
};

export function useFavoriteRoadTripsFull({ enabled = true } = {}) {
  const result = useFavorites('route', { enabled });
  const favorites = useMemo(
    () => result.favorites.map(asRoutePreview),
    [result.favorites]
  );
  const reload = useCallback(() => {}, []);
  return { favorites, loading: result.loading, reload };
}
