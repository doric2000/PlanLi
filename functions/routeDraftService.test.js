const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assertEditableSource,
  cleanupPublishedRouteDraftReceipts,
  discardRouteDraft,
  draftPointerRef,
  publishRouteDraft,
  publishableRoute,
  sanitizeRouteDraft,
  saveRouteDraft,
} = require('./routeDraftService');

const auth = {
  uid: 'owner',
  token: { email_verified: true, firebase: { sign_in_provider: 'password' } },
};

function partialDraft(overrides = {}) {
  return {
    area: { countryId: 'HU', cityId: 'budapest', cityName: 'בודפשט' },
    dayCount: 2,
    title: 'יומיים בבודפשט',
    description: '',
    attributes: { audienceScope: 'all', audiences: [], budgetLevel: '' },
    days: [{ stops: [] }, { stops: [] }],
    ...overrides,
  };
}

test('route drafts accept the minimal destination and day count without publish fields', () => {
  const draft = sanitizeRouteDraft(partialDraft());
  assert.equal(draft.routeSchemaVersion, 2);
  assert.equal(draft.dayCount, 2);
  assert.equal(draft.area.cityId, 'budapest');
  assert.equal(draft.title, 'יומיים בבודפשט');
  assert.equal(draft.description, '');
  assert.equal(draft.attributes.budgetLevel, '');
  assert.deepEqual(draft.days.map((day) => day.stops.length), [0, 0]);
});

test('route drafts keep general, pin, recommendation and optional timing fields bounded', () => {
  const draft = sanitizeRouteDraft(partialDraft({
    dayCount: 1,
    days: [{ stops: [
      {
        id: 'general', title: 'הרובע היהודי', locationPrecision: 'general',
        destination: { countryId: 'HU', cityId: 'budapest' }, startTime: '09:30', durationMinutes: 60,
      },
      {
        id: 'pin', title: 'נקודת צילום', locationPrecision: 'pin',
        destination: { countryId: 'HU', cityId: 'budapest' }, coordinates: { lat: 47.5, lng: 19.04 },
        source: { recommendationId: 'recommendation-1' },
      },
    ] }],
  }));
  assert.equal(draft.days[0].stops[0].startTime, '09:30');
  assert.equal(draft.days[0].stops[0].durationMinutes, 60);
  assert.equal(draft.days[0].stops[1].locationPrecision, 'pin');
  assert.equal(draft.days[0].stops[1].source.recommendationId, 'recommendation-1');
  assert.throws(() => sanitizeRouteDraft(partialDraft({
    dayCount: 1,
    days: [{ stops: [{ title: 'תחנה', startTime: '28:90' }] }],
  })), /startTime/);
});

test('route drafts keep provider proof private for a destination not yet in the catalog', () => {
  const draft = sanitizeRouteDraft(partialDraft({
    area: {
      countryId: 'SI', cityId: 'ljubljana', countryName: 'סלובניה', cityName: 'לובליאנה',
      provider: 'google', providerPlaceId: 'google-city-1', resolvedPlaceToken: 'resolved-token-1',
    },
    dayCount: 1,
    days: [{ stops: [{ id: 'general', title: 'מרכז העיר', locationPrecision: 'general' }] }],
  }));
  assert.deepEqual(draft.area, {
    countryId: 'SI', cityId: 'ljubljana', countryName: 'סלובניה', cityName: 'לובליאנה',
    provider: 'google', providerPlaceId: 'google-city-1', resolvedPlaceToken: 'resolved-token-1',
  });
  assert.equal(draft.days[0].stops[0].destination.providerPlaceId, 'google-city-1');
  assert.equal(draft.days[0].stops[0].destination.resolvedPlaceToken, 'resolved-token-1');
});

test('route drafts strip precise place data from general stops', () => {
  const draft = sanitizeRouteDraft(partialDraft({
    dayCount: 1,
    days: [{ stops: [{
      id: 'general',
      title: 'הרובע היהודי',
      locationPrecision: 'general',
      destination: { countryId: 'HU', cityId: 'budapest' },
      place: {
        placeId: 'stale-exact-place',
        name: 'כתובת מדויקת',
        coordinates: { lat: 47.5, lng: 19.1 },
      },
      coordinates: { lat: 47.5, lng: 19.1 },
    }] }],
  }));
  assert.equal(draft.days[0].stops[0].locationPrecision, 'general');
  assert.equal(Object.prototype.hasOwnProperty.call(draft.days[0].stops[0], 'place'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(draft.days[0].stops[0], 'coordinates'), false);
});

test('publish payload keeps one route schema and whole-route pricing', () => {
  const draft = sanitizeRouteDraft(partialDraft({
    description: 'מסלול שימושי.',
    attributes: { audienceScope: 'all', audiences: [], budgetLevel: 'balanced' },
  }));
  const route = publishableRoute(draft);
  assert.equal(route.routeSchemaVersion, 2);
  assert.equal(route.taxonomyVersion, 5);
  assert.equal(route.priceBasis, 'whole_route');
  assert.equal(route.attributes.budgetLevel, 'balanced');
});

test('one private pointer per owner rejects silently replacing an existing draft', async () => {
  const db = {
    doc: (path) => ({
      path,
      get: async () => ({
        exists: path === 'system/routeDrafts/owners/owner',
        data: () => ({ ownerId: 'owner', draftId: 'existing', version: 3 }),
      }),
    }),
  };
  const admin = { firestore: () => db };
  await assert.rejects(
    saveRouteDraft({ admin, auth, data: { draft: partialDraft() } }),
    (error) => error?.details?.reason === 'ROUTE_DRAFT_EXISTS'
  );
  assert.equal(draftPointerRef(db, 'owner').path, 'system/routeDrafts/owners/owner');
});

test('publishing the same saved version is idempotent after draft cleanup', async () => {
  const receiptPath = 'system/routeDrafts/owners/owner/publications/draft-1';
  const db = {
    doc: (path) => ({
      path,
      get: async () => path === receiptPath
        ? {
            exists: true,
            data: () => ({
              ownerId: 'owner',
              version: 4,
              result: { routeId: 'route-1', revisionId: 'revision-1' },
            }),
          }
        : { exists: false, data: () => ({}) },
    }),
  };
  const result = await publishRouteDraft({
    admin: { firestore: () => db },
    auth,
    data: { draftId: 'draft-1', expectedVersion: 4 },
  });
  assert.deepEqual(result, {
    routeId: 'route-1',
    revisionId: 'revision-1',
    published: true,
    idempotentReplay: true,
  });
});

test('expired publication receipts are removed only from the private route-draft namespace', async () => {
  const deleted = [];
  const documents = [
    'system/routeDrafts/owners/owner/publications/draft-1',
    'routes/route-1/revisions/revision-1/publications/unrelated',
  ].map((path) => ({ ref: { path, delete: async () => deleted.push(path) } }));
  const query = {
    where: () => query,
    limit: () => query,
    get: async () => ({ size: documents.length, docs: documents }),
  };
  const result = await cleanupPublishedRouteDraftReceipts({
    admin: { firestore: () => ({ collectionGroup: () => query }) },
  });
  assert.deepEqual(deleted, ['system/routeDrafts/owners/owner/publications/draft-1']);
  assert.deepEqual(result, { scanned: 2, deleted: 1 });
});

test('editing accepts an owned moderation hold but rejects a deleted source route', async () => {
  const sourcePath = 'routes/route-1';
  const sourceRef = {
    path: sourcePath,
    get: async () => ({
      exists: true,
      data: () => ({ ownerId: 'owner', status: 'moderation_hold' }),
    }),
  };
  const accepted = await assertEditableSource({ doc: () => sourceRef }, 'route-1', 'owner');
  assert.equal(accepted.route.status, 'moderation_hold');

  await assert.rejects(
    assertEditableSource({
      doc: () => ({ get: async () => ({ exists: false, data: () => ({}) }) }),
    }, 'deleted-route', 'owner'),
    (error) => error?.details?.reason === 'ROUTE_SOURCE_NOT_FOUND'
  );
});

test('discard removes the pointer and recursively deletes the draft revision tree', async () => {
  const operations = [];
  const refs = new Map();
  const refFor = (path) => {
    if (!refs.has(path)) refs.set(path, { path });
    return refs.get(path);
  };
  const db = {
    doc: refFor,
    runTransaction: async (work) => work({
      get: async (ref) => ({
        exists: true,
        data: () => ({
          ownerId: 'owner', draftId: 'draft-1', revisionPath: 'routes/route-1/revisions/revision-1',
        }),
      }),
      update: (ref) => operations.push(['update', ref.path]),
      delete: (ref) => operations.push(['delete', ref.path]),
    }),
    recursiveDelete: async (ref) => operations.push(['recursiveDelete', ref.path]),
  };
  const result = await discardRouteDraft({
    admin: {
      firestore: Object.assign(() => db, {
        FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' },
      }),
    },
    auth,
    data: { draftId: 'draft-1' },
  });
  assert.deepEqual(result, { discarded: true });
  assert.deepEqual(operations, [
    ['update', 'routes/route-1/revisions/revision-1'],
    ['delete', 'system/routeDrafts/owners/owner'],
    ['recursiveDelete', 'routes/route-1/revisions/revision-1'],
  ]);
});
