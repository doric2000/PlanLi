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
    pace: 'relaxed',
    needs: ['vegetarian'],
  }, { complete: true });
  assert.equal(complete.interests.length, 3);

  assert.throws(() => sanitizeSmartProfile({
    interests: ['food'],
    budget: 'balanced',
    travelParties: ['couple'],
    vibe: [],
    pace: '',
    needs: [],
  }, { complete: true }), /three interests/);
});

test('profile drafts reject unknown enums and server-owned metadata', () => {
  assert.throws(() => sanitizeSmartProfile({
    interests: ['not-a-real-interest'],
    budget: '', travelParties: [], vibe: [], pace: '', needs: [],
  }), /interests is invalid/);
  assert.throws(() => sanitizeSmartProfile({
    interests: [], budget: '', travelParties: [], vibe: [], pace: '', needs: [],
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
    audiences: ['couple'], vibes: ['romantic'], needs: ['vegetarian'],
  }), {
    audiences: ['couple'], vibes: ['romantic'], needs: ['vegetarian'],
  });
  assert.throws(() => sanitizeSubmittedFacets({ audiences: ['everyone'] }), /audiences facets/);
  assert.throws(() => sanitizeSubmittedFacets({ interests: ['food'] }), /unsupported fields/);
});
