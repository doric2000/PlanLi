const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MAX_PROVIDER_RESOLUTIONS_PER_SAVE,
  assertEditableRoute,
  assertRouteRevisionVersion,
  cleanupRouteRevisions,
  loadRouteDetails,
  preservedRouteStatus,
  revisionVersion,
  sanitizeRouteInput,
  sanitizeRouteMetadata,
  saveRoute,
} = require('./routeService');
const { stableDocumentId } = require('./recommendationService');

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

test('route edits reject deletion races and changed revisions', () => {
  const owned = {
    exists: true,
    data: () => ({ ownerId: 'owner', status: 'active', revisionVersion: 4 }),
  };
  assert.equal(assertEditableRoute(owned, 'owner', false).ownerId, 'owner');
  assert.equal(revisionVersion(owned.data()), 4);
  assert.doesNotThrow(() => assertRouteRevisionVersion(owned.data(), 4));
  assert.throws(() => assertRouteRevisionVersion(owned.data(), 3), /changed while it was being saved/);
  assert.throws(() => assertEditableRoute({
    exists: true,
    data: () => ({ ownerId: 'owner', status: 'deleting' }),
  }, 'owner', false), /deletion is already in progress/);
  assert.equal(preservedRouteStatus({ status: 'inactive' }), 'inactive');
  assert.equal(preservedRouteStatus(null), 'active');
});

test('legacy provider fan-out is capped until resolved place tokens replace it', () => {
  assert.equal(MAX_PROVIDER_RESOLUTIONS_PER_SAVE, 5);
});

test('publishRequestId route replays return the same active route without creating another revision', async () => {
  const requestId = '123e4567-e89b-42d3-a456-426614174000';
  const routeId = stableDocumentId('route', `owner:${requestId}`);
  let reads = 0;
  const routeDocument = {
    ownerId: 'owner', status: 'active', activeRevisionId: 'revision-1', revisionVersion: 1,
  };
  const db = {
    doc: (path) => ({
      path,
      id: path.split('/').at(-1),
      get: async () => {
        reads += 1;
        return { exists: path === `routes/${routeId}`, data: () => routeDocument };
      },
    }),
  };
  const admin = { firestore: () => db };
  const auth = {
    uid: 'owner',
    token: { email_verified: true, firebase: { sign_in_provider: 'password' } },
  };
  const input = {
    admin, auth, mapsKey: 'maps-key', data: { publishRequestId: requestId, route: {} },
  };

  const firstReplay = await saveRoute(input);
  const secondReplay = await saveRoute(input);
  assert.equal(firstReplay.routeId, routeId);
  assert.equal(secondReplay.routeId, routeId);
  assert.equal(firstReplay.revisionId, 'revision-1');
  assert.equal(secondReplay.idempotentReplay, true);
  assert.equal(reads, 2);
});

test('route publishRequestId rejects malformed IDs and edit combinations', async () => {
  const auth = {
    uid: 'owner',
    token: { email_verified: true, firebase: { sign_in_provider: 'password' } },
  };
  const admin = { firestore: () => ({ doc: () => ({}) }) };
  await assert.rejects(
    saveRoute({ admin, auth, mapsKey: 'maps-key', data: { publishRequestId: 'bad', route: {} } }),
    /publishRequestId/
  );
  await assert.rejects(
    saveRoute({
      admin, auth, mapsKey: 'maps-key',
      data: {
        routeId: 'route-1',
        publishRequestId: '123e4567-e89b-42d3-a456-426614174000',
        route: {},
      },
    }),
    /only supported when creating/
  );
});

test('revision cleanup deletes only expired non-active route revisions', async () => {
  const deleted = [];
  const documents = [
    { ref: { path: 'routes/route-1/revisions/prepared' }, data: () => ({ state: 'prepared' }) },
    { ref: { path: 'routes/route-1/revisions/active' }, data: () => ({ state: 'active' }) },
    { ref: { path: 'other/item/revisions/foreign' }, data: () => ({ state: 'prepared' }) },
  ];
  const query = {
    where: () => query,
    limit: () => query,
    get: async () => ({ docs: documents, size: documents.length }),
  };
  const database = {
    collectionGroup: () => query,
    recursiveDelete: async (ref) => deleted.push(ref.path),
  };
  const firestore = () => database;
  const result = await cleanupRouteRevisions({ admin: { firestore } });
  assert.deepEqual(deleted, ['routes/route-1/revisions/prepared']);
  assert.deepEqual(result, { scanned: 3, deleted: 1 });
});

test('public route loading rejects more than 60 days before loading stops', async () => {
  const days = Array.from({ length: 61 }, (_, index) => ({
    id: `day-${index}`,
    data: () => ({ position: index }),
    ref: { collection: () => { throw new Error('stops must not be read'); } },
  }));
  const daysQuery = {
    orderBy: () => daysQuery,
    limit: (value) => {
      assert.equal(value, 61);
      return daysQuery;
    },
    get: async () => ({ docs: days, size: days.length }),
  };
  const revisionRef = {
    get: async () => ({ exists: true, data: () => ({ state: 'active' }) }),
    collection: (name) => {
      assert.equal(name, 'days');
      return daysQuery;
    },
  };
  const routeRef = {
    get: async () => ({
      id: 'route-1', exists: true, data: () => ({ status: 'active', activeRevisionId: 'revision-1' }),
    }),
    collection: (name) => {
      assert.equal(name, 'revisions');
      return { doc: (id) => {
        assert.equal(id, 'revision-1');
        return revisionRef;
      } };
    },
  };
  const admin = { firestore: () => ({ doc: () => routeRef }) };
  await assert.rejects(
    loadRouteDetails({ admin, data: { routeId: 'route-1' } }),
    /too many days/
  );
});
