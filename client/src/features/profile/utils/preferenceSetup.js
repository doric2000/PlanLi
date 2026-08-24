import {
  BUDGETS,
  INTERESTS,
  ONBOARDING_INTERESTS,
  NEEDS,
  PACES,
  TRAVEL_PARTIES,
  TRAVELER_STYLES,
  VIBES,
} from '../constants/smartProfileOptions';
import {
  analyzeTagValues,
  normalizeBudgetId,
  TRAVEL_TAXONOMY,
} from '../../../constants/travelTaxonomy';

function uniqueAllowed(values, options, maximum) {
  const allowed = new Set(options.map((option) => option.value));
  return Array.from(new Set((Array.isArray(values) ? values : [])
    .filter((value) => allowed.has(value))))
    .slice(0, maximum);
}

const NOYA_INTEREST_MAP = Object.freeze({
  nature_scenery: 'nature_scenery',
  hiking: 'nature_scenery',
  freshwater_nature: 'nature_scenery',
  wildlife: 'nature_scenery',
  photography_viewpoints: 'nature_scenery',
  scenic_roadtrips: 'nature_scenery',
  beaches_water: 'beaches_water',
  food: 'food',
  cafes: 'food',
  culture_history: 'culture_history',
  museums_art: 'culture_history',
  architecture_neighborhoods: 'culture_history',
  shopping_markets: 'shopping_markets',
  nightlife: 'nightlife',
  music_events: 'nightlife',
  family_attractions: 'activities',
  entertainment_parks: 'activities',
  adventure_extreme: 'activities',
  local_experiences: 'activities',
  winter_sports: 'activities',
  sports_stadiums: 'activities',
  activities: 'activities',
  wellness: 'wellness',
});

export function mapProfileInterestsToNoya(values = []) {
  const allowed = new Set(ONBOARDING_INTERESTS.map((option) => option.value));
  const counts = new Map();
  for (const value of Array.isArray(values) ? values : []) {
    const mapped = NOYA_INTEREST_MAP[value] || (allowed.has(value) ? value : '');
    if (mapped) counts.set(mapped, Number(counts.get(mapped) || 0) + 1);
  }
  const order = new Map(ONBOARDING_INTERESTS.map((option, index) => [option.value, index]));
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || order.get(left[0]) - order.get(right[0]))
    .slice(0, 4)
    .map(([value]) => value);
}

export function normalizeClientSmartProfile(profile = {}) {
  const rawInterests = Array.isArray(profile.interests) ? profile.interests : [];
  const interestAliases = TRAVEL_TAXONOMY.legacy?.interestAliases || {};
  const interestValues = rawInterests.flatMap((value) => [
    value,
    ...(interestAliases[value] || []),
  ]);
  const tagAnalysis = analyzeTagValues(rawInterests);
  const partyAliases = TRAVEL_TAXONOMY.legacy?.partyAliases || {};
  const vibeAliases = TRAVEL_TAXONOMY.legacy?.vibeAliases || {};
  const travelerStyleAliases = TRAVEL_TAXONOMY.legacy?.travelerStyleAliases || {};
  const needAliases = TRAVEL_TAXONOMY.legacy?.needAliases || {};
  const partyValues = [
    ...(Array.isArray(profile.travelParties) ? profile.travelParties : []),
    profile.tripType,
    profile.travelStyleTag,
  ].filter(Boolean).map((value) => partyAliases[value] || value);
  const rawVibes = Array.isArray(profile.vibe) ? profile.vibe : [];
  const vibeValues = rawVibes.map((value) => vibeAliases[value] || value);
  const travelerStyleValues = [
    ...(Array.isArray(profile.travelerStyles) ? profile.travelerStyles : []),
    profile.travelStyleTag,
    ...rawVibes.filter((value) => travelerStyleAliases[value]),
  ].filter(Boolean).map((value) => travelerStyleAliases[value] || value);
  const needValues = [
    ...(Array.isArray(profile.needs) ? profile.needs : []),
    ...(Array.isArray(profile.constraints) ? profile.constraints : []),
    ...(Array.isArray(profile.vibe) ? profile.vibe : []),
    ...tagAnalysis.needs,
  ].map((value) => needAliases[value] || value);

  return {
    interests: uniqueAllowed(
      [...interestValues, ...tagAnalysis.interests],
      [...INTERESTS, ...ONBOARDING_INTERESTS],
      8
    ),
    budget: normalizeBudgetId(profile.budget || profile.price || profile.travelStyle),
    travelParties: uniqueAllowed(partyValues, TRAVEL_PARTIES, 2),
    vibe: uniqueAllowed(vibeValues, VIBES, 3),
    travelerStyles: uniqueAllowed(travelerStyleValues, TRAVELER_STYLES, 3),
    pace: uniqueAllowed([profile.pace], PACES, 1)[0] || '',
    needs: uniqueAllowed(needValues, NEEDS, NEEDS.length),
    onboardingVersion: Number(profile.onboardingVersion || 0),
  };
}

export function normalizeNoyaSmartProfile(profile = {}) {
  const normalized = normalizeClientSmartProfile(profile);
  return {
    ...normalized,
    interests: mapProfileInterestsToNoya(normalized.interests),
    onboardingVersion: 2,
  };
}

export function getPreferenceResumeStep(profile = {}) {
  const hasInterests = Array.isArray(profile.interests) && profile.interests.length >= 2;
  const hasCore = hasInterests && Boolean(profile.budget) &&
    Array.isArray(profile.travelParties) && profile.travelParties.length >= 1;
  return hasCore ? 2 : hasInterests ? 1 : 0;
}
