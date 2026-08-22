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
const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
};
const RECOMMENDATION_CATALOG = deepFreeze(taxonomy.recommendationCatalog || {});
const RECOMMENDATION_CATEGORIES = Object.freeze(
  [...(RECOMMENDATION_CATALOG.categories || [])].sort((left, right) => left.order - right.order)
);
const RECOMMENDATION_CATEGORY_ORDER_BY_ID = Object.freeze(Object.fromEntries(
  RECOMMENDATION_CATEGORIES.map((item) => [item.id, item.order])
));
const RECOMMENDATION_SUBCATEGORIES = Object.freeze(
  [...(RECOMMENDATION_CATALOG.subcategories || [])].sort((left, right) => (
    RECOMMENDATION_CATEGORY_ORDER_BY_ID[left.categoryId] - RECOMMENDATION_CATEGORY_ORDER_BY_ID[right.categoryId]
      || left.order - right.order
  ))
);

const CATEGORY_BY_ID = byId(taxonomy.categories);
const TAG_BY_ID = byId(taxonomy.tags);
const RECOMMENDATION_CATEGORY_BY_ID = byId(RECOMMENDATION_CATEGORIES);
const RECOMMENDATION_CATEGORY_ID_BY_LABEL = Object.freeze(Object.fromEntries(
  RECOMMENDATION_CATEGORIES.map((item) => [item.label, item.id])
));
const RECOMMENDATION_SUBCATEGORY_BY_ID = byId(RECOMMENDATION_SUBCATEGORIES);
const TRAVELER_STYLE_BY_ID = byId(taxonomy.travelerStyles);
const RECOMMENDATION_ATTRIBUTE_RULES = taxonomy.contentAttributeRules?.recommendations || {};
const RECOMMENDATION_VIBE_TAG_IDS = new Set(RECOMMENDATION_ATTRIBUTE_RULES.vibeTagIds || []);
const RECOMMENDATION_ENVIRONMENT_TAG_IDS = new Set(RECOMMENDATION_ATTRIBUTE_RULES.environmentTagIds || []);
const CATEGORY_ID_BY_LABEL = Object.freeze(Object.fromEntries(
  taxonomy.categories.map((item) => [item.label, item.id])
));
const TAG_ID_BY_ALIAS = Object.freeze({
  ...Object.fromEntries(taxonomy.tags.map((item) => [item.label, item.id])),
  ...(taxonomy.legacy?.tagAliases || {}),
});

const normalizedSearchText = (value) => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0591-\u05BD\u05BF\u05C1-\u05C2\u05C4-\u05C5\u05C7]/g, '')
  .trim()
  .toLocaleLowerCase('he');

const RECOMMENDATION_SUBCATEGORY_IDS_BY_ALIAS = Object.freeze(RECOMMENDATION_SUBCATEGORIES.reduce(
  (lookupByAlias, item) => {
    for (const value of [item.id, item.label, ...(item.searchAliases || [])]) {
      const alias = normalizedSearchText(value);
      lookupByAlias[alias] ||= [];
      if (!lookupByAlias[alias].includes(item.id)) lookupByAlias[alias].push(item.id);
    }
    return lookupByAlias;
  },
  {}
));

function normalizeRecommendationCategory(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  return RECOMMENDATION_CATEGORY_BY_ID[text]
    ? text
    : RECOMMENDATION_CATEGORY_ID_BY_LABEL[text] || '';
}

function normalizeRecommendationSubcategories(values, categoryValue) {
  const categoryWasSupplied = categoryValue != null && String(categoryValue).trim() !== '';
  const categoryId = categoryWasSupplied ? normalizeRecommendationCategory(categoryValue) : '';
  if (categoryWasSupplied && !categoryId) return [];
  const maximum = RECOMMENDATION_CATALOG.selection?.subcategories?.max || 3;
  const output = [];
  for (const raw of Array.isArray(values) ? values : []) {
    const candidateIds = RECOMMENDATION_SUBCATEGORY_BY_ID[raw]
      ? [raw]
      : RECOMMENDATION_SUBCATEGORY_IDS_BY_ALIAS[normalizedSearchText(raw)] || [];
    const id = categoryId
      ? candidateIds.find((candidateId) => RECOMMENDATION_SUBCATEGORY_BY_ID[candidateId]?.categoryId === categoryId)
      : candidateIds.length === 1 ? candidateIds[0] : undefined;
    const item = RECOMMENDATION_SUBCATEGORY_BY_ID[id];
    if (!item || (categoryId && item.categoryId !== categoryId) || output.includes(id)) continue;
    output.push(id);
    if (output.length === maximum) break;
  }
  return output;
}

function isRecommendationClassificationValid({
  categoryId: categoryValue,
  subcategoryIds: values,
  customSubcategoryLabel = '',
} = {}) {
  const categoryId = normalizeRecommendationCategory(categoryValue);
  const rawValues = Array.isArray(values) ? values : [];
  const normalized = normalizeRecommendationSubcategories(rawValues, categoryId);
  const minimum = RECOMMENDATION_CATALOG.selection?.subcategories?.min || 1;
  const maximum = RECOMMENDATION_CATALOG.selection?.subcategories?.max || 3;
  if (rawValues.some((value) => typeof value !== 'string' || !value.trim())) return false;
  const uniqueRaw = new Set(rawValues.filter((value) => typeof value === 'string').map((value) => value.trim()));
  if (!categoryId || normalized.length < minimum || normalized.length > maximum || normalized.length !== uniqueRaw.size) {
    return false;
  }
  const includesOther = normalized.some((id) => RECOMMENDATION_SUBCATEGORY_BY_ID[id]?.isOther === true);
  if (customSubcategoryLabel != null && typeof customSubcategoryLabel !== 'string') return false;
  const customLabelLength = typeof customSubcategoryLabel === 'string' ? customSubcategoryLabel.trim().length : 0;
  const customRules = RECOMMENDATION_CATALOG.selection?.customLabel || { minLength: 2, maxLength: 40 };
  return includesOther
    ? customLabelLength >= customRules.minLength && customLabelLength <= customRules.maxLength
    : customLabelLength === 0;
}

function searchRecommendationCatalog(query, { categoryId: categoryValue = '', limit = 20 } = {}) {
  const needle = normalizedSearchText(query);
  if (!needle) return [];
  const categoryWasSupplied = categoryValue != null && String(categoryValue).trim() !== '';
  const categoryId = categoryWasSupplied ? normalizeRecommendationCategory(categoryValue) : '';
  if (categoryWasSupplied && !categoryId) return [];
  return RECOMMENDATION_SUBCATEGORIES
    .filter((item) => !categoryId || item.categoryId === categoryId)
    .map((item) => {
      const values = [item.label, item.id, ...(item.searchAliases || [])].map(normalizedSearchText);
      const exact = values.some((value) => value === needle);
      const prefix = values.some((value) => value.startsWith(needle));
      const contains = values.some((value) => value.includes(needle));
      return { item, score: exact ? 0 : prefix ? 1 : contains ? 2 : 3 };
    })
    .filter(({ score }) => score < 3)
    .sort((left, right) => left.score - right.score
      || RECOMMENDATION_CATEGORY_ORDER_BY_ID[left.item.categoryId]
        - RECOMMENDATION_CATEGORY_ORDER_BY_ID[right.item.categoryId]
      || left.item.order - right.item.order)
    .slice(0, Math.max(0, Math.min(Number(limit) || 20, 50)))
    .map(({ item }) => item);
}

function suggestClassificationFromGoogleTypes({ placeId, primaryType = '', types = [] } = {}) {
  if (typeof placeId !== 'string' || !placeId.trim()) return [];
  const providerTypes = Array.from(new Set([primaryType, ...(Array.isArray(types) ? types : [])]
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => value.trim())));
  const seen = new Set();
  const output = [];
  for (const providerType of providerTypes) {
    for (const candidate of RECOMMENDATION_CATALOG.googlePlaceTypeMappings?.[providerType] || []) {
      const subcategoryIds = normalizeRecommendationSubcategories(candidate.subcategoryIds, candidate.categoryId);
      if (!subcategoryIds.length || subcategoryIds.some((id) => RECOMMENDATION_SUBCATEGORY_BY_ID[id]?.isOther)) continue;
      const key = `${candidate.categoryId}:${subcategoryIds.join('|')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      output.push({
        categoryId: candidate.categoryId,
        subcategoryIds,
        providerType,
        isPrimary: providerType === primaryType,
        isSuggestion: true,
      });
    }
  }
  return output;
}

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

function recommendationAttributeRequirements(values) {
  const tagIds = normalizeRecommendationTags(values);
  const needRules = RECOMMENDATION_ATTRIBUTE_RULES.needTagIds || {};
  return {
    vibes: tagIds.some((tagId) => RECOMMENDATION_VIBE_TAG_IDS.has(tagId)),
    environment: tagIds.some((tagId) => RECOMMENDATION_ENVIRONMENT_TAG_IDS.has(tagId)),
    needs: NEED_IDS.filter((needId) => {
      const supportedTags = new Set(needRules[needId] || []);
      return tagIds.some((tagId) => supportedTags.has(tagId));
    }),
  };
}

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

function buildTravelContentFacets(content, submitted = {}, { surface = 'recommendation' } = {}) {
  const isRoute = surface === 'route';
  const categoryIds = normalizeCategoryIds([
    ...(Array.isArray(content?.categoryIds) ? content.categoryIds : []),
    content?.categoryId || content?.category,
  ].filter(Boolean));
  const categoryInterests = categoryIds.flatMap((id) => CATEGORY_BY_ID[id]?.interests || []);
  const tagAnalysis = analyzeTagValues(content?.tags || content?.subcategoryIds);
  const value = (field) => Array.isArray(submitted[field]) ? submitted[field] : [];
  const travelerStyles = isRoute
    ? uniqueAllowed([...tagAnalysis.travelerStyles, ...value('travelerStyles')], TRAVELER_STYLE_IDS, 4)
    : [];
  const styleInterests = travelerStyles.flatMap(
    (styleId) => TRAVELER_STYLE_BY_ID[styleId]?.relatedInterests || []
  );
  const needs = uniqueAllowed([...tagAnalysis.needs, ...value('needs')], NEED_IDS);
  const audienceScope = submitted.audienceScope === 'all' ? 'all' : 'selected';
  return {
    interests: uniqueAllowed([...categoryInterests, ...tagAnalysis.interests, ...styleInterests], INTEREST_IDS, 12),
    audienceScope,
    audiences: audienceScope === 'all'
      ? []
      : uniqueAllowed([...tagAnalysis.audiences, ...value('audiences')], TRAVEL_PARTY_IDS, 6),
    vibes: uniqueAllowed([...tagAnalysis.vibes, ...value('vibes')], VIBE_IDS, 4),
    travelerStyles,
    needs,
    needsScope: needs.length ? (isRoute ? 'entire_route' : 'recommendation') : '',
	budgetLevel: normalizeBudget(content?.budget || submitted.budgetLevel, { allowFlexible: isRoute }) || tagAnalysis.budgetLevel,
    seasons: isRoute ? uniqueAllowed([...tagAnalysis.seasons, ...value('seasons')], SEASON_IDS) : [],
    environments: uniqueAllowed([...tagAnalysis.environments, ...value('environments')], ENVIRONMENT_IDS),
  };
}

const buildRecommendationFacets = (content, submitted) =>
  buildTravelContentFacets(content, submitted, { surface: 'recommendation' });

module.exports = {
  BUDGET_IDS,
  CATEGORY_IDS,
  ENVIRONMENT_IDS,
  INTEREST_IDS,
  NEED_IDS,
  PACE_IDS,
  POST_BUDGET_IDS,
  RECOMMENDATION_CATALOG,
  RECOMMENDATION_CATEGORIES,
  RECOMMENDATION_SUBCATEGORIES,
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
  isRecommendationClassificationValid,
  mapLegacyInterests,
  normalizeAliasedId,
  normalizeBudget,
  normalizeCategoryId,
  normalizeCategoryIds,
  normalizeRecommendationTags,
  normalizeRecommendationCategory,
  normalizeRecommendationSubcategories,
  normalizeSmartProfile,
  recommendationAttributeRequirements,
  searchRecommendationCatalog,
  suggestClassificationFromGoogleTypes,
  tagsMatchCategory,
  taxonomy,
  uniqueAllowed,
};
