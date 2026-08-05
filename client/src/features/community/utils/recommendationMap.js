import {
  CATEGORIES,
  getCategoryLabel,
  normalizeCategoryId,
} from '../../../constants/travelTaxonomy';
import { getPlaceCoordinates } from '../../../utils/distance';

const CATEGORY_COLORS = {
  food: '#E85D3F',
  nature: '#2E8B57',
  culture: '#7C3AED',
  activities: '#2563EB',
  shopping: '#DB2777',
  stay: '#4F46E5',
  transportation: '#0891B2',
  services: '#475569',
};

const FALLBACK_VISUAL = Object.freeze({
  categoryId: '',
  label: 'המלצה',
  icon: 'place',
  color: '#1E3A5F',
});

const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((category) => [category.id, category]));

export function getRecommendationMapVisual(categoryId, legacyCategory) {
  const normalizedId = normalizeCategoryId(categoryId) || normalizeCategoryId(legacyCategory);
  const category = CATEGORY_BY_ID[normalizedId];

  if (!category) {
    return {
      ...FALLBACK_VISUAL,
      label: getCategoryLabel(legacyCategory) || FALLBACK_VISUAL.label,
    };
  }

  return {
    categoryId: category.id,
    label: category.label,
    icon: category.icon || FALLBACK_VISUAL.icon,
    color: CATEGORY_COLORS[category.id] || FALLBACK_VISUAL.color,
  };
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

export { CATEGORY_COLORS, FALLBACK_VISUAL };
