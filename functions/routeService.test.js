const test = require('node:test');
const assert = require('node:assert/strict');

const { sanitizeRouteInput, sanitizeRouteMetadata } = require('./routeService');

function canonicalRoute(overrides = {}) {
  return {
    taxonomyVersion: 3,
    title: 'מסלול לדוגמה',
    description: 'תיאור שימושי של המסלול',
    distanceKm: 42,
    categoryIds: ['nature'],
    subcategoryIds: ['hiking'],
    facets: {
      interests: ['hiking'], audiences: ['friends'], budgetLevel: 'balanced', vibes: [],
      travelerStyles: ['roadtrip'], needs: [], seasons: ['spring'], environments: ['outdoor'],
    },
    difficulty: 'moderate',
    experienceLevel: 'beginner',
    transportModes: ['car'],
    pace: 'balanced',
    days: [{
      description: 'יום ראשון',
      stops: [{
        title: 'תחנה', description: '', location: 'מקום', country: 'ישראל',
        place: { placeId: 'google-place', coordinates: { lat: 32.1, lng: 34.8 } },
      }],
    }],
    ...overrides,
  };
}

test('canonical route input validates required route facets and exact stops', () => {
  const route = sanitizeRouteInput(canonicalRoute({
    search: { prefixes: ['client-controlled'] },
    destinations: [{ countryId: 'spoofed', cityId: 'spoofed' }],
  }));
  assert.equal(route.dayCount, 1);
	assert.deepEqual(route.facets.interests, ['nature_scenery', 'hiking', 'scenic_roadtrips']);
  assert.deepEqual(route.transportModes, ['car']);
  assert.equal(Object.prototype.hasOwnProperty.call(route, 'search'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(route, 'destinations'), false);
});

test('route metadata rejects missing required facets, invalid subcategories and missing Place IDs', () => {
	assert.throws(() => sanitizeRouteMetadata(canonicalRoute({ facets: { interests: [], audiences: [], budgetLevel: '' } })), /audiences/);
  assert.throws(() => sanitizeRouteMetadata(canonicalRoute({ subcategoryIds: ['restaurant'] })), /match category/);
  const withoutPlaceId = canonicalRoute();
  delete withoutPlaceId.days[0].stops[0].place.placeId;
  assert.throws(() => sanitizeRouteInput(withoutPlaceId), /verified Place ID/);
});

test('legacy route input is normalized at the server boundary without storing a second schema', () => {
  const legacy = canonicalRoute({
    taxonomyVersion: 0,
    tags: { difficulty: 'קל', travelStyle: 'זוגות', roadTrip: ['מסלול נופי'], experience: ['רומנטי'] },
  });
  delete legacy.categoryIds;
  delete legacy.subcategoryIds;
  delete legacy.facets;
  delete legacy.difficulty;
  delete legacy.experienceLevel;
  delete legacy.transportModes;
  delete legacy.pace;
  const route = sanitizeRouteInput(legacy);
  assert.equal(route.difficulty, 'easy');
  assert.ok(route.facets.interests.includes('scenic_roadtrips'));
  assert.deepEqual(route.facets.audiences, ['couple']);
});

test('taxonomy v4 route attributes are factual, scoped and derive interests from content', () => {
	const route = sanitizeRouteInput(canonicalRoute({
		taxonomyVersion: 4,
		facets: undefined,
		attributes: {
			audienceScope: 'all', audiences: [], budgetLevel: 'balanced', vibes: ['adventurous'],
			travelerStyles: ['roadtrip'], needs: ['wheelchair_accessible'], needsCoverageConfirmed: true,
			seasons: ['spring'], environment: 'outdoor',
		},
	}));
	assert.equal(route.facets.audienceScope, 'all');
	assert.deepEqual(route.facets.audiences, []);
	assert.equal(route.facets.needsScope, 'entire_route');
	assert.ok(route.facets.interests.includes('hiking'));
	assert.throws(() => sanitizeRouteInput(canonicalRoute({
		taxonomyVersion: 4,
		facets: undefined,
		attributes: {
			audienceScope: 'all', audiences: [], budgetLevel: 'balanced', vibes: [],
			travelerStyles: [], needs: ['wheelchair_accessible'], needsCoverageConfirmed: false,
			seasons: ['spring'], environment: 'outdoor',
		},
	})), /confirmed/);
	assert.throws(() => sanitizeRouteInput(canonicalRoute({
		taxonomyVersion: 4,
		facets: undefined,
		attributes: {
			audienceScope: 'all', audiences: [], budgetLevel: 'flexible', vibes: [],
			travelerStyles: [], needs: [], needsCoverageConfirmed: false,
			seasons: ['spring'], environment: 'outdoor',
		},
	})), /budgetLevel/);
});
