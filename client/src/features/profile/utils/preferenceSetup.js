import {
  BUDGETS,
  INTERESTS,
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
    interests: uniqueAllowed([...interestValues, ...tagAnalysis.interests], INTERESTS, 8),
    budget: normalizeBudgetId(profile.budget || profile.price || profile.travelStyle),
    travelParties: uniqueAllowed(partyValues, TRAVEL_PARTIES, 2),
    vibe: uniqueAllowed(vibeValues, VIBES, 3),
    travelerStyles: uniqueAllowed(travelerStyleValues, TRAVELER_STYLES, 3),
    pace: uniqueAllowed([profile.pace], PACES, 1)[0] || '',
    needs: uniqueAllowed(needValues, NEEDS, NEEDS.length),
  };
}

export function getPreferenceResumeStep(profile = {}) {
  const hasInterests = Array.isArray(profile.interests) && profile.interests.length >= 3;
  const hasCore = hasInterests && Boolean(profile.budget) &&
    Array.isArray(profile.travelParties) && profile.travelParties.length >= 1;
  return hasCore ? 2 : hasInterests ? 1 : 0;
}
