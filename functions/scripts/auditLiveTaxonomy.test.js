const test = require('node:test');
const assert = require('node:assert/strict');

const { taxonomyContentErrors } = require('./auditLiveState');
const { buildSearchIndex } = require('../discoverySearch');

test('live audit accepts canonical active recommendations and rejects client-era metadata', () => {
  const canonical = {
    status: 'active',
    taxonomyVersion: 3,
    categoryId: 'nature',
    tags: ['beach'],
    budget: 'balanced',
    facets: {
      interests: ['nature_scenery', 'beaches_water'], audiences: [], vibes: [], travelerStyles: [],
      needs: [], budgetLevel: 'balanced', seasons: [], environments: ['outdoor'],
    },
    search: buildSearchIndex({ title: 'חוף', categoryIds: ['nature'], subcategoryIds: ['beach'] }),
  };
  assert.deepEqual(taxonomyContentErrors('recommendations/r1', canonical), []);
  assert.ok(taxonomyContentErrors('recommendations/r1', { ...canonical, taxonomyVersion: 2 }).includes('taxonomy-version'));
});

test('live audit requires route-only canonical facets and destinations', () => {
  const route = {
    status: 'active', taxonomyVersion: 3,
    categoryIds: ['nature'], subcategoryIds: ['hiking'],
    facets: {
      interests: ['hiking'], audiences: ['friends'], vibes: [], travelerStyles: ['roadtrip'], needs: [],
      budgetLevel: 'balanced', seasons: [], environments: ['outdoor'],
    },
    difficulty: 'moderate', experienceLevel: 'beginner', transportModes: ['car'], pace: 'balanced',
    destinations: [{ countryId: 'cty-il', cityId: 'city-tlv' }],
    search: buildSearchIndex({ title: 'מסלול', categoryIds: ['nature'], subcategoryIds: ['hiking'] }),
  };
  assert.deepEqual(taxonomyContentErrors('routes/route-1', route), []);
  assert.ok(taxonomyContentErrors('routes/route-1', { ...route, destinations: [] }).includes('destinations'));
});

test('live audit rejects legacy smart-profile keys without requiring setup completion', () => {
  assert.deepEqual(taxonomyContentErrors('users/u1', {
    smartProfile: { setupRequired: true, completedAt: null, interests: [], budget: '', travelParties: [], vibe: [], travelerStyles: [], pace: '', needs: [] },
  }), []);
  assert.ok(taxonomyContentErrors('users/u1', {
    smartProfile: { interests: [], travelStyleTag: 'זוג' },
  }).includes('profile-fields'));
});
