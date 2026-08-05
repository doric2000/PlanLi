import { getTravelCategoryPresentation } from '../../../constants/travelPresentation';
import { getPlaceCoordinates } from '../../../utils/distance';

export function getRecommendationMapVisual(categoryId, legacyCategory) {
  return getTravelCategoryPresentation(categoryId, legacyCategory);
}

export function normalizeRecommendationMapItems(recommendations) {
  if (!Array.isArray(recommendations)) return [];

  return recommendations
    .map((recommendation) => {
      const coordinates = getPlaceCoordinates(recommendation?.place);
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

export {
  CATEGORY_COLORS,
  FALLBACK_PRESENTATION as FALLBACK_VISUAL,
} from '../../../constants/travelPresentation';
