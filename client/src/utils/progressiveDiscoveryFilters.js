import {
  CATEGORIES,
  TAGS,
  TAG_OPTIONS_BY_CATEGORY,
  TRAVELER_STYLES,
} from '../constants/travelTaxonomy';
import {
  destinationSearchRank,
  normalizeDestinationText,
} from './destinationSearch';

export const destinationKey = (destination) => (
  destination?.cityId
    ? `city:${destination.countryId}:${destination.cityId}`
    : `country:${destination?.countryId || ''}`
);

export function normalizeDestinationSearchText(value) {
  return normalizeDestinationText(value);
}

export function filterDestinationOptions(options, query, limit = 10) {
  const normalized = normalizeDestinationSearchText(query);
  if (normalized.length < 2) return [];
  const terms = normalized.split(' ').filter(Boolean);
  return (Array.isArray(options) ? options : [])
    .map((option) => ({
      option,
      rank: destinationSearchRank([
        option.name,
        option.countryName,
        option.label,
        option.names?.he,
        option.names?.en,
        option.countryNames?.he,
        option.countryNames?.en,
      ], query),
    }))
    .filter((entry) => entry.rank >= 0 && terms.length > 0)
    .sort((a, b) => {
      if (a.rank !== b.rank) return b.rank - a.rank;
      const aText = normalizeDestinationSearchText(a.option.label);
      const bText = normalizeDestinationSearchText(b.option.label);
      return aText.localeCompare(bText, 'he');
    })
    .slice(0, limit)
    .map((entry) => entry.option);
}

export function addDestinationSelection(current, option, maximum = 5) {
  const existing = Array.isArray(current) ? current : [];
  if (!option?.countryId) return { destinations: existing, blocked: false };
  const key = destinationKey(option);
  if (existing.some((entry) => destinationKey(entry) === key)) {
    return { destinations: existing, blocked: false };
  }

  let next;
  if (option.cityId) {
    const countryWasSelected = existing.some((entry) => (
      entry.countryId === option.countryId && !entry.cityId
    ));
    next = existing.filter((entry) => (
      entry.countryId !== option.countryId || (entry.cityId && !countryWasSelected)
    ));
  } else {
    next = existing.filter((entry) => entry.countryId !== option.countryId);
  }

  if (next.length >= maximum) return { destinations: existing, blocked: true };
  return {
    destinations: [...next, {
      countryId: option.countryId,
      cityId: option.cityId || '',
      label: option.label,
    }],
    blocked: false,
  };
}

export function removeDestinationSelection(current, key) {
  return (Array.isArray(current) ? current : []).filter((entry) => destinationKey(entry) !== key);
}

const optionId = (option) => option?.value || option?.id;

export function orderProgressiveOptions(options, selectedIds, relevantIds, {
  expanded = false,
  collapsedLimit = 6,
} = {}) {
  const selected = new Set(selectedIds || []);
  const relevant = new Set(relevantIds || []);
  const source = Array.isArray(options) ? options : [];
  const ordered = [...source].sort((a, b) => {
    const aId = optionId(a);
    const bId = optionId(b);
    const aRank = selected.has(aId) ? 0 : relevant.has(aId) ? 1 : 2;
    const bRank = selected.has(bId) ? 0 : relevant.has(bId) ? 1 : 2;
    return aRank - bRank || source.indexOf(a) - source.indexOf(b);
  });
  if (expanded) return { options: ordered, hiddenCount: 0 };

  const selectedOptions = ordered.filter((option) => selected.has(optionId(option)));
  const remainingSlots = Math.max(0, collapsedLimit - selectedOptions.length);
  const prioritized = ordered
    .filter((option) => !selected.has(optionId(option)))
    .slice(0, remainingSlots);
  const visible = [...selectedOptions, ...prioritized];
  return { options: visible, hiddenCount: Math.max(0, ordered.length - visible.length) };
}

export function getRelevantDiscoveryFacets(filters) {
  const categoryIds = new Set(filters?.categoryIds || []);
  const subcategoryIds = new Set(filters?.subcategoryIds || []);
  const categoryItems = CATEGORIES.filter((item) => categoryIds.has(item.id));
  const tagItems = TAGS.filter((item) => subcategoryIds.has(item.id));
  const interests = new Set(categoryItems.flatMap((item) => item.interests || []));
  tagItems.forEach((item) => (item.interests || []).forEach((id) => interests.add(id)));
  const travelerStyles = TRAVELER_STYLES
    .filter((item) => (item.relatedInterests || []).some((id) => interests.has(id)))
    .map((item) => item.value);

  return {
    interests: [...interests],
    vibes: Array.from(new Set(tagItems.flatMap((item) => item.vibes || []))),
    travelerStyles: Array.from(new Set([
      ...tagItems.flatMap((item) => item.travelerStyles || []),
      ...travelerStyles,
    ])),
    seasons: Array.from(new Set(tagItems.flatMap((item) => item.seasons || []))),
    environments: Array.from(new Set(tagItems.flatMap((item) => item.environments || []))),
  };
}

export function toggleDiscoveryCategory(filters, categoryId, maximum = 3) {
  const categoryIds = Array.isArray(filters?.categoryIds) ? filters.categoryIds : [];
  const removing = categoryIds.includes(categoryId);
  if (!removing && categoryIds.length >= maximum) {
    return { filters, blocked: true, removedSubcategoryCount: 0 };
  }
  const nextCategories = removing
    ? categoryIds.filter((id) => id !== categoryId)
    : [...categoryIds, categoryId];
  const removedIds = new Set((TAG_OPTIONS_BY_CATEGORY[categoryId] || []).map((tag) => tag.id));
  const previousSubcategories = Array.isArray(filters?.subcategoryIds) ? filters.subcategoryIds : [];
  const nextSubcategories = removing
    ? previousSubcategories.filter((id) => !removedIds.has(id))
    : previousSubcategories;
  return {
    filters: {
      ...filters,
      categoryIds: nextCategories,
      subcategoryIds: nextSubcategories,
    },
    blocked: false,
    removedSubcategoryCount: previousSubcategories.length - nextSubcategories.length,
  };
}

export function summarizeSelections(options, selectedIds, maximum = 2) {
  const selected = new Set(selectedIds || []);
  const labels = (Array.isArray(options) ? options : [])
    .filter((option) => selected.has(optionId(option)))
    .map((option) => option.postLabel || option.label || optionId(option));
  if (!labels.length) return 'לא נבחר';
  if (labels.length <= maximum) return labels.join(' · ');
  return `${labels.slice(0, maximum).join(' · ')} · ${labels.length - maximum}+`;
}

export function countDiscoveryFilters(filters, { includeQuery = true } = {}) {
  if (!filters) return 0;
  return Object.entries(filters).reduce((count, [field, value]) => {
    if (field === 'query') return count + (includeQuery && value?.trim() ? 1 : 0);
    if (Array.isArray(value)) return count + value.length;
    if (value && typeof value === 'object') {
      const active = (value.min !== '' && value.min != null) || (value.max !== '' && value.max != null);
      return count + (active ? 1 : 0);
    }
    return count + (value ? 1 : 0);
  }, 0);
}
