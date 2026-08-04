const taxonomy = require('./travelTaxonomy.generated.json');

const ids = (items = []) => Object.freeze(items.map((item) => item.id));
const byId = (items = []) => Object.freeze(Object.fromEntries(items.map((item) => [item.id, item])));

const INTEREST_IDS = ids(taxonomy.interests);
const BUDGET_IDS = ids(taxonomy.budgets);
const POST_BUDGET_IDS = Object.freeze(taxonomy.budgets
  .filter((item) => item.postApplicable)
  .map((item) => item.id));
const TRAVEL_PARTY_IDS = ids(taxonomy.travelParties);
const VIBE_IDS = ids(taxonomy.vibes);
const TRAVELER_STYLE_IDS = ids(taxonomy.travelerStyles);
const PACE_IDS = ids(taxonomy.paces);
const NEED_IDS = ids(taxonomy.needs);
const SEASON_IDS = ids(taxonomy.seasons);
const ENVIRONMENT_IDS = ids(taxonomy.environments);
const ROUTE_DIFFICULTY_IDS = ids(taxonomy.routeDifficulties);
const ROUTE_EXPERIENCE_IDS = ids(taxonomy.routeExperienceLevels);
const TRANSPORT_MODE_IDS = ids(taxonomy.transportModes);
const CATEGORY_IDS = ids(taxonomy.categories);
const TAG_IDS = ids(taxonomy.tags);

const CATEGORY_BY_ID = byId(taxonomy.categories);
const TAG_BY_ID = byId(taxonomy.tags);
const CATEGORY_ID_BY_LABEL = Object.freeze(Object.fromEntries(
  taxonomy.categories.map((item) => [item.label, item.id])
));
const TAG_ID_BY_ALIAS = Object.freeze({
  ...Object.fromEntries(taxonomy.tags.map((item) => [item.label, item.id])),
  ...(taxonomy.legacy?.tagAliases || {}),
});

function uniqueAllowed(values, allowed, maximum = allowed.length) {
  if (!Array.isArray(values)) return [];
  const allowedSet = new Set(allowed);
  return Array.from(new Set(values
    .filter((value) => typeof value === 'string')
    .map((value) => value.trim())
    .filter((value) => allowedSet.has(value))))
    .slice(0, maximum);
}

function normalizeAliasedId(value, allowed, aliases = {}) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (allowed.includes(text)) return text;
  const alias = aliases[text];
  return allowed.includes(alias) ? alias : '';
}

function normalizeBudget(value, { allowFlexible = true } = {}) {
  const normalized = normalizeAliasedId(value, BUDGET_IDS, taxonomy.legacy?.budgetAliases);
  return normalized === 'flexible' && !allowFlexible ? '' : normalized;
}

function normalizeCategoryId(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (CATEGORY_IDS.includes(text)) return text;
  return CATEGORY_ID_BY_LABEL[text] || taxonomy.legacy?.categoryAliases?.[text] || '';
}

function normalizeCategoryIds(values, maximum = CATEGORY_IDS.length) {
  return uniqueAllowed((values || []).map(normalizeCategoryId), CATEGORY_IDS, maximum);
}

function getCategoryLabel(value) {
  return CATEGORY_BY_ID[normalizeCategoryId(value)]?.label || '';
}

function analyzeTagValues(values) {
  const collected = {
    tagIds: [], interests: [], vibes: [], travelerStyles: [], needs: [], audiences: [], seasons: [], environments: [],
  };
  let budgetLevel = '';
  let recognized = true;
  let routeDifficulty = '';

  for (const raw of Array.isArray(values) ? values : []) {
    const value = typeof raw === 'string' ? raw.trim() : '';
    const tagId = TAG_BY_ID[value] ? value : TAG_ID_BY_ALIAS[value];
    const tag = TAG_BY_ID[tagId];
    if (tag) {
      collected.tagIds.push(tag.id);
      for (const field of ['interests', 'vibes', 'travelerStyles', 'needs', 'audiences', 'seasons', 'environments']) {
        collected[field].push(...(tag[field] || []));
      }
      continue;
    }
    const attribute = taxonomy.legacy?.attributeTagAliases?.[value];
    if (attribute) {
      if (attribute.interest) collected.interests.push(attribute.interest);
      if (attribute.travelerStyle) collected.travelerStyles.push(attribute.travelerStyle);
      if (attribute.season) collected.seasons.push(attribute.season);
      if (attribute.environment) collected.environments.push(attribute.environment);
      if (attribute.difficulty) routeDifficulty ||= attribute.difficulty;
      continue;
    }
    if ((taxonomy.legacy?.ignoredTagAliases || []).includes(value)) continue;
    const legacyNeeds = taxonomy.legacy?.tagNeeds?.[value];
    const legacyAudiences = taxonomy.legacy?.tagAudiences?.[value];
    const legacyBudget = taxonomy.legacy?.tagBudgets?.[value];
    if (legacyNeeds) collected.needs.push(...legacyNeeds);
    else if (legacyAudiences) collected.audiences.push(...legacyAudiences);
    else if (legacyBudget) budgetLevel ||= legacyBudget;
    else recognized = false;
  }

  return {
    recognized,
    tagIds: uniqueAllowed(collected.tagIds, TAG_IDS, 20),
    interests: uniqueAllowed(collected.interests, INTEREST_IDS),
    vibes: uniqueAllowed(collected.vibes, VIBE_IDS),
    travelerStyles: uniqueAllowed(collected.travelerStyles, TRAVELER_STYLE_IDS),
    needs: uniqueAllowed(collected.needs, NEED_IDS),
    audiences: uniqueAllowed(collected.audiences, TRAVEL_PARTY_IDS),
    seasons: uniqueAllowed(collected.seasons, SEASON_IDS),
    environments: uniqueAllowed(collected.environments, ENVIRONMENT_IDS),
    budgetLevel,
    routeDifficulty,
  };
}

const normalizeRecommendationTags = (values) => analyzeTagValues(values).tagIds;

function tagsMatchCategory(values, categoryValue) {
  const categoryId = normalizeCategoryId(categoryValue);
  const analysis = analyzeTagValues(values);
  return Boolean(categoryId) && analysis.recognized && analysis.tagIds.every(
    (tagId) => TAG_BY_ID[tagId]?.categoryId === categoryId
  );
}

function categoryFromLegacyClassification(categoryValue, tagValues) {
  const raw = typeof categoryValue === 'string' ? categoryValue.trim() : '';
  const normalized = normalizeCategoryId(raw);
  if (!['attractions', 'אטרקציות'].includes(raw)) return normalized;
  const categories = Array.from(new Set(analyzeTagValues(tagValues).tagIds
    .map((tagId) => TAG_BY_ID[tagId]?.categoryId)
    .filter(Boolean)));
  return categories.length === 1 ? categories[0] : normalized;
}

function mapLegacyInterests(values) {
  const output = [];
  const aliases = taxonomy.legacy?.interestAliases || {};
  for (const value of Array.isArray(values) ? values : []) {
    if (INTEREST_IDS.includes(value)) output.push(value);
    output.push(...(aliases[value] || []));
    const categoryId = normalizeCategoryId(value);
    if (categoryId) output.push(...(CATEGORY_BY_ID[categoryId]?.interests || []));
  }
  output.push(...analyzeTagValues(values).interests);
  return uniqueAllowed(output, INTEREST_IDS, 8);
}

function normalizeSmartProfile(value = {}) {
  const partyAliases = taxonomy.legacy?.partyAliases || {};
  const vibeAliases = taxonomy.legacy?.vibeAliases || {};
  const styleAliases = taxonomy.legacy?.travelerStyleAliases || {};
  const needAliases = taxonomy.legacy?.needAliases || {};
  const legacyParty = partyAliases[value.travelStyleTag] || partyAliases[value.tripType];
  const rawVibes = [
    ...(Array.isArray(value.vibe) ? value.vibe : []),
    ...(Array.isArray(value.vibes) ? value.vibes : []),
  ].filter(Boolean);
  const rawStyles = [
    ...(Array.isArray(value.travelerStyles) ? value.travelerStyles : []),
    value.travelStyleTag,
    ...rawVibes.filter((entry) => styleAliases[entry] || TRAVELER_STYLE_IDS.includes(entry)),
  ].filter(Boolean);
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
    vibe: uniqueAllowed(rawVibes.map((entry) => vibeAliases[entry] || entry), VIBE_IDS, 3),
    travelerStyles: uniqueAllowed(rawStyles.map((entry) => styleAliases[entry] || entry), TRAVELER_STYLE_IDS, 3),
    pace: normalizeAliasedId(value.pace, PACE_IDS),
    needs: uniqueAllowed(
      [
        ...(Array.isArray(value.needs) ? value.needs : []),
        ...tagAnalysis.needs,
        ...legacyConstraints,
      ].map((entry) => needAliases[entry] || entry),
      NEED_IDS
    ),
  };
}

function isSmartProfileComplete(value) {
  if (!value?.completedAt || value.setupRequired === true) return false;
  const profile = normalizeSmartProfile(value);
  return profile.interests.length >= 3 && profile.interests.length <= 8 &&
    Boolean(profile.budget) && profile.travelParties.length >= 1;
}

function buildTravelContentFacets(content, submitted = {}) {
  const categoryIds = normalizeCategoryIds([
    ...(Array.isArray(content?.categoryIds) ? content.categoryIds : []),
    content?.categoryId || content?.category,
  ].filter(Boolean));
  const categoryInterests = categoryIds.flatMap((id) => CATEGORY_BY_ID[id]?.interests || []);
  const tagAnalysis = analyzeTagValues(content?.tags || content?.subcategoryIds);
  const value = (field) => Array.isArray(submitted[field]) ? submitted[field] : [];
  return {
    interests: uniqueAllowed([...value('interests'), ...categoryInterests, ...tagAnalysis.interests], INTEREST_IDS, 12),
    audiences: uniqueAllowed([...tagAnalysis.audiences, ...value('audiences')], TRAVEL_PARTY_IDS, 6),
    vibes: uniqueAllowed([...tagAnalysis.vibes, ...value('vibes')], VIBE_IDS, 4),
    travelerStyles: uniqueAllowed(
      [...tagAnalysis.travelerStyles, ...value('travelerStyles')], TRAVELER_STYLE_IDS, 4
    ),
    needs: uniqueAllowed([...tagAnalysis.needs, ...value('needs')], NEED_IDS),
    budgetLevel: normalizeBudget(content?.budget || submitted.budgetLevel, { allowFlexible: false }) || tagAnalysis.budgetLevel,
    seasons: uniqueAllowed([...tagAnalysis.seasons, ...value('seasons')], SEASON_IDS),
    environments: uniqueAllowed([...tagAnalysis.environments, ...value('environments')], ENVIRONMENT_IDS),
  };
}

const buildRecommendationFacets = buildTravelContentFacets;

module.exports = {
  BUDGET_IDS,
  CATEGORY_IDS,
  ENVIRONMENT_IDS,
  INTEREST_IDS,
  NEED_IDS,
  PACE_IDS,
  POST_BUDGET_IDS,
  ROUTE_DIFFICULTY_IDS,
  ROUTE_EXPERIENCE_IDS,
  SEASON_IDS,
  TAG_IDS,
  TRANSPORT_MODE_IDS,
  TRAVELER_STYLE_IDS,
  TRAVEL_PARTY_IDS,
  VIBE_IDS,
  analyzeTagValues,
  buildRecommendationFacets,
  buildTravelContentFacets,
  categoryFromLegacyClassification,
  getCategoryLabel,
  isSmartProfileComplete,
  mapLegacyInterests,
  normalizeAliasedId,
  normalizeBudget,
  normalizeCategoryId,
  normalizeCategoryIds,
  normalizeRecommendationTags,
  normalizeSmartProfile,
  tagsMatchCategory,
  taxonomy,
  uniqueAllowed,
};
