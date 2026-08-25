import {
  CATEGORIES,
  INTERESTS,
  RECOMMENDATION_CATEGORIES,
  TRAVEL_PARTIES,
  TRAVELER_STYLES,
  VIBES,
  getCategoryLabel,
  getOptionLabel,
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
  nightlife: '#7C2D92',
  events: '#C2410C',
});

export const FALLBACK_PRESENTATION = Object.freeze({
  categoryId: '',
  label: 'המלצה',
  icon: 'place',
  color: '#1E3A5F',
});

const CATEGORY_BY_ID = Object.fromEntries([
  ...CATEGORIES.map((category, index) => [category.id, { ...category, order: index }]),
  ...RECOMMENDATION_CATEGORIES.map((category) => [category.id, category]),
]);

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

// Profile preferences are presented as a travel style, so their Hebrew labels
// intentionally use the stable masculine-singular form instead of agreeing
// with the feminine taxonomy noun "אווירה".
const PROFILE_VIBE_LABELS = Object.freeze({
  relaxed: 'רגוע',
  romantic: 'רומנטי',
  adventurous: 'הרפתקני',
  cultural: 'תרבותי',
  social: 'חברתי',
  local: 'מקומי ואותנטי',
  lively: 'תוסס',
  quiet_secluded: 'שקט ומבודד',
});

const INTEREST_BY_ID = Object.fromEntries(INTERESTS.map((option) => [option.value, option]));
const VIBE_BY_ID = Object.fromEntries(VIBES.map((option) => [option.value, option]));

export function getTravelCategoryPresentation(categoryId, legacyCategory) {
  const directId = typeof categoryId === 'string' && CATEGORY_BY_ID[categoryId.trim()]
    ? categoryId.trim()
    : '';
  const normalizedId = directId || normalizeCategoryId(categoryId) || normalizeCategoryId(legacyCategory);
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
    label: (isVibe ? PROFILE_VIBE_LABELS[normalizedValue] : option?.label)
      || option?.label
      || normalizedValue
      || 'העדפה',
    icon: (isVibe ? VIBE_ICONS : INTEREST_ICONS)[normalizedValue] || category.icon,
    color: category.color,
    categoryId,
  };
}

export function getPersonalizationReasonPresentation(reasonCode) {
  if (reasonCode && typeof reasonCode === 'object') {
    const { code, value, evidence = {} } = reasonCode;
    const interest = value ? getPreferencePresentation('interest', value) : null;
    if (code === 'declared_interest' && interest?.label) {
      return {
        label: `כי בחרת בתחום ${interest.label}`,
        detail: `הפריט מתאים לתחום העניין ${interest.label} שבחרת בהעדפות.`,
        icon: interest.icon || 'auto-awesome',
      };
    }
    if (code === 'budget_exact') return {
      label: 'מתאים לרמת המחיר שבחרת',
      detail: 'רמת המחיר של הפריט תואמת להעדפה ששמרת.',
      icon: 'account-balance-wallet',
    };
    if (code === 'budget_near') return {
      label: 'קרוב לרמת המחיר שבחרת',
      detail: 'רמת המחיר של הפריט קרובה להעדפה ששמרת.',
      icon: 'account-balance-wallet',
    };
    if (code === 'travel_party') return {
      label: 'מתאים להרכב הנסיעה שבחרת',
      detail: 'הפריט מסומן כמתאים להרכב הנסיעה ששמרת בהעדפות.',
      icon: 'groups',
    };
    if (code === 'need_match') return {
      label: 'מתאים לצורך שסימנת',
      detail: 'המידע המאומת בפריט תואם לצורך שבחרת בהעדפות.',
      icon: 'verified',
    };
    if (code === 'learned_interest' && interest?.label) {
      const evidenceSource = evidence.source
        || (Number(evidence.favorites || 0) > 0 ? 'favorite' : '')
        || (Number(evidence.likes || 0) > 0 ? 'like' : '')
        || (Number(evidence.meaningfulViews || 0) > 0 ? 'meaningful_view' : '');
      const label = evidenceSource === 'favorite'
        ? 'כי שמרת מקומות דומים'
        : evidenceSource === 'like'
          ? 'כי אהבת מקומות דומים'
          : evidenceSource === 'meaningful_view'
            ? 'כי צפית במקומות דומים'
            : 'כי הפעילות שלך במקומות דומים';
      return {
        label,
        detail: `הפעילות שלך מרמזת ש${interest.label} עשוי לעניין אותך. אפשר לכבות את הלמידה בהגדרות.`,
        icon: 'history',
      };
    }
    if (code === 'learned_destination') return {
      label: 'כי התעניינת לאחרונה ביעד הזה',
      detail: 'פתיחות, לייקים או שמירות ביעד הזה עזרו לבחור את הפריט.',
      icon: 'location-on',
    };
    if (code === 'exploration_popular') return {
      label: 'פופולרי עכשיו ב־PlanLi',
      detail: 'הוספנו בחירה פופולרית כדי לאפשר לגלות משהו מעבר להעדפות הקבועות.',
      icon: 'trending-up',
    };
    if (code === 'exploration_new') return {
      label: 'משהו חדש שכדאי להכיר',
      detail: 'הוספנו בחירה חדשה כדי לגוון את ההמלצות שמופיעות לך.',
      icon: 'auto-awesome',
    };
    if (code === 'search_match') return {
      label: 'מתאים לחיפוש שלך',
      detail: 'המילים שחיפשת מופיעות בפרטי הפריט.',
      icon: 'search',
    };
    if (code === 'generic_popular') return {
      label: 'פופולרי בקרב מטיילים',
      detail: 'הפריט בולט לפי הפעילות של קהילת PlanLi.',
      icon: 'trending-up',
    };
    if (code === 'generic_new') return {
      label: 'חדש ב־PlanLi',
      detail: 'זה פריט חדש שעשוי לעזור בתכנון הטיול הבא.',
      icon: 'auto-awesome',
    };
    if (code === 'community_pick') return {
      label: 'מקהילת המטיילים של PlanLi',
      detail: 'הפריט פורסם בקהילת PlanLi ומשתלב בתוצאות בלי להסתמך על מידע שלא נמסר.',
      icon: 'people',
    };
    return null;
  }
  if (typeof reasonCode !== 'string' || !reasonCode.trim()) return null;
  if (reasonCode === 'budget') {
    return { label: 'תקציב מועדף', icon: 'account-balance-wallet' };
  }

  const [kind, value] = reasonCode.split(':');
  if (!value) return null;

  if (kind === 'interest') {
    if (!INTERESTS.some((option) => option.value === value)) return null;
    const presentation = getPreferencePresentation('interest', value);
    return presentation?.label
      ? { label: presentation.label, icon: presentation.icon || 'landscape' }
      : null;
  }

  if (kind === 'party' || kind === 'audience') {
    if (!TRAVEL_PARTIES.some((option) => option.value === value)) return null;
    const label = getOptionLabel(TRAVEL_PARTIES, value);
    return label ? { label, icon: 'groups' } : null;
  }

  if (kind === 'style') {
    if (!TRAVELER_STYLES.some((option) => option.value === value)) return null;
    const label = getOptionLabel(TRAVELER_STYLES, value);
    return label ? { label, icon: 'explore' } : null;
  }

  return null;
}

export function getCategoryOrder(categoryId) {
  return CATEGORY_BY_ID[categoryId]?.order ?? Number.MAX_SAFE_INTEGER;
}

export { INTEREST_TO_CATEGORY, INTEREST_ICONS, VIBE_ICONS };
