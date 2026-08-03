import {
  BUDGETS,
  INTERESTS,
  NEEDS,
  PACES,
  TRAVEL_PARTIES,
  VIBES,
} from '../constants/smartProfileOptions';

const LEGACY_INTERESTS = {
  nature: ['nature_scenery'],
  museums: ['museums_art'],
  shopping: ['shopping_markets'],
  'בית קפה': ['cafes'],
  'אוכל רחוב': ['food', 'local_experiences'],
  'בר': ['nightlife'],
  'חיי לילה': ['nightlife'],
  'טיול רגלי': ['hiking'],
  'נקודת תצפית': ['photography_viewpoints'],
  'מצפה': ['photography_viewpoints'],
  'חופים': ['beaches_water'],
  'מפלים': ['beaches_water', 'nature_scenery'],
  'מעיינות': ['beaches_water', 'nature_scenery'],
  'שמורת טבע': ['nature_scenery', 'wildlife'],
  'מוזיאון': ['museums_art'],
  'אתר היסטורי': ['culture_history'],
  'שכונות מומלצות': ['architecture_neighborhoods', 'local_experiences'],
  'פארק שעשועים': ['entertainment_parks', 'family_attractions'],
  'הרפתקה': ['adventure_extreme'],
  'אתגרי': ['adventure_extreme'],
  'קניות': ['shopping_markets'],
  'שווקים': ['shopping_markets', 'local_experiences'],
  'לאינסטגרם': ['photography_viewpoints'],
  'הופעות': ['music_events'],
  'סדנאות': ['local_experiences'],
  'עיסוי / ספא': ['wellness'],
  'חורף': ['winter_sports'],
  'השכרת רכב': ['scenic_roadtrips'],
};

const LEGACY_BUDGETS = {
  'חינמי': 'economy',
  '₪': 'economy',
  '$': 'economy',
  '₪₪': 'balanced',
  '$$': 'balanced',
  '₪₪₪': 'comfort',
  '$$$': 'comfort',
  '₪₪₪₪': 'premium',
  '$$$$': 'premium',
  budget: 'economy',
  medium: 'balanced',
  luxury: 'premium',
};

const LEGACY_PARTIES = {
  'מטיילים לבד': 'solo',
  'סולו': 'solo',
  solo: 'solo',
  'זוגות': 'couple',
  'זוג': 'couple',
  couple: 'couple',
  'חברים': 'friends',
  friends: 'friends',
  'ידידותי למשפחות': 'family_young_children',
  'משפחה': 'family_young_children',
  family: 'family_young_children',
};

const LEGACY_VIBES = {
  'מרגיע': 'relaxed',
  'רומנטי': 'romantic',
  'אתגרי': 'adventurous',
  'תרבותי': 'cultural',
  'תרמילאים': 'backpacker',
  'נוודים דיגיטליים': 'digital_nomad',
};

const LEGACY_NEEDS = {
  kosher: 'kosher',
  shabbatObserver: 'shabbat_friendly',
  accessibility: 'wheelchair_accessible',
  'כשר': 'kosher',
  'חב״ד': 'shabbat_friendly',
  'צמחוני': 'vegetarian',
  'טבעוני': 'vegan',
  'נגישות': 'wheelchair_accessible',
};

function uniqueAllowed(values, options, maximum) {
  const allowed = new Set(options.map((option) => option.value));
  return Array.from(new Set(values.filter((value) => allowed.has(value)))).slice(0, maximum);
}

export function normalizeClientSmartProfile(profile = {}) {
  const interestValues = (Array.isArray(profile.interests) ? profile.interests : [])
    .flatMap((value) => [value, ...(LEGACY_INTERESTS[value] || [])]);
  const legacyNeedsFromInterests = (Array.isArray(profile.interests) ? profile.interests : [])
    .map((value) => LEGACY_NEEDS[value])
    .filter(Boolean);
  const partyValues = [
    ...(Array.isArray(profile.travelParties) ? profile.travelParties : []),
    profile.tripType,
    profile.travelStyleTag,
  ].filter(Boolean).map((value) => LEGACY_PARTIES[value] || value);
  const vibeValues = [
    ...(Array.isArray(profile.vibe) ? profile.vibe : []),
    profile.travelStyleTag,
  ].filter(Boolean).map((value) => LEGACY_VIBES[value] || value);
  const needValues = [
    ...(Array.isArray(profile.needs) ? profile.needs : []),
    ...(Array.isArray(profile.constraints) ? profile.constraints : []),
    ...(Array.isArray(profile.vibe) ? profile.vibe : []),
    ...legacyNeedsFromInterests,
  ].map((value) => LEGACY_NEEDS[value] || value);
  const rawBudget = profile.budget || profile.price || profile.travelStyle || '';
  const budget = BUDGETS.some((option) => option.value === rawBudget)
    ? rawBudget
    : LEGACY_BUDGETS[rawBudget] || '';

  return {
    interests: uniqueAllowed(interestValues, INTERESTS, 8),
    budget,
    travelParties: uniqueAllowed(partyValues, TRAVEL_PARTIES, 2),
    vibe: uniqueAllowed(vibeValues, VIBES, 3),
    pace: PACES.some((option) => option.value === profile.pace) ? profile.pace : '',
    needs: uniqueAllowed(needValues, NEEDS, NEEDS.length),
  };
}

export function getPreferenceResumeStep(profile = {}) {
  const hasInterests = Array.isArray(profile.interests) && profile.interests.length >= 3;
  const hasCore = hasInterests && Boolean(profile.budget) &&
    Array.isArray(profile.travelParties) && profile.travelParties.length >= 1;
  const hasOptionalStyle = hasCore && (
    (Array.isArray(profile.vibe) && profile.vibe.length > 0) || Boolean(profile.pace)
  );
  return hasOptionalStyle ? 3 : hasCore ? 2 : hasInterests ? 1 : 0;
}
