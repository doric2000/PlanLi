const test = require('node:test');
const assert = require('node:assert/strict');

const { taxonomyContentErrors } = require('./auditLiveState');
const { buildSearchIndex } = require('../discoverySearch');

test('live audit accepts canonical active recommendations and rejects client-era metadata', () => {
  const canonical = {
    status: 'active',
	taxonomyVersion: 5,
    categoryId: 'nature',
    category: 'טבע ונופים',
    recommendationCatalogVersion: 1,
    subcategoryIds: ['beach'],
    catalogInterestIds: ['nature_scenery', 'beaches_water'],
    tags: ['beach'],
    budget: 'balanced',
    locationMode: 'exact',
    place: { placeId: 'place-1' },
    details: {},
    facets: {
	  interests: ['nature_scenery', 'beaches_water'], catalogInterests: ['nature_scenery', 'beaches_water'],
      audienceScope: 'all', audiences: [], vibes: ['relaxed'], travelerStyles: [],
	  needs: [], needsScope: '', budgetLevel: 'balanced', seasons: [], environments: ['outdoor'],
    },
    search: buildSearchIndex({ title: 'חוף', categoryIds: ['nature'], subcategoryIds: ['beach'] }),
  };
  assert.deepEqual(taxonomyContentErrors('recommendations/r1', canonical), []);
  assert.ok(taxonomyContentErrors('recommendations/r1', {
    ...canonical, facets: { ...canonical.facets, budgetLevel: 'comfort' },
  }).includes('budget-facet-mismatch'));
  assert.ok(taxonomyContentErrors('recommendations/r1', { ...canonical, taxonomyVersion: 2 }).includes('taxonomy-version'));
  assert.ok(taxonomyContentErrors('recommendations/r1', {
    ...canonical, recommendationCatalogVersion: undefined, subcategoryIds: undefined,
  }).includes('recommendation-catalog-version'));
  assert.deepEqual(taxonomyContentErrors('recommendations/r1', {
    ...canonical,
    budget: undefined,
    facets: { ...canonical.facets, budgetLevel: undefined },
  }), []);
});

test('live audit requires route-only canonical facets and destinations', () => {
  const route = {
	status: 'active', taxonomyVersion: 5,
    categoryIds: ['nature'], subcategoryIds: ['hiking'],
    facets: {
	  interests: ['hiking'], audienceScope: 'selected', audiences: ['friends'], vibes: [], travelerStyles: ['roadtrip'], needs: [],
	  needsScope: '', budgetLevel: 'balanced', seasons: ['spring'], environments: ['outdoor'],
    },
    difficulty: 'moderate', experienceLevel: 'beginner', transportModes: ['car'], pace: 'balanced',
    destinations: [{ countryId: 'cty-il', cityId: 'city-tlv' }],
    search: buildSearchIndex({ title: 'מסלול', categoryIds: ['nature'], subcategoryIds: ['hiking'] }),
  };
  assert.deepEqual(taxonomyContentErrors('routes/route-1', route), []);
  assert.ok(taxonomyContentErrors('routes/route-1', { ...route, destinations: [] }).includes('destinations'));
  assert.deepEqual(taxonomyContentErrors('routes/route-2', {
    ...route,
    routeSchemaVersion: 2,
    categoryIds: [],
    subcategoryIds: [],
    difficulty: '',
    transportModes: [],
    pace: '',
    facets: {
      ...route.facets,
      interests: [],
      seasons: [],
      environments: [],
    },
  }), []);
});

test('live audit rejects legacy smart-profile keys without requiring setup completion', () => {
  assert.deepEqual(taxonomyContentErrors('users/u1', {
    smartProfile: {
      setupRequired: true, completedAt: null, interests: [], budget: '', travelParties: [],
      vibe: [], travelerStyles: [], pace: '', needs: [], onboardingVersion: 2,
    },
  }), []);
  assert.ok(taxonomyContentErrors('users/u1', {
    smartProfile: { interests: [], onboardingVersion: 1 },
  }).includes('profile-onboarding-version'));
  assert.ok(taxonomyContentErrors('users/u1', {
    smartProfile: { interests: [], travelStyleTag: 'זוג' },
  }).includes('profile-fields'));
});
