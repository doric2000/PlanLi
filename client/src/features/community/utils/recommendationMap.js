import { getTravelCategoryPresentation } from '../../../constants/travelPresentation';
import { getPlaceCoordinates } from '../../../utils/distance';
import { featureCollection, pointFeature } from '../../../utils/mapGeoJson';

export function getRecommendationMapVisual(categoryId, legacyCategory) {
  return getTravelCategoryPresentation(categoryId, legacyCategory);
}

export function normalizeRecommendationMapItems(recommendations) {
  if (!Array.isArray(recommendations)) return [];

  return recommendations
    .map((recommendation) => {
      const coordinates = getPlaceCoordinates(recommendation?.place) || (
        Number.isFinite(Number(recommendation?.mapLocation?.lat)) &&
        Number.isFinite(Number(recommendation?.mapLocation?.lng))
          ? {
              lat: Number(recommendation.mapLocation.lat),
              lng: Number(recommendation.mapLocation.lng),
            }
          : null
      );
      if (!recommendation?.id || !coordinates) return null;

      return {
        id: recommendation.id,
        title: recommendation.title || recommendation.destination?.cityName || 'המלצה',
        coordinates,
        recommendation,
        visual: getRecommendationMapVisual(
          recommendation.categoryId,
          recommendation.category
        ),
      };
    })
    .filter(Boolean);
}

export function recommendationsToGeoJson(recommendations) {
  return featureCollection(normalizeRecommendationMapItems(recommendations).map((entry) => (
    pointFeature(entry.coordinates, {
      id: entry.id,
      postId: entry.recommendation?.postId || entry.id,
      title: entry.title,
      color: entry.visual.color,
      category: entry.visual.label,
    }, entry.id)
  )));
}

export {
  CATEGORY_COLORS,
  FALLBACK_PRESENTATION as FALLBACK_VISUAL,
} from '../../../constants/travelPresentation';
