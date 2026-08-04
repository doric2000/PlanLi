const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildSearchIndex,
  matchesDestinations,
  normalizeSearchText,
  parseSearchQuery,
  searchRelevance,
} = require('./discoverySearch');

test('Hebrew search removes niqqud, punctuation and final-letter differences', () => {
  assert.equal(normalizeSearchText('  חוֹף-יָם!  '), 'חופ ימ');
  assert.equal(normalizeSearchText('שוקים'), normalizeSearchText('שׁוּקִים'));
});

test('prefixes and synonyms search title, taxonomy, destination and description', () => {
  const item = {
    title: 'מסעדת שוק מקומית',
    description: 'ארוחת ערב ליד הטיילת',
    destination: { countryId: 'cty-il', cityId: 'city-tlv', countryName: 'ישראל', cityName: 'תל אביב' },
    categoryId: 'food',
    tags: ['restaurant'],
    facets: { interests: ['food'] },
  };
  item.search = buildSearchIndex({
    title: item.title,
    description: item.description,
    destination: item.destination,
    categoryIds: [item.categoryId],
    subcategoryIds: item.tags,
    interestIds: item.facets.interests,
  });

  assert.equal(searchRelevance(item, parseSearchQuery('מסעד')).matches, true);
  assert.equal(searchRelevance(item, parseSearchQuery('אוכל תל')).matches, true);
  assert.equal(searchRelevance(item, parseSearchQuery('מוזיאון')).matches, false);
});

test('all query terms are required while destination choices use OR', () => {
  const item = {
    destination: { countryId: 'cty-il', cityId: 'city-tlv' },
    search: buildSearchIndex({ title: 'חוף יפה', description: 'שקיעה רגועה' }),
  };
  assert.equal(searchRelevance(item, parseSearchQuery('חוף רגוע')).matches, true);
  assert.equal(searchRelevance(item, parseSearchQuery('חוף מוזיאון')).matches, false);
  assert.equal(matchesDestinations(item, [
    { countryId: 'cty-fr', cityId: 'city-paris' },
    { countryId: 'cty-il', cityId: 'city-tlv' },
  ]), true);
  assert.equal(matchesDestinations(item, [{ countryId: 'cty-fr' }]), false);
});

test('title relevance outranks taxonomy, destination and description', () => {
  const parsed = parseSearchQuery('חוף');
  const title = { search: buildSearchIndex({ title: 'חוף', description: '' }) };
  const taxonomy = { search: buildSearchIndex({ title: 'מקום', subcategoryIds: ['beach'] }) };
  const destination = { search: buildSearchIndex({ title: 'מקום', destination: { cityName: 'חוף' } }) };
  const description = { search: buildSearchIndex({ title: 'מקום', description: 'ליד החוף' }) };
  assert.ok(searchRelevance(title, parsed).score > searchRelevance(taxonomy, parsed).score);
  assert.ok(searchRelevance(taxonomy, parsed).score > searchRelevance(destination, parsed).score);
  assert.ok(searchRelevance(destination, parsed).score > searchRelevance(description, parsed).score);
});
