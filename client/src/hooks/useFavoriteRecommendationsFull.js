import { useCallback, useMemo } from 'react';
import { useFavorites } from './useFavorites';

const asRecommendationPreview = (favorite) => {
  const preview = favorite.preview || {};
  const thumbUrl = preview.thumbUrl;
  return {
    id: favorite.target.id,
    ownerId: preview.owner?.id || null,
    title: preview.title || '',
    description: preview.subtitle || '',
    status: 'active',
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

export function useFavoriteRecommendationsFull({ enabled = true } = {}) {
  const result = useFavorites('recommendation', { enabled });
  const favorites = useMemo(
    () => result.favorites.map(asRecommendationPreview),
    [result.favorites]
  );
  const reload = useCallback(() => {}, []);
  return { favorites, loading: result.loading, reload };
}
