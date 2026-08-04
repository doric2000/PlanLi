const test = require('node:test');
const assert = require('node:assert/strict');

const { sanitizeSmartProfile } = require('./profileService');
const { sanitizeSubmittedFacets } = require('./recommendationService');
const { buildRecommendationFacets } = require('./travelTaxonomy');

test('completed smart profiles enforce canonical core fields and limits', () => {
  const complete = sanitizeSmartProfile({
    interests: ['food', 'nature_scenery', 'cafes'],
    budget: 'balanced',
    travelParties: ['couple'],
    vibe: ['romantic'],
    needs: ['vegetarian', 'gluten_free'],
  }, { complete: true });
  assert.equal(complete.interests.length, 3);

  assert.throws(() => sanitizeSmartProfile({
    interests: ['food'],
    budget: 'balanced',
    travelParties: ['couple'],
    vibe: [],
    needs: [],
  }, { complete: true }), /three interests/);
});

test('profile drafts reject unknown enums and server-owned metadata', () => {
  assert.throws(() => sanitizeSmartProfile({
    interests: ['not-a-real-interest'],
    budget: '', travelParties: [], vibe: [], needs: [],
  }), /interests is invalid/);
  assert.throws(() => sanitizeSmartProfile({
    interests: [], budget: '', travelParties: [], vibe: [], needs: [],
    completedAt: 'client-value',
  }), /unsupported fields/);
});

test('recommendation facets are derived from legacy display metadata and author facts', () => {
  const facets = buildRecommendationFacets({
    categoryId: 'food',
    tags: ['כשר'],
    budget: '$$',
  }, {
    audiences: ['family_young_children'],
    vibes: ['local'],
  });

  assert.ok(facets.interests.includes('food'));
  assert.ok(facets.needs.includes('kosher'));
  assert.equal(facets.budgetLevel, 'balanced');
  assert.deepEqual(facets.audiences, ['family_young_children']);
});

test('recommendation author facets reject unknown values and client-derived fields', () => {
  assert.deepEqual(sanitizeSubmittedFacets({
    interests: ['food'], audiences: ['couple'], vibes: ['romantic'], needs: ['vegetarian'],
  }), {
    interests: ['food'], audiences: ['couple'], vibes: ['romantic'], needs: ['vegetarian'],
  });
  assert.throws(() => sanitizeSubmittedFacets({ audiences: ['everyone'] }), /audiences facets/);
  assert.throws(() => sanitizeSubmittedFacets({ interests: ['unknown'] }), /interests facets/);
  assert.throws(() => sanitizeSubmittedFacets({ interests: [] }), /interests facets/);
});

test('category mappings cover accommodation, mobility and traveler services without forced facets', () => {
  assert.deepEqual(buildRecommendationFacets({ categoryId: 'stay' }).interests, ['stays_accommodation']);
  assert.deepEqual(buildRecommendationFacets({ categoryId: 'transportation' }).interests, ['transportation_mobility']);
  assert.deepEqual(buildRecommendationFacets({ categoryId: 'services' }).interests, ['travel_tips_services']);
});

test('generic accessibility and Chabad labels never claim practical needs', () => {
  const facets = buildRecommendationFacets({
    categoryId: 'food',
    tags: ['נגישות', 'חב״ד'],
  });
  assert.deepEqual(facets.needs, []);
});
