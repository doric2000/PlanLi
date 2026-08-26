const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MAX_PROVIDER_RESOLUTIONS_PER_SAVE,
  assertEditableRoute,
  assertRouteRevisionVersion,
  attachRouteLegEstimates,
  loadTrustedRecommendationSources,
  cleanupRouteRevisions,
  collectMedia,
  deletePreparedRevision,
  loadRouteDetails,
  loadTrustedRoutePlaces,
  preservedRouteStatus,
  resolveRoutePlaces,
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

test('route edits automatically reuse a server-trusted unchanged stop', async () => {
  const route = sanitizeRouteInput(canonicalRoute({
    days: [{
      stops: [{
        id: 'saved-stop',
        title: 'Renamed stop',
        place: { placeId: 'google-place', coordinates: { lat: 32.1, lng: 34.8 } },
      }],
    }],
  }));
  const savedStop = {
    place: { placeId: 'google-place', name: 'Trusted name', coordinates: { lat: 32.1, lng: 34.8 } },
    destination: { countryId: 'IL', cityId: 'TLV' },
  };
  const db = {
    doc: (path) => ({
      get: async () => ({ exists: path.endsWith('/stops/saved-stop'), data: () => savedStop }),
    }),
  };
  const trusted = await loadTrustedRoutePlaces({
    db,
    routeRef: { id: 'route-1' },
    existingRoute: { activeRevisionId: 'revision-1' },
    days: route.days,
  });

  assert.deepEqual(trusted.get('google-place'), {
    destination: { countryId: 'IL', cityId: 'TLV' },
    place: savedStop.place,
  });
});

test('changed places are not trusted without proof and stale reuse hints are rejected', async () => {
  const savedStop = {
    place: { placeId: 'saved-place', coordinates: { lat: 32.1, lng: 34.8 } },
    destination: { countryId: 'IL', cityId: 'TLV' },
  };
  const db = { doc: () => ({ get: async () => ({ exists: true, data: () => savedStop }) }) };
  const base = {
    db, routeRef: { id: 'route-1' }, existingRoute: { activeRevisionId: 'revision-1' },
  };
  const changedDays = [{ id: 'day_001', stops: [{
    id: 'saved-stop', locationPrecision: 'exact', place: { placeId: 'changed-place' },
  }] }];
  const trusted = await loadTrustedRoutePlaces({ ...base, days: changedDays });
  assert.equal(trusted.size, 0);
  changedDays[0].stops[0].reuseSavedLocation = true;
  await assert.rejects(
    loadTrustedRoutePlaces({ ...base, days: changedDays }),
    /changed.*Search/i
  );
});

test('an order-only edit with six saved exact stops consumes zero provider budget', async () => {
  const stops = Array.from({ length: 6 }, (_, index) => ({
    id: `stop-${index}`,
    title: `Stop ${index}`,
    locationPrecision: 'exact',
    place: { placeId: `place-${index}`, coordinates: { lat: 32.1 + index / 100, lng: 34.8 } },
  }));
  const savedById = new Map(stops.map((stop) => [stop.id, {
    place: stop.place,
    destination: { countryId: 'IL', cityId: 'TLV' },
  }]));
  const db = { doc: (path) => ({
    get: async () => {
      const saved = savedById.get(path.split('/').at(-1));
      return { exists: Boolean(saved), data: () => saved };
    },
  }) };
  const days = [{ id: 'day_001', stops: [...stops].reverse() }];
  const trustedPlaces = await loadTrustedRoutePlaces({
    db, routeRef: { id: 'route-1' }, existingRoute: { activeRevisionId: 'revision-1' }, days,
  });
  let budgetCalls = 0;
  const resolved = await resolveRoutePlaces({
    admin: { firestore: () => ({}) },
    auth: { uid: 'owner' },
    days,
    trustedPlaces,
    consumeBudget: async () => { budgetCalls += 1; },
    resolveExisting: async () => ({
      countryId: 'IL', cityId: 'TLV', countryData: { name: 'ישראל' }, cityData: { name: 'תל אביב' },
      cityRef: { path: 'countries/IL/destinations/TLV' },
    }),
    resolveSubmitted: async () => { throw new Error('provider must not be called'); },
  });
  assert.equal(budgetCalls, 0);
  assert.equal(resolved.providerCalls, 0);
  assert.deepEqual(resolved.days[0].stops.map((stop) => stop.id), days[0].stops.map((stop) => stop.id));
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

test('taxonomy v5 route attributes are factual, scoped and derive interests from content', () => {
	const route = sanitizeRouteInput(canonicalRoute({
		taxonomyVersion: 5,
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
	assert.equal(sanitizeRouteInput(canonicalRoute({
		taxonomyVersion: 5,
		facets: undefined,
		attributes: {
			audienceScope: 'all', audiences: [], budgetLevel: 'free', vibes: [],
			travelerStyles: [], needs: [], needsCoverageConfirmed: false,
			seasons: ['spring'], environment: 'outdoor',
		},
	})).facets.budgetLevel, 'free');
	assert.throws(() => sanitizeRouteInput(canonicalRoute({
		taxonomyVersion: 5,
		facets: undefined,
		attributes: {
			audienceScope: 'all', audiences: [], budgetLevel: 'balanced', vibes: [],
			travelerStyles: [], needs: ['wheelchair_accessible'], needsCoverageConfirmed: false,
			seasons: ['spring'], environment: 'outdoor',
		},
	})), /confirmed/);
	assert.throws(() => sanitizeRouteInput(canonicalRoute({
		taxonomyVersion: 5,
		facets: undefined,
		attributes: {
			audienceScope: 'all', audiences: [], budgetLevel: 'flexible', vibes: [],
			travelerStyles: [], needs: [], needsCoverageConfirmed: false,
			seasons: ['spring'], environment: 'outdoor',
		},
	})), /budgetLevel/);
});

test('streamlined routes accept general and pinned stops while keeping price required', () => {
  const route = sanitizeRouteInput({
    routeSchemaVersion: 2,
    taxonomyVersion: 5,
    title: 'יומיים בבודפשט',
    description: 'מסלול קצר וברור.',
    attributes: { audienceScope: 'all', audiences: [], budgetLevel: 'balanced' },
    days: [{
      stops: [
        {
          title: 'הרובע היהודי',
          locationPrecision: 'general',
          destination: { countryId: 'HU', cityId: 'budapest' },
          startTime: '8:30',
          durationMinutes: 90,
          media: { assetId: 'media-1' },
          additionalMedia: [{ assetId: 'media-2' }, { assetId: 'media-3' }],
        },
        {
          title: 'נקודת צילום',
          locationPrecision: 'pin',
          destination: { countryId: 'HU', cityId: 'budapest' },
          coordinates: { lat: 47.5, lng: 19.04 },
        },
      ],
    }],
  });
  assert.equal(route.routeSchemaVersion, 2);
  assert.equal(route.priceBasis, 'whole_route');
  assert.equal(route.days[0].stops[0].locationPrecision, 'general');
  assert.equal(route.days[0].stops[0].startTime, '08:30');
  assert.equal(route.days[0].stops[0].additionalMedia.length, 2);
  assert.equal(route.days[0].stops[1].locationPrecision, 'pin');
  assert.deepEqual(collectMedia(route.days).map((asset) => asset.assetId), [
    'media-1',
    'media-2',
    'media-3',
  ]);
  assert.throws(() => sanitizeRouteInput({
    routeSchemaVersion: 2,
    taxonomyVersion: 5,
    title: 'מסלול',
    description: 'תיאור',
    attributes: { audienceScope: 'all', audiences: [], budgetLevel: '' },
    days: [{ stops: [{ title: 'א', locationPrecision: 'general', destination: { countryId: 'HU', cityId: 'budapest' } }, { title: 'ב', locationPrecision: 'general', destination: { countryId: 'HU', cityId: 'budapest' } }] }],
  }), /budgetLevel/);
});

test('streamlined route publication strips precise data from general stops', () => {
  const area = { countryId: 'HU', cityId: 'budapest' };
  const route = sanitizeRouteInput({
    routeSchemaVersion: 2,
    taxonomyVersion: 5,
    title: 'יומיים בבודפשט',
    description: 'מסלול קצר וברור.',
    attributes: { audienceScope: 'all', audiences: [], budgetLevel: 'balanced' },
    days: [{ stops: [
      {
        title: 'הרובע היהודי',
        locationPrecision: 'general',
        destination: area,
        place: {
          placeId: 'stale-exact-place',
          name: 'כתובת מדויקת',
          coordinates: { lat: 47.5, lng: 19.1 },
        },
        coordinates: { lat: 47.5, lng: 19.1 },
      },
      { title: 'מרכז העיר', locationPrecision: 'general', destination: area },
    ] }],
  });
  assert.equal(route.days[0].stops[0].locationPrecision, 'general');
  assert.equal(Object.prototype.hasOwnProperty.call(route.days[0].stops[0], 'place'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(route.days[0].stops[0], 'coordinates'), false);
});

test('a new general destination is verified by provider proof and published without the proof', async () => {
  const resolveSubmitted = async (input) => {
    assert.equal(input.placeId, 'google-city-1');
    assert.equal(input.resolvedPlaceToken, 'resolved-token-1');
    assert.equal(input.providerBudgetConsumed, false);
    return {
      countryId: 'SI',
      cityId: 'ljubljana',
      countryData: { name: 'סלובניה' },
      cityData: { name: 'לובליאנה' },
      cityRef: { path: 'countries/SI/destinations/ljubljana' },
      place: { placeId: 'google-city-1' },
    };
  };
  const result = await resolveRoutePlaces({
    admin: { firestore: () => ({}) },
    auth: { uid: 'owner' },
    days: [{ stops: [{
      title: 'מרכז העיר',
      locationPrecision: 'general',
      destination: {
        countryId: 'SI', cityId: 'ljubljana', countryName: 'סלובניה', cityName: 'לובליאנה',
        provider: 'google', providerPlaceId: 'google-city-1', resolvedPlaceToken: 'resolved-token-1',
      },
    }] }],
    resolveSubmitted,
    consumeBudget: () => { throw new Error('provider budget should not be consumed for a resolved token'); },
  });

  assert.deepEqual(result.days[0].stops[0].destination, {
    countryId: 'SI', cityId: 'ljubljana', countryName: 'סלובניה', cityName: 'לובליאנה',
  });
  assert.equal(result.catalogDestinations[0].cityRef.path, 'countries/SI/destinations/ljubljana');
});

test('a general destination proof cannot be reused with different destination IDs', async () => {
  await assert.rejects(resolveRoutePlaces({
    admin: { firestore: () => ({}) },
    auth: { uid: 'owner' },
    days: [{ stops: [{
      title: 'יעד שגוי',
      locationPrecision: 'general',
      destination: {
        countryId: 'FR', cityId: 'paris', providerPlaceId: 'google-city-1',
        resolvedPlaceToken: 'resolved-token-1',
      },
    }] }],
    resolveSubmitted: async () => ({
      countryId: 'SI', cityId: 'ljubljana', countryData: { name: 'סלובניה' },
      cityData: { name: 'לובליאנה' }, cityRef: { path: 'countries/SI/destinations/ljubljana' },
    }),
  }), /does not match/);
});

test('travel estimates are produced only between consecutive precise stops', () => {
  const result = attachRouteLegEstimates([{
    stops: [
      { title: 'A', coordinates: { lat: 32.08, lng: 34.78 } },
      {
        title: 'B',
        locationPrecision: 'general',
        destination: { countryId: 'IL', cityId: 'TLV' },
        coordinates: { lat: 32.081, lng: 34.781 },
      },
      { title: 'C', coordinates: { lat: 32.09, lng: 34.79 } },
      { title: 'D', coordinates: { lat: 32.1, lng: 34.8 } },
    ],
  }], ['walking']);
  assert.equal(result.days[0].stops[1].travelFromPrevious, null);
  assert.equal(result.days[0].stops[2].travelFromPrevious, null);
  assert.ok(result.days[0].stops[3].travelFromPrevious.distanceKm > 0);
  assert.ok(result.days[0].stops[3].travelFromPrevious.estimatedDurationMinutes > 0);
});

test('PlanLi stop classification is reloaded from an active recommendation', async () => {
  const documents = {
    'recommendations/recommendation-1': {
      status: 'active',
      categoryId: 'food',
      subcategoryIds: ['restaurant'],
      tags: ['cafe'],
    },
  };
  const db = {
    doc: (path) => ({
      get: async () => ({
        exists: Boolean(documents[path]),
        data: () => documents[path] || {},
      }),
    }),
  };
  const trusted = await loadTrustedRecommendationSources(db, [{
    stops: [{ source: { recommendationId: 'recommendation-1' } }],
  }]);
  assert.deepEqual(trusted.get('recommendation-1'), {
    categoryId: 'food',
    subcategoryIds: ['restaurant'],
  });

  documents['recommendations/recommendation-1'].status = 'moderation_hold';
  await assert.rejects(
    loadTrustedRecommendationSources(db, [{
      stops: [{ source: { recommendationId: 'recommendation-1' } }],
    }]),
    /no longer active/
  );
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

test('the new-place request ceiling is explicit and non-retryable', async () => {
  const days = [{ id: 'day_001', stops: Array.from({ length: 6 }, (_, index) => ({
    id: `new-${index}`,
    title: `New ${index}`,
    locationPrecision: 'exact',
    place: { placeId: `new-place-${index}`, coordinates: { lat: 32 + index / 100, lng: 34.8 } },
  })) }];
  await assert.rejects(
    resolveRoutePlaces({
      admin: { firestore: () => ({}) },
      auth: { uid: 'owner' },
      days,
      consumeBudget: async () => { throw new Error('budget must not be consumed'); },
      resolveSubmitted: async () => { throw new Error('provider must not be called'); },
    }),
    (error) => error?.code === 'resource-exhausted' &&
      error?.details?.reason === 'ROUTE_NEW_PLACE_LIMIT' &&
      error?.details?.retryable === false &&
      error?.details?.providerCalls === 0
  );
});

test('saveRoute requires taxonomy v5 for budget-bearing writes', async () => {
  const routeRef = {
    id: 'new-route', path: 'routes/new-route',
    get: async () => ({ exists: false, data: () => null }),
  };
  const db = { collection: () => ({ doc: () => routeRef }) };
  const admin = { firestore: () => db };
  const auth = {
    uid: 'owner', token: { email_verified: true, firebase: { sign_in_provider: 'password' } },
  };
  await assert.rejects(saveRoute({
    admin, auth, mapsKey: 'maps-key', data: { route: canonicalRoute({ taxonomyVersion: 4 }) },
  }), /Update PlanLi/);
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

test('a rejected route publication removes its prepared revision tree', async () => {
  const deleted = [];
  const revisionRef = {
    path: 'routes/route-1/revisions/prepared-race',
    get: async () => ({ exists: true, data: () => ({ state: 'prepared' }) }),
  };
  const removed = await deletePreparedRevision({
    recursiveDelete: async (ref) => deleted.push(ref.path),
  }, revisionRef, 'test_cleanup_failed');

  assert.equal(removed, true);
  assert.deepEqual(deleted, [revisionRef.path]);
});

test('ambiguous transaction errors never delete a revision that became active', async () => {
  const deleted = [];
  const revisionRef = {
    path: 'routes/route-1/revisions/active-race',
    get: async () => ({ exists: true, data: () => ({ state: 'active' }) }),
  };
  const removed = await deletePreparedRevision({
    recursiveDelete: async (ref) => deleted.push(ref.path),
  }, revisionRef, 'test_cleanup_failed');

  assert.equal(removed, false);
  assert.deepEqual(deleted, []);
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
