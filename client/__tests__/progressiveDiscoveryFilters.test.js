import {
  addDestinationSelection,
  countDiscoveryFilters,
  filterDestinationOptions,
  getRelevantDiscoveryFacets,
  normalizeDestinationSearchText,
  orderProgressiveOptions,
  toggleDiscoveryCategory,
} from '../src/utils/progressiveDiscoveryFilters';
import { createEmptyDiscoveryFilters } from '../src/utils/discoveryFilters';
import { INTERESTS } from '../src/constants/travelTaxonomy';

describe('progressive discovery filter helpers', () => {
  it('normalizes Hebrew text and finds canonical destinations with multiple terms', () => {
    expect(normalizeDestinationSearchText('  יְרוּשָׁלַיִם! ')).toBe('ירושלימ');
    const options = [
      { key: 'city:il:tlv', name: 'תל אביב', countryName: 'ישראל', label: 'תל אביב · ישראל' },
      { key: 'city:fr:paris', name: 'פריז', countryName: 'צרפת', label: 'פריז · צרפת' },
    ];
    expect(filterDestinationOptions(options, 'תל ישר')).toEqual([options[0]]);
    expect(filterDestinationOptions(options, 'ת')).toEqual([]);
  });

  it('matches punctuation, spacing, diacritics, and hidden English destination names', () => {
    const options = [{
      key: 'city:ca:st-johns',
      name: 'סנט ג׳ונס',
      names: { he: 'סנט ג׳ונס', en: 'St. John’s' },
      countryName: 'קנדה',
      countryNames: { he: 'קנדה', en: 'Canada' },
      label: 'סנט ג׳ונס · קנדה',
    }, {
      key: 'city:br:sao-paulo',
      name: 'סאו פאולו',
      names: { he: 'סאו פאולו', en: 'São Paulo' },
      countryName: 'ברזיל',
      countryNames: { he: 'ברזיל', en: 'Brazil' },
      label: 'סאו פאולו · ברזיל',
    }];
    expect(filterDestinationOptions(options, 'ST JOHNS')).toEqual([options[0]]);
    expect(filterDestinationOptions(options, 'stjohns')).toEqual([options[0]]);
    expect(filterDestinationOptions(options, 'sao-paulo')).toEqual([options[1]]);
    expect(filterDestinationOptions(options, 'canada')).toEqual([options[0]]);
  });

  it('keeps destination selections non-overlapping and enforces the maximum', () => {
    const country = { countryId: 'il', cityId: '', label: 'מדינה · ישראל' };
    const telAviv = { countryId: 'il', cityId: 'tlv', label: 'תל אביב · ישראל' };
    const haifa = { countryId: 'il', cityId: 'haifa', label: 'חיפה · ישראל' };
    expect(addDestinationSelection([telAviv, haifa], country).destinations).toEqual([
      { countryId: 'il', cityId: '', label: country.label },
    ]);
    expect(addDestinationSelection([country], telAviv).destinations).toEqual([
      { countryId: 'il', cityId: 'tlv', label: telAviv.label },
    ]);
    const full = Array.from({ length: 5 }, (_, index) => ({
      countryId: `country-${index}`, cityId: '', label: `יעד ${index}`,
    }));
    expect(addDestinationSelection(full, { countryId: 'extra', label: 'נוסף' }).blocked).toBe(true);
  });

  it('limits new category choices without truncating legacy state', () => {
    const filters = { ...createEmptyDiscoveryFilters(), categoryIds: ['food', 'nature', 'culture'] };
    expect(toggleDiscoveryCategory(filters, 'activities').blocked).toBe(true);
    const legacy = { ...filters, categoryIds: ['food', 'nature', 'culture', 'activities'] };
    const removed = toggleDiscoveryCategory(legacy, 'activities');
    expect(removed.blocked).toBe(false);
    expect(removed.filters.categoryIds).toEqual(['food', 'nature', 'culture']);
  });

  it('removes only subcategories belonging to a removed category', () => {
    const filters = {
      ...createEmptyDiscoveryFilters(),
      categoryIds: ['food', 'nature'],
      subcategoryIds: ['restaurant', 'beach'],
      vibeIds: ['romantic'],
    };
    const result = toggleDiscoveryCategory(filters, 'nature');
    expect(result.filters.subcategoryIds).toEqual(['restaurant']);
    expect(result.filters.vibeIds).toEqual(['romantic']);
    expect(result.removedSubcategoryCount).toBe(1);
  });

  it('derives relevance from taxonomy without conflating beaches and freshwater', () => {
    const beach = getRelevantDiscoveryFacets({ categoryIds: ['nature'], subcategoryIds: ['beach'] });
    expect(beach.interests).toContain('beaches_water');
    expect(beach.interests).not.toContain('freshwater_nature');
    expect(beach.environments).toContain('outdoor');
  });

  it('shows selected values first, then relevant values, without silently selecting them', () => {
    const result = orderProgressiveOptions(INTERESTS, ['food'], ['beaches_water'], { collapsedLimit: 3 });
    expect(result.options.map((option) => option.value)).toEqual(['food', 'beaches_water', 'nature_scenery']);
    expect(result.hiddenCount).toBe(INTERESTS.length - 3);
  });

  it('counts active values and ranges while allowing query exclusion for the filter badge', () => {
    const filters = {
      ...createEmptyDiscoveryFilters(),
      query: 'ים',
      categoryIds: ['nature'],
      destinations: [{ countryId: 'il', cityId: 'tlv' }],
      durationDays: { min: '2', max: '' },
    };
    expect(countDiscoveryFilters(filters)).toBe(4);
    expect(countDiscoveryFilters(filters, { includeQuery: false })).toBe(3);
  });
});
