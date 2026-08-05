import {
  CATEGORIES,
  INTERESTS,
  VIBES,
  getCategoryLabel,
  normalizeCategoryId,
} from './travelTaxonomy';

export const CATEGORY_COLORS = Object.freeze({
  food: '#E85D3F',
  nature: '#2E8B57',
  culture: '#7C3AED',
  activities: '#2563EB',
  shopping: '#DB2777',
  stay: '#4F46E5',
  transportation: '#0891B2',
  services: '#475569',
});

export const FALLBACK_PRESENTATION = Object.freeze({
  categoryId: '',
  label: 'המלצה',
  icon: 'place',
  color: '#1E3A5F',
});

const CATEGORY_BY_ID = Object.fromEntries(
  CATEGORIES.map((category, index) => [category.id, { ...category, order: index }])
);

const INTEREST_TO_CATEGORY = Object.freeze({
  nature_scenery: 'nature',
  hiking: 'nature',
  beaches_water: 'nature',
  freshwater_nature: 'nature',
  food: 'food',
  cafes: 'food',
  nightlife: 'food',
  culture_history: 'culture',
  museums_art: 'culture',
  architecture_neighborhoods: 'culture',
  shopping_markets: 'shopping',
  family_attractions: 'activities',
  entertainment_parks: 'activities',
  adventure_extreme: 'activities',
  wildlife: 'nature',
  wellness: 'activities',
  local_experiences: 'activities',
  photography_viewpoints: 'activities',
  music_events: 'activities',
  winter_sports: 'nature',
  scenic_roadtrips: 'transportation',
  sports_stadiums: 'activities',
  stays_accommodation: 'stay',
  transportation_mobility: 'transportation',
  travel_tips_services: 'services',
});

const INTEREST_ICONS = Object.freeze({
  nature_scenery: 'landscape',
  hiking: 'hiking',
  beaches_water: 'beach-access',
  freshwater_nature: 'water',
  food: 'restaurant',
  cafes: 'local-cafe',
  nightlife: 'nightlife',
  culture_history: 'account-balance',
  museums_art: 'museum',
  architecture_neighborhoods: 'architecture',
  shopping_markets: 'shopping-bag',
  family_attractions: 'groups',
  entertainment_parks: 'attractions',
  adventure_extreme: 'terrain',
  wildlife: 'pets',
  wellness: 'spa',
  local_experiences: 'explore',
  photography_viewpoints: 'photo-camera',
  music_events: 'music-note',
  winter_sports: 'downhill-skiing',
  scenic_roadtrips: 'map',
  sports_stadiums: 'sports-soccer',
  stays_accommodation: 'bed',
  transportation_mobility: 'directions-bus',
  travel_tips_services: 'handyman',
});

const VIBE_ICONS = Object.freeze({
  relaxed: 'self-improvement',
  romantic: 'favorite',
  adventurous: 'terrain',
  cultural: 'account-balance',
  social: 'groups',
  local: 'place',
  lively: 'music-note',
  quiet_secluded: 'nature-people',
});

const INTEREST_BY_ID = Object.fromEntries(INTERESTS.map((option) => [option.value, option]));
const VIBE_BY_ID = Object.fromEntries(VIBES.map((option) => [option.value, option]));

export function getTravelCategoryPresentation(categoryId, legacyCategory) {
  const normalizedId = normalizeCategoryId(categoryId) || normalizeCategoryId(legacyCategory);
  const category = CATEGORY_BY_ID[normalizedId];

  if (!category) {
    return {
      ...FALLBACK_PRESENTATION,
      label: getCategoryLabel(legacyCategory) || FALLBACK_PRESENTATION.label,
    };
  }

  return {
    categoryId: category.id,
    label: category.label,
    icon: category.icon || FALLBACK_PRESENTATION.icon,
    color: CATEGORY_COLORS[category.id] || FALLBACK_PRESENTATION.color,
    order: category.order,
  };
}

export function getPreferencePresentation(kind, value) {
  const normalizedValue = typeof value === 'string' ? value.trim() : '';
  const isVibe = kind === 'vibe' || kind === 'vibes';
  const option = (isVibe ? VIBE_BY_ID : INTEREST_BY_ID)[normalizedValue];
  const categoryId = isVibe ? '' : INTEREST_TO_CATEGORY[normalizedValue] || '';
  const category = categoryId
    ? getTravelCategoryPresentation(categoryId)
    : FALLBACK_PRESENTATION;

  return {
    id: normalizedValue,
    kind: isVibe ? 'vibe' : 'interest',
    label: option?.label || normalizedValue || 'העדפה',
    icon: (isVibe ? VIBE_ICONS : INTEREST_ICONS)[normalizedValue] || category.icon,
    color: category.color,
    categoryId,
  };
}

export function getCategoryOrder(categoryId) {
  return CATEGORY_BY_ID[categoryId]?.order ?? Number.MAX_SAFE_INTEGER;
}

export { INTEREST_TO_CATEGORY, INTEREST_ICONS, VIBE_ICONS };
