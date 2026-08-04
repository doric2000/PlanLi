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
  assert.deepEqual(route.facets.interests, ['hiking', 'nature_scenery']);
  assert.deepEqual(route.transportModes, ['car']);
  assert.equal(Object.prototype.hasOwnProperty.call(route, 'search'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(route, 'destinations'), false);
});

test('route metadata rejects missing required facets, invalid subcategories and missing Place IDs', () => {
  assert.throws(() => sanitizeRouteMetadata(canonicalRoute({ facets: { interests: [], audiences: [], budgetLevel: '' } })), /interests/);
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
