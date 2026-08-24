import taxonomy from './travelTaxonomy.generated.json';

const asOption = (item) => ({
  value: item.id,
  label: item.label,
  ...(item.helper ? { helper: item.helper } : {}),
});
const options = (key) => (taxonomy[key] || []).map(asOption);
const ids = (items) => new Set(items.map((item) => item.value));
const lookup = (items) => Object.fromEntries(items.map((item) => [item.value, item]));

export const INTERESTS = options('interests');
export const BUDGETS = options('budgets');
export const POST_BUDGETS = taxonomy.budgets
  .filter((item) => item.postApplicable)
  .map((item) => ({ ...asOption(item), postLabel: item.postLabel || item.label }));
export const TRAVEL_PARTIES = options('travelParties');
export const VIBES = options('vibes');
export const TRAVELER_STYLES = (taxonomy.travelerStyles || []).map((item) => ({
  ...asOption(item),
  relatedInterests: [...(item.relatedInterests || [])],
}));
export const PACES = options('paces');
export const NEEDS = options('needs');
export const SEASONS = options('seasons');
export const ENVIRONMENTS = options('environments');
export const ROUTE_DIFFICULTIES = options('routeDifficulties');
export const ROUTE_EXPERIENCE_LEVELS = options('routeExperienceLevels');
export const TRANSPORT_MODES = options('transportModes');
export const SERVICE_GROUPS = options('serviceGroups');
export const CATEGORIES = taxonomy.categories.map((item) => ({
  id: item.id,
  value: item.id,
  label: item.label,
  icon: item.icon,
  interests: [...(item.interests || [])],
}));
export const TAGS = taxonomy.tags.map((item) => ({
  ...item,
  interests: [...(item.interests || [])],
  vibes: [...(item.vibes || [])],
  travelerStyles: [...(item.travelerStyles || [])],
  seasons: [...(item.seasons || [])],
  environments: [...(item.environments || [])],
}));

const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
};

export const RECOMMENDATION_CATALOG = deepFreeze(taxonomy.recommendationCatalog || {});
export const ONBOARDING_INTERESTS = Object.freeze(
  (RECOMMENDATION_CATALOG.interests || []).map(asOption)
);
export const RECOMMENDATION_CATEGORIES = Object.freeze(
  [...(RECOMMENDATION_CATALOG.categories || [])].sort((left, right) => left.order - right.order)
);
const recommendationCategoryOrderById = Object.fromEntries(
  RECOMMENDATION_CATEGORIES.map((item) => [item.id, item.order])
);
export const RECOMMENDATION_SUBCATEGORIES = Object.freeze(
  [...(RECOMMENDATION_CATALOG.subcategories || [])].sort((left, right) => (
    recommendationCategoryOrderById[left.categoryId] - recommendationCategoryOrderById[right.categoryId]
      || left.order - right.order
  ))
);

const recommendationCategoryById = Object.fromEntries(
  RECOMMENDATION_CATEGORIES.map((item) => [item.id, item])
);
const recommendationCategoryIdByLabel = Object.fromEntries(
  RECOMMENDATION_CATEGORIES.map((item) => [item.label, item.id])
);
const recommendationSubcategoryById = Object.fromEntries(
  RECOMMENDATION_SUBCATEGORIES.map((item) => [item.id, item])
);

const normalizedSearchText = (value) => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0591-\u05BD\u05BF\u05C1-\u05C2\u05C4-\u05C5\u05C7]/g, '')
  .trim()
  .toLocaleLowerCase('he');

const recommendationSubcategoryIdsByAlias = RECOMMENDATION_SUBCATEGORIES.reduce((lookupByAlias, item) => {
  for (const value of [item.id, item.label, ...(item.searchAliases || [])]) {
    const alias = normalizedSearchText(value);
    lookupByAlias[alias] ||= [];
    if (!lookupByAlias[alias].includes(item.id)) lookupByAlias[alias].push(item.id);
  }
  return lookupByAlias;
}, {});

export function normalizeRecommendationCategory(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  return recommendationCategoryById[text]
    ? text
    : recommendationCategoryIdByLabel[text] || '';
}

export function normalizeRecommendationSubcategories(values, categoryValue) {
  const categoryWasSupplied = categoryValue != null && String(categoryValue).trim() !== '';
  const categoryId = categoryWasSupplied ? normalizeRecommendationCategory(categoryValue) : '';
  if (categoryWasSupplied && !categoryId) return [];
  const maximum = RECOMMENDATION_CATALOG.selection?.subcategories?.max || 3;
  const output = [];
  for (const raw of Array.isArray(values) ? values : []) {
    const candidateIds = recommendationSubcategoryById[raw]
      ? [raw]
      : recommendationSubcategoryIdsByAlias[normalizedSearchText(raw)] || [];
    const id = categoryId
      ? candidateIds.find((candidateId) => recommendationSubcategoryById[candidateId]?.categoryId === categoryId)
      : candidateIds.length === 1 ? candidateIds[0] : undefined;
    const item = recommendationSubcategoryById[id];
    if (!item || (categoryId && item.categoryId !== categoryId) || output.includes(id)) continue;
    output.push(id);
    if (output.length === maximum) break;
  }
  return output;
}

export function isRecommendationClassificationValid({
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
  const includesOther = normalized.some((id) => recommendationSubcategoryById[id]?.isOther === true);
  if (customSubcategoryLabel != null && typeof customSubcategoryLabel !== 'string') return false;
  const customLabelLength = typeof customSubcategoryLabel === 'string' ? customSubcategoryLabel.trim().length : 0;
  const customRules = RECOMMENDATION_CATALOG.selection?.customLabel || { minLength: 2, maxLength: 40 };
  return includesOther
    ? customLabelLength >= customRules.minLength && customLabelLength <= customRules.maxLength
    : customLabelLength === 0;
}

export function searchRecommendationCatalog(query, { categoryId: categoryValue = '', limit = 20 } = {}) {
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
      || recommendationCategoryOrderById[left.item.categoryId] - recommendationCategoryOrderById[right.item.categoryId]
      || left.item.order - right.item.order)
    .slice(0, Math.max(0, Math.min(Number(limit) || 20, 50)))
    .map(({ item }) => item);
}

export function suggestClassificationFromGoogleTypes({ placeId, primaryType = '', types = [] } = {}) {
  if (typeof placeId !== 'string' || !placeId.trim()) return [];
  const providerTypes = Array.from(new Set([primaryType, ...(Array.isArray(types) ? types : [])]
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => value.trim())));
  const seen = new Set();
  const output = [];
  for (const providerType of providerTypes) {
    for (const candidate of RECOMMENDATION_CATALOG.googlePlaceTypeMappings?.[providerType] || []) {
      const subcategoryIds = normalizeRecommendationSubcategories(candidate.subcategoryIds, candidate.categoryId);
      if (!subcategoryIds.length || subcategoryIds.some((id) => recommendationSubcategoryById[id]?.isOther)) continue;
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

export const TAG_OPTIONS_BY_CATEGORY = Object.fromEntries(CATEGORIES.map((category) => [
  category.id,
  TAGS.filter((tag) => tag.categoryId === category.id && tag.selectable !== false),
]));
export const SERVICE_TAG_OPTIONS_BY_GROUP = Object.fromEntries(SERVICE_GROUPS.map((group) => [
  group.value,
  TAGS.filter((tag) => tag.categoryId === 'services' && tag.groupId === group.value),
]));

const interestIds = ids(INTERESTS);
const budgetById = lookup(BUDGETS);
const categoryById = Object.fromEntries(CATEGORIES.map((item) => [item.id, item]));
const categoryIdByLabel = Object.fromEntries(CATEGORIES.map((item) => [item.label, item.id]));
const tagById = Object.fromEntries(TAGS.map((tag) => [tag.id, tag]));
const tagIdByAlias = {
  ...Object.fromEntries(TAGS.map((tag) => [tag.label, tag.id])),
  ...(taxonomy.legacy?.tagAliases || {}),
};
const recommendationAttributeRules = taxonomy.contentAttributeRules?.recommendations || {};
const recommendationVibeTags = new Set(recommendationAttributeRules.vibeTagIds || []);
const recommendationEnvironmentTags = new Set(recommendationAttributeRules.environmentTagIds || []);

function normalizeFromOptions(value, optionList, aliases = {}) {
  const text = typeof value === 'string' ? value.trim() : '';
  const allowed = new Set(optionList.map((item) => item.value));
  if (allowed.has(text)) return text;
  return allowed.has(aliases[text]) ? aliases[text] : '';
}

export function normalizeBudgetId(value, { allowFlexible = true } = {}) {
  const normalized = budgetById[value]?.value || taxonomy.legacy?.budgetAliases?.[String(value || '').trim()] || '';
  return normalized === 'flexible' && !allowFlexible ? '' : normalized;
}

export function getBudgetLabel(value, { forPost = true } = {}) {
  const option = budgetById[normalizeBudgetId(value)];
  if (!option) return typeof value === 'string' ? value : '';
  const source = taxonomy.budgets.find((item) => item.id === option.value);
  return forPost ? source?.postLabel || option.label : option.label;
}

export function normalizeCategoryId(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  return categoryById[text]
    ? text
    : categoryIdByLabel[text] || taxonomy.legacy?.categoryAliases?.[text] || '';
}

export function getCategoryLabel(value) {
  return categoryById[normalizeCategoryId(value)]?.label || (typeof value === 'string' ? value : '');
}

export function analyzeTagValues(values) {
  const result = {
    tagIds: [], interests: [], vibes: [], travelerStyles: [], needs: [], audiences: [], seasons: [], environments: [],
  };
  let budgetLevel = '';
  let recognized = true;
  for (const raw of Array.isArray(values) ? values : []) {
    const value = typeof raw === 'string' ? raw.trim() : '';
    const tag = tagById[tagById[value] ? value : tagIdByAlias[value]];
    if (tag) {
      result.tagIds.push(tag.id);
      for (const field of ['interests', 'vibes', 'travelerStyles', 'needs', 'audiences', 'seasons', 'environments']) {
        result[field].push(...(tag[field] || []));
      }
      continue;
    }
    const attribute = taxonomy.legacy?.attributeTagAliases?.[value];
    if (attribute) {
      if (attribute.interest) result.interests.push(attribute.interest);
      if (attribute.travelerStyle) result.travelerStyles.push(attribute.travelerStyle);
      if (attribute.season) result.seasons.push(attribute.season);
      if (attribute.environment) result.environments.push(attribute.environment);
      continue;
    }
    if ((taxonomy.legacy?.ignoredTagAliases || []).includes(value)) continue;
    const legacyNeeds = taxonomy.legacy?.tagNeeds?.[value];
    const legacyAudiences = taxonomy.legacy?.tagAudiences?.[value];
    const legacyBudget = taxonomy.legacy?.tagBudgets?.[value];
    if (legacyNeeds) result.needs.push(...legacyNeeds);
    else if (legacyAudiences) result.audiences.push(...legacyAudiences);
    else if (legacyBudget) budgetLevel ||= legacyBudget;
    else recognized = false;
  }
  return {
    recognized,
    ...Object.fromEntries(Object.entries(result).map(([key, entries]) => [key, Array.from(new Set(entries))])),
    budgetLevel,
  };
}

export const normalizeTagIds = (values) => analyzeTagValues(values).tagIds;

export function getRecommendationAttributeRequirements(values) {
  const tagIds = normalizeTagIds(values);
  const needRules = recommendationAttributeRules.needTagIds || {};
  return {
    vibes: tagIds.some((tagId) => recommendationVibeTags.has(tagId)),
    environment: tagIds.some((tagId) => recommendationEnvironmentTags.has(tagId)),
    needs: NEEDS.filter((need) => {
      const supported = new Set(needRules[need.value] || []);
      return tagIds.some((tagId) => supported.has(tagId));
    }),
  };
}

export function getTagLabel(value) {
  const id = tagById[value] ? value : tagIdByAlias[value];
  return tagById[id]?.label || (typeof value === 'string' ? value : '');
}

export function suggestedInterestIds(categoryId, tags = []) {
  const categoryInterests = categoryById[normalizeCategoryId(categoryId)]?.interests || [];
  return Array.from(new Set([...categoryInterests, ...analyzeTagValues(tags).interests]))
    .filter((value) => interestIds.has(value))
    .slice(0, 8);
}

export const normalizeRouteDifficultyId = (value) => normalizeFromOptions(
  value, ROUTE_DIFFICULTIES, taxonomy.legacy?.routeDifficultyAliases
);
export const normalizeRouteExperienceId = (value) => normalizeFromOptions(
  value, ROUTE_EXPERIENCE_LEVELS, taxonomy.legacy?.routeExperienceAliases
);
export const normalizeTransportModeId = (value) => normalizeFromOptions(
  value, TRANSPORT_MODES, taxonomy.legacy?.transportModeAliases
);

export function getOptionLabel(optionList, value) {
  return optionList.find((item) => item.value === value)?.label || String(value || '');
}

export const TRAVEL_TAXONOMY_VERSION = taxonomy.version;
export const TRAVEL_TAXONOMY = taxonomy;
