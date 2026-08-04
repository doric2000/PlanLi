const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  migratedSmartProfile,
  migratedRecommendation,
  migratedRoute,
  parseArgs,
  resolveLegacyRecommendationClassification,
} = require('./migrateTravelPersonalization');

test('travel personalization migration is dry-run unless apply is explicit', () => {
  const defaults = parseArgs([]);
  assert.equal(defaults.apply, false);
  assert.equal(defaults.resume, false);
  assert.equal(defaults.rollback, null);

  const explicit = parseArgs(['--apply', '--resume', '--limit', '25', '--state-dir', './tmp-state']);
  assert.equal(explicit.apply, true);
  assert.equal(explicit.resume, true);
  assert.equal(explicit.limit, 25);
  assert.equal(explicit.stateDir, path.resolve('./tmp-state'));
});

test('legacy labels map to stable IDs without marking the user complete', () => {
  const profile = migratedSmartProfile({
    interests: ['food', 'nature', 'museums'],
    travelStyle: 'budget',
    tripType: 'זוג',
    constraints: ['shabbatObserver'],
  });

  assert.equal(profile.setupRequired, false);
  assert.equal(profile.completedAt, null);
  assert.ok(profile.interests.includes('food'));
  assert.ok(profile.interests.includes('nature_scenery'));
  assert.ok(profile.needs.includes('shabbat_friendly'));
  assert.equal(profile.pace, '');
  assert.deepEqual(profile.travelerStyles, []);
});

test('recommendation migration replaces display tags with IDs and separates factual facets', () => {
  const recommendation = migratedRecommendation({
    categoryId: 'food',
    tags: ['מסעדה', 'כשר', 'חב״ד'],
    budget: '$$',
    facets: {},
  });

  assert.deepEqual(recommendation.tags, ['restaurant']);
  assert.equal(recommendation.categoryId, 'food');
  assert.equal(recommendation.category, 'אוכל ושתייה');
  assert.equal(recommendation.budget, 'balanced');
  assert.ok(recommendation.facets.needs.includes('kosher'));
  assert.ok(!recommendation.facets.needs.includes('shabbat_friendly'));

  const alias = migratedRecommendation({
    categoryId: 'nature', tags: ['נקודות תצפית'], budget: '', facets: {},
  });
  assert.deepEqual(alias.tags, ['viewpoint']);
});

test('rollback always requires apply', () => {
  const options = parseArgs(['--rollback', './snapshot.jsonl']);
  assert.equal(options.apply, false);
  assert.equal(options.rollback, './snapshot.jsonl');
});

test('migration clears an invalid completion marker instead of preserving a false completed state', () => {
  const profile = migratedSmartProfile({
    completedAt: { seconds: 1 }, interests: ['food'], budget: 'balanced', travelParties: [],
  });
  assert.equal(profile.completedAt, null);
  assert.equal(profile.setupRequired, false);
});

test('legacy attractions use content semantics while cross-cutting tags move to facets', () => {
  const museum = migratedRecommendation({
    title: 'מוזיאון עתידני', description: 'פעילות בתוך מבנה', categoryId: 'attractions',
    tags: ['museum', 'indoor_activity', 'instagram_spot'], budget: '$$', facets: {},
  });
  assert.equal(museum.categoryId, 'culture');
  assert.deepEqual(museum.tags, ['museum']);
  assert.ok(museum.facets.environments.includes('indoor'));
  assert.ok(museum.facets.interests.includes('photography_viewpoints'));

  const stadium = resolveLegacyRecommendationClassification({
    title: 'סיור בקאמפ נואו', description: 'אצטדיון', categoryId: 'attractions',
    tags: ['museum', 'historic_site', 'indoor_activity'],
  });
  assert.equal(stadium.categoryId, 'activities');
  assert.deepEqual(stadium.tagIds, ['sports_stadium']);
  assert.equal(stadium.confident, true);
});

test('legacy backpacker and digital-nomad values move from vibe to traveler style', () => {
  const profile = migratedSmartProfile({
    interests: ['food', 'cafes', 'nature'],
    vibe: ['backpacker', 'digital_nomad', 'romantic'],
    budget: 'balanced',
    travelParties: ['solo'],
  });
  assert.deepEqual(profile.travelerStyles, ['backpacker', 'digital_nomad']);
  assert.deepEqual(profile.vibe, ['romantic']);
});

test('route migration builds canonical facets, destinations and search without touching recency fields', () => {
  const result = migratedRoute({
    title: 'מסלול חופים',
    description: 'יום ליד הים',
    tags: { difficulty: 'קל', roadTrip: ['מסלול נופי'], experience: [] },
    createdAt: { seconds: 1 },
  }, [{
    location: 'חוף לדוגמה',
    destination: { countryId: 'cty-il', cityId: 'city-tlv', countryName: 'ישראל', cityName: 'תל אביב' },
  }]);

  assert.equal(result.reviewRequired, false);
  assert.equal(result.patch.taxonomyVersion, 3);
  assert.equal(result.patch.difficulty, 'easy');
  assert.deepEqual(result.patch.transportModes, ['mixed']);
  assert.deepEqual(result.patch.destinationKeys, ['cty-il:*', 'cty-il:city-tlv']);
  assert.ok(result.patch.search.prefixes.length > 0);
  assert.equal(Object.prototype.hasOwnProperty.call(result.patch, 'createdAt'), false);
});

test('route migration deactivates an empty route and flags an unresolvable route', () => {
  assert.deepEqual(migratedRoute({ title: 'ריק' }, []).patch, { status: 'inactive' });
  const unresolved = migratedRoute({ title: 'מסלול', dayCount: 1 }, [{ location: 'מקום לא מזוהה' }]);
  assert.equal(unresolved.patch, null);
  assert.equal(unresolved.reviewRequired, true);
});

test('recommendation and route migrations are idempotent after one canonical pass', () => {
  const recommendationInput = {
    title: 'Europa Park',
    description: 'Theme park in a small town',
    categoryId: 'attractions',
    tags: ['theme_park', 'neighborhood', 'indoor_activity'],
    budget: '$$$',
    facets: { interests: ['family_attractions'], audiences: ['friends'] },
  };
  const firstRecommendation = migratedRecommendation(recommendationInput);
  const secondRecommendation = migratedRecommendation({
    ...recommendationInput,
    ...firstRecommendation,
  });
  assert.deepEqual(secondRecommendation, firstRecommendation);

  const stops = [{
    location: 'Example city',
    destination: { countryId: 'cty-example', cityId: 'city-example' },
  }];
  const routeInput = {
    title: 'Legacy roadtrip',
    description: 'Scenic route',
    tags: { difficulty: 'easy', roadTrip: ['scenic'], experience: [] },
  };
  const firstRoute = migratedRoute(routeInput, stops).patch;
  const secondRoute = migratedRoute({ ...routeInput, ...firstRoute }, stops).patch;
  assert.deepEqual(secondRoute, firstRoute);
});
