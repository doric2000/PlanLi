const INTEREST_IDS = Object.freeze([
  'nature_scenery',
  'hiking',
  'beaches_water',
  'food',
  'cafes',
  'nightlife',
  'culture_history',
  'museums_art',
  'architecture_neighborhoods',
  'shopping_markets',
  'family_attractions',
  'entertainment_parks',
  'adventure_extreme',
  'wildlife',
  'wellness',
  'local_experiences',
  'photography_viewpoints',
  'music_events',
  'winter_sports',
  'scenic_roadtrips',
]);

const BUDGET_IDS = Object.freeze([
  'economy',
  'balanced',
  'comfort',
  'premium',
  'flexible',
]);

const TRAVEL_PARTY_IDS = Object.freeze([
  'solo',
  'couple',
  'friends',
  'family_young_children',
  'family_older_children',
  'multigenerational_group',
]);

const VIBE_IDS = Object.freeze([
  'relaxed',
  'romantic',
  'adventurous',
  'cultural',
  'social',
  'local',
  'backpacker',
  'digital_nomad',
]);

const PACE_IDS = Object.freeze(['relaxed', 'balanced', 'packed']);

const NEED_IDS = Object.freeze([
  'kosher',
  'shabbat_friendly',
  'vegetarian',
  'vegan',
  'wheelchair_accessible',
  'reduced_walking',
]);

const CATEGORY_INTERESTS = Object.freeze({
  food: ['food'],
  nature: ['nature_scenery'],
  attractions: ['local_experiences'],
  stay: ['wellness'],
  transportation: ['scenic_roadtrips'],
  logistics: ['local_experiences'],
  services: ['local_experiences'],
});

const LEGACY_INTERESTS = Object.freeze({
  nature: ['nature_scenery'],
  museums: ['museums_art'],
  shopping: ['shopping_markets'],
});

const TAG_INTERESTS = Object.freeze({
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
});

const TAG_NEEDS = Object.freeze({
  'כשר': ['kosher'],
  'חב״ד': ['shabbat_friendly'],
  'צמחוני': ['vegetarian'],
  'טבעוני': ['vegan'],
  'נגישות': ['wheelchair_accessible'],
});

const LEGACY_NEEDS = Object.freeze({
  kosher: 'kosher',
  shabbatObserver: 'shabbat_friendly',
  accessibility: 'wheelchair_accessible',
});

const LEGACY_BUDGETS = Object.freeze({
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
});

const LEGACY_PARTIES = Object.freeze({
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
});

const LEGACY_VIBES = Object.freeze({
  'מרגיע': 'relaxed',
  'רומנטי': 'romantic',
  'אתגרי': 'adventurous',
  'תרבותי': 'cultural',
  'תרמילאים': 'backpacker',
  'נוודים דיגיטליים': 'digital_nomad',
});

function uniqueAllowed(values, allowed, maximum) {
  if (!Array.isArray(values)) return [];
  const allowedSet = new Set(allowed);
  return Array.from(new Set(values
    .filter((value) => typeof value === 'string')
    .map((value) => value.trim())
    .filter((value) => allowedSet.has(value))))
    .slice(0, maximum);
}

function normalizeBudget(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (BUDGET_IDS.includes(text)) return text;
  return LEGACY_BUDGETS[text] || '';
}

function mapLegacyInterests(values) {
  const output = [];
  for (const value of Array.isArray(values) ? values : []) {
    if (INTEREST_IDS.includes(value)) output.push(value);
    output.push(...(LEGACY_INTERESTS[value] || []));
    output.push(...(TAG_INTERESTS[value] || []));
    output.push(...(CATEGORY_INTERESTS[value] || []));
  }
  return uniqueAllowed(output, INTEREST_IDS, 8);
}

function normalizeSmartProfile(value = {}) {
  const legacyParty = LEGACY_PARTIES[value.travelStyleTag] || LEGACY_PARTIES[value.tripType];
  const legacyVibeValues = [
    ...(Array.isArray(value.vibe) ? value.vibe : []),
    value.travelStyleTag,
  ].filter(Boolean).map((entry) => LEGACY_VIBES[entry] || entry);
  const needsFromLegacy = (Array.isArray(value.interests) ? value.interests : [])
    .flatMap((entry) => TAG_NEEDS[entry] || []);
  const legacyConstraints = (Array.isArray(value.constraints) ? value.constraints : [])
    .map((entry) => LEGACY_NEEDS[entry] || entry);
  return {
    interests: mapLegacyInterests(value.interests),
    budget: normalizeBudget(value.budget || value.price || value.travelStyle),
    travelParties: uniqueAllowed(
      [...(Array.isArray(value.travelParties) ? value.travelParties : []), legacyParty].filter(Boolean),
      TRAVEL_PARTY_IDS,
      2
    ),
    vibe: uniqueAllowed(legacyVibeValues, VIBE_IDS, 3),
    pace: PACE_IDS.includes(value.pace) ? value.pace : '',
    needs: uniqueAllowed(
      [...(Array.isArray(value.needs) ? value.needs : []), ...needsFromLegacy, ...legacyConstraints],
      NEED_IDS,
      NEED_IDS.length
    ),
  };
}

function buildRecommendationFacets(content, submitted = {}) {
  const tags = Array.isArray(content?.tags) ? content.tags : [];
  const interests = [
    ...(CATEGORY_INTERESTS[content?.categoryId] || []),
    ...tags.flatMap((tag) => TAG_INTERESTS[tag] || []),
    ...(Array.isArray(submitted.interests) ? submitted.interests : []),
  ];
  const needs = [
    ...tags.flatMap((tag) => TAG_NEEDS[tag] || []),
    ...(Array.isArray(submitted.needs) ? submitted.needs : []),
  ];
  return {
    interests: uniqueAllowed(interests, INTEREST_IDS, 8),
    audiences: uniqueAllowed(submitted.audiences, TRAVEL_PARTY_IDS, 4),
    vibes: uniqueAllowed(submitted.vibes, VIBE_IDS, 4),
    needs: uniqueAllowed(needs, NEED_IDS, NEED_IDS.length),
    budgetLevel: normalizeBudget(content?.budget),
  };
}

const buildTravelContentFacets = buildRecommendationFacets;

module.exports = {
  BUDGET_IDS,
  INTEREST_IDS,
  NEED_IDS,
  PACE_IDS,
  TRAVEL_PARTY_IDS,
  VIBE_IDS,
  buildRecommendationFacets,
  buildTravelContentFacets,
  mapLegacyInterests,
  normalizeBudget,
  normalizeSmartProfile,
  uniqueAllowed,
};
