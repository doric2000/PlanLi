const taxonomy = require('./travelTaxonomy.generated.json');

const ids = (items) => Object.freeze(items.map((item) => item.id));

const INTEREST_IDS = ids(taxonomy.interests);
const BUDGET_IDS = ids(taxonomy.budgets);
const POST_BUDGET_IDS = Object.freeze(taxonomy.budgets
  .filter((item) => item.postApplicable)
  .map((item) => item.id));
const TRAVEL_PARTY_IDS = ids(taxonomy.travelParties);
const VIBE_IDS = ids(taxonomy.vibes);
const NEED_IDS = ids(taxonomy.needs);
const CATEGORY_IDS = ids(taxonomy.categories);
const TAG_IDS = ids(taxonomy.tags);

const CATEGORY_BY_ID = Object.freeze(Object.fromEntries(
  taxonomy.categories.map((item) => [item.id, item])
));
const CATEGORY_ID_BY_LABEL = Object.freeze(Object.fromEntries(
  taxonomy.categories.map((item) => [item.label, item.id])
));
const TAG_BY_ID = Object.freeze(Object.fromEntries(taxonomy.tags.map((item) => [item.id, item])));
const TAG_ID_BY_ALIAS = Object.freeze({
  ...Object.fromEntries(taxonomy.tags.map((item) => [item.label, item.id])),
  ...(taxonomy.legacy?.tagAliases || {}),
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

function normalizeBudget(value, { allowFlexible = true } = {}) {
  const text = typeof value === 'string' ? value.trim() : '';
  const normalized = BUDGET_IDS.includes(text)
    ? text
    : taxonomy.legacy?.budgetAliases?.[text] || '';
  return normalized === 'flexible' && !allowFlexible ? '' : normalized;
}

function normalizeCategoryId(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  return CATEGORY_IDS.includes(text) ? text : CATEGORY_ID_BY_LABEL[text] || '';
}

function getCategoryLabel(value) {
  const categoryId = normalizeCategoryId(value);
  return CATEGORY_BY_ID[categoryId]?.label || '';
}

function analyzeTagValues(values) {
  const tagIds = [];
  const interests = [];
  const vibes = [];
  const needs = [];
  const audiences = [];
  let budgetLevel = '';
  let recognized = true;

  for (const raw of Array.isArray(values) ? values : []) {
    const value = typeof raw === 'string' ? raw.trim() : '';
    const tagId = TAG_BY_ID[value] ? value : TAG_ID_BY_ALIAS[value];
    const tag = TAG_BY_ID[tagId];
    if (tag) {
      tagIds.push(tag.id);
      interests.push(...(tag.interests || []));
      vibes.push(...(tag.vibes || []));
      needs.push(...(tag.needs || []));
      audiences.push(...(tag.audiences || []));
      continue;
    }
    const legacyNeeds = taxonomy.legacy?.tagNeeds?.[value];
    const legacyAudiences = taxonomy.legacy?.tagAudiences?.[value];
    const legacyBudget = taxonomy.legacy?.tagBudgets?.[value];
    if (legacyNeeds) needs.push(...legacyNeeds);
    else if (legacyAudiences) audiences.push(...legacyAudiences);
    else if (legacyBudget) budgetLevel ||= legacyBudget;
    else recognized = false;
  }

  return {
    recognized,
    tagIds: uniqueAllowed(tagIds, TAG_IDS, 20),
    interests: uniqueAllowed(interests, INTEREST_IDS, INTEREST_IDS.length),
    vibes: uniqueAllowed(vibes, VIBE_IDS, VIBE_IDS.length),
    needs: uniqueAllowed(needs, NEED_IDS, NEED_IDS.length),
    audiences: uniqueAllowed(audiences, TRAVEL_PARTY_IDS, TRAVEL_PARTY_IDS.length),
    budgetLevel,
  };
}

const normalizeRecommendationTags = (values) => analyzeTagValues(values).tagIds;

function tagsMatchCategory(values, categoryValue) {
  const categoryId = normalizeCategoryId(categoryValue);
  const analysis = analyzeTagValues(values);
  return Boolean(categoryId) && analysis.recognized && analysis.tagIds.every(
    (tagId) => TAG_BY_ID[tagId]?.categoryId === categoryId ||
      TAG_BY_ID[tagId]?.categoryIds?.includes(categoryId)
  );
}

function mapLegacyInterests(values) {
  const output = [];
  const interestAliases = taxonomy.legacy?.interestAliases || {};
  for (const value of Array.isArray(values) ? values : []) {
    if (INTEREST_IDS.includes(value)) output.push(value);
    output.push(...(interestAliases[value] || []));
    const categoryId = normalizeCategoryId(value);
    if (categoryId) output.push(...(CATEGORY_BY_ID[categoryId]?.interests || []));
  }
  output.push(...analyzeTagValues(values).interests);
  return uniqueAllowed(output, INTEREST_IDS, 8);
}

function normalizeSmartProfile(value = {}) {
  const partyAliases = taxonomy.legacy?.partyAliases || {};
  const vibeAliases = taxonomy.legacy?.vibeAliases || {};
  const needAliases = taxonomy.legacy?.needAliases || {};
  const legacyParty = partyAliases[value.travelStyleTag] || partyAliases[value.tripType];
  const legacyVibeValues = [
    ...(Array.isArray(value.vibe) ? value.vibe : []),
    value.travelStyleTag,
  ].filter(Boolean).map((entry) => vibeAliases[entry] || entry);
  const tagAnalysis = analyzeTagValues(value.interests);
  const legacyConstraints = (Array.isArray(value.constraints) ? value.constraints : [])
    .map((entry) => needAliases[entry] || entry);
  return {
    interests: mapLegacyInterests(value.interests),
    budget: normalizeBudget(value.budget || value.price || value.travelStyle),
    travelParties: uniqueAllowed(
      [...(Array.isArray(value.travelParties) ? value.travelParties : []), legacyParty].filter(Boolean),
      TRAVEL_PARTY_IDS,
      2
    ),
    vibe: uniqueAllowed(legacyVibeValues, VIBE_IDS, 3),
    needs: uniqueAllowed(
      [
        ...(Array.isArray(value.needs) ? value.needs : []),
        ...(Array.isArray(value.vibe) ? value.vibe : []),
        ...tagAnalysis.needs,
        ...legacyConstraints,
      ].map((entry) => needAliases[entry] || entry),
      NEED_IDS,
      NEED_IDS.length
    ),
  };
}

function isSmartProfileComplete(value) {
  if (!value?.completedAt || value.setupRequired === true) return false;
  const profile = normalizeSmartProfile(value);
  return profile.interests.length >= 3 && profile.interests.length <= 8 &&
    Boolean(profile.budget) && profile.travelParties.length >= 1;
}

function buildRecommendationFacets(content, submitted = {}) {
  const categoryId = normalizeCategoryId(content?.categoryId || content?.category);
  const categoryInterests = CATEGORY_BY_ID[categoryId]?.interests || [];
  const tagAnalysis = analyzeTagValues(content?.tags);
  return {
    interests: uniqueAllowed(
      [
        ...(Array.isArray(submitted.interests) ? submitted.interests : []),
        ...categoryInterests,
        ...tagAnalysis.interests,
      ],
      INTEREST_IDS,
      8
    ),
    audiences: uniqueAllowed(
      [...tagAnalysis.audiences, ...(Array.isArray(submitted.audiences) ? submitted.audiences : [])],
      TRAVEL_PARTY_IDS,
      4
    ),
    vibes: uniqueAllowed(
      [...tagAnalysis.vibes, ...(Array.isArray(submitted.vibes) ? submitted.vibes : [])],
      VIBE_IDS,
      3
    ),
    needs: uniqueAllowed(
      [...tagAnalysis.needs, ...(Array.isArray(submitted.needs) ? submitted.needs : [])],
      NEED_IDS,
      NEED_IDS.length
    ),
    budgetLevel: normalizeBudget(content?.budget, { allowFlexible: false }) || tagAnalysis.budgetLevel,
  };
}

const buildTravelContentFacets = buildRecommendationFacets;

module.exports = {
  BUDGET_IDS,
  CATEGORY_IDS,
  INTEREST_IDS,
  NEED_IDS,
  POST_BUDGET_IDS,
  TAG_IDS,
  TRAVEL_PARTY_IDS,
  VIBE_IDS,
  analyzeTagValues,
  buildRecommendationFacets,
  buildTravelContentFacets,
  getCategoryLabel,
  isSmartProfileComplete,
  mapLegacyInterests,
  normalizeBudget,
  normalizeCategoryId,
  normalizeRecommendationTags,
  normalizeSmartProfile,
  tagsMatchCategory,
  taxonomy,
  uniqueAllowed,
};
