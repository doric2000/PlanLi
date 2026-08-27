const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assertPublishableRecommendationDraft,
  assertEditableSource,
  cleanupRecommendationDraftArtifacts,
  discardRecommendationDraft,
  getCurrentRecommendationDraft,
  pointerRef,
  publishData,
  publishRecommendationDraft,
  sanitizeRecommendationDraft,
  saveRecommendationDraft,
} = require('./recommendationDraftService');

const auth = {
  uid: 'owner',
  token: { email_verified: true, firebase: { sign_in_provider: 'password' } },
};

function partialDraft(overrides = {}) {
  return {
    step: 2,
    locationMode: 'destination',
    selectedCountry: { id: 'HU', name: 'הונגריה' },
    selectedCity: { id: 'budapest', name: 'בודפשט' },
    categoryId: 'food',
    subcategoryIds: ['restaurant'],
    title: '',
    description: '',
    budget: '',
    details: {},
    media: [],
    localMediaCount: 0,
    ...overrides,
  };
}

function media(assetId) {
  return {
    assetId,
    large: { path: `media/owner/${assetId}/large.webp` },
    feed: { path: `media/owner/${assetId}/feed.webp` },
    thumb: { path: `media/owner/${assetId}/thumb.webp` },
  };
}

function firestoreAdmin(db) {
  return {
    firestore: Object.assign(() => db, {
      FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' },
    }),
  };
}

test('recommendation drafts sanitize bounded partial composer state without local paths', () => {
  const draft = sanitizeRecommendationDraft(partialDraft({
    step: 3,
    details: {
      phone: '  +972 50 123 4567  ',
      externalUrl: '\u200f https://planli.example/place\u2069',
    },
    generalDestination: {
      countryId: 'GR',
      cityId: 'dst_mykonos',
      countryName: 'יוון',
      name: 'מיקונוס',
      provider: 'untrusted-provider',
      providerPlaceId: 'google-mykonos',
      resolvedPlaceToken: 'resolved-token-1',
    },
    selectedPlace: { placeId: 'place-1', name: 'מקום', localUri: 'file:///private.jpg' },
    media: [media('asset-1')],
    localMediaCount: 1,
    localUris: ['file:///private.jpg'],
  }));
  assert.equal(draft.composerKind, 'catalog-v1');
  assert.equal(draft.details.phone, '+972 50 123 4567');
  assert.equal(draft.details.externalUrl, 'https://planli.example/place');
  assert.deepEqual(draft.generalDestination, {
    countryId: 'GR',
    cityId: 'dst_mykonos',
    countryName: 'יוון',
    name: 'מיקונוס',
    label: '',
    provider: 'google',
    providerPlaceId: 'google-mykonos',
    resolvedPlaceToken: 'resolved-token-1',
  });
  assert.equal(draft.selectedPlace.localUri, undefined);
  assert.equal(draft.localUris, undefined);
  assert.equal(draft.localMediaCount, 1);
  assert.throws(() => sanitizeRecommendationDraft(partialDraft({
    media: [media('1'), media('2'), media('3')],
    localMediaCount: 3,
  })), /Too many images/);
  assert.throws(() => sanitizeRecommendationDraft(partialDraft({
    details: { privateNote: 'do not persist' },
  })), /details/);
});

test('one private pointer rejects replacing a recommendation draft and detects stale versions', async () => {
  const ownerPath = 'system/recommendationDrafts/owners/owner';
  const db = {
    doc: (path) => ({
      path,
      get: async () => ({
        exists: path === ownerPath,
        data: () => ({ ownerId: 'owner', draftId: 'existing', version: 3, sourceRecommendationId: null }),
      }),
    }),
  };
  const admin = firestoreAdmin(db);
  await assert.rejects(
    saveRecommendationDraft({ admin, auth, data: { draft: partialDraft() } }),
    (error) => error?.details?.reason === 'RECOMMENDATION_DRAFT_EXISTS'
  );
  await assert.rejects(
    saveRecommendationDraft({
      admin, auth,
      data: { draftId: 'existing', expectedVersion: 2, draft: partialDraft() },
    }),
    (error) => error?.details?.reason === 'RECOMMENDATION_DRAFT_VERSION_CONFLICT'
  );
  assert.equal(pointerRef(db, 'owner').path, ownerPath);
});

test('draft saves are rate-limited before creating immutable versions', async () => {
  const sentinel = new Error('rate-limited');
  let versionCreated = false;
  const ownerRef = {
    path: 'system/recommendationDrafts/owners/owner',
    get: async () => ({ exists: false }),
    collection: () => ({
      doc: () => ({ create: async () => { versionCreated = true; } }),
    }),
  };
  await assert.rejects(saveRecommendationDraft({
    admin: firestoreAdmin({ doc: () => ownerRef }),
    auth,
    data: { draft: partialDraft({ title: 'טיוטה' }) },
    consumeRateLimitImpl: async ({ uid, action }) => {
      assert.equal(uid, 'owner');
      assert.equal(action, 'recommendationDraftSave');
      throw sentinel;
    },
  }), sentinel);
  assert.equal(versionCreated, false);
});

test('a repeated save request returns the exact committed version without another rate charge', async () => {
  const requestId = '123e4567-e89b-42d3-a456-426614174001';
  const ownerPath = 'system/recommendationDrafts/owners/owner';
  const versionPath = `${ownerPath}/draftVersions/version-4`;
  let pointer = {
    ownerId: 'owner', draftId: 'draft-1', version: 4, versionPath,
    sourceRecommendationId: null, state: 'draft',
  };
  let rateCalls = 0;
  const refFor = (path) => ({
    path,
    get: async () => path === ownerPath
      ? { exists: true, data: () => pointer }
      : { exists: false },
    collection: () => ({
      doc: () => ({
        path: `${ownerPath}/draftVersions/version-5`,
        create: async () => {},
        set: async () => {},
      }),
    }),
  });
  const db = {
    doc: refFor,
    runTransaction: async (work) => work({
      get: async () => ({ exists: true, data: () => pointer }),
      set: (_ref, value) => { pointer = { ...pointer, ...value }; },
      update: () => {},
    }),
  };
  const options = {
    admin: firestoreAdmin(db), auth,
    data: {
      draftId: 'draft-1', expectedVersion: 4, saveRequestId: requestId,
      draft: partialDraft({ title: 'נשמר בדיוק פעם אחת' }),
    },
    consumeRateLimitImpl: async () => { rateCalls += 1; },
  };
  const saved = await saveRecommendationDraft(options);
  const replay = await saveRecommendationDraft(options);
  assert.equal(saved.version, 5);
  assert.equal(replay.version, 5);
  assert.equal(replay.idempotentReplay, true);
  assert.equal(rateCalls, 1);
});

test('a repeated recovery save returns the rotated draft id after its response was lost', async () => {
  const ownerPath = 'system/recommendationDrafts/owners/owner';
  const pointer = {
    ownerId: 'owner', draftId: 'rotated-draft', version: 1,
    versionPath: `${ownerPath}/draftVersions/version-1`,
    sourceRecommendationId: null, state: 'draft',
    lastSaveRequestId: '123e4567-e89b-42d3-a456-426614174002',
  };
  const result = await saveRecommendationDraft({
    admin: firestoreAdmin({
      doc: () => ({ get: async () => ({ exists: true, data: () => pointer }) }),
    }),
    auth,
    data: {
      draftId: 'missing-draft',
      expectedVersion: 7,
      saveRequestId: pointer.lastSaveRequestId,
      draft: partialDraft({ title: 'Recovered' }),
    },
    consumeRateLimitImpl: async () => assert.fail('idempotent recovery must not charge rate limit'),
  });
  assert.deepEqual(result, {
    draftId: 'rotated-draft', version: 1, sourceRecommendationId: null, idempotentReplay: true,
  });
});

test('source edits require ownership or an active registered admin', async () => {
  const recommendation = { ownerId: 'another-owner', status: 'moderation_hold' };
  const db = {
    doc: (path) => ({
      get: async () => ({
        exists: path === 'recommendations/rec-1',
        data: () => recommendation,
      }),
    }),
  };
  await assert.rejects(
    assertEditableSource({ admin: firestoreAdmin(db), auth, sourceRecommendationId: 'rec-1' }),
    (error) => error?.details?.reason === 'RECOMMENDATION_SOURCE_FORBIDDEN'
  );
  const adminAuth = { ...auth, token: { ...auth.token, admin: true } };
  const adminDb = {
    doc: (path) => ({
      get: async () => ({
        exists: ['recommendations/rec-1', 'system/moderation/admins/owner'].includes(path),
        data: () => path === 'recommendations/rec-1' ? recommendation : { active: true },
      }),
    }),
  };
  const accepted = await assertEditableSource({
    admin: firestoreAdmin(adminDb), auth: adminAuth, sourceRecommendationId: 'rec-1',
  });
  assert.equal(accepted.status, 'moderation_hold');
});

test('current draft reads the immutable pointed version only', async () => {
  const ownerPath = 'system/recommendationDrafts/owners/owner';
  const versionPath = `${ownerPath}/draftVersions/version-4`;
  const refFor = (path) => ({
    path,
    get: async () => path === ownerPath
      ? {
          exists: true,
          data: () => ({ ownerId: 'owner', draftId: 'draft-1', version: 4, versionPath, sourceRecommendationId: null }),
        }
      : {
          exists: path === versionPath,
          ref: refFor(path),
          data: () => ({ ownerId: 'owner', state: 'draft', draft: partialDraft({ title: 'נשמר' }) }),
        },
  });
  const result = await getCurrentRecommendationDraft({
    admin: firestoreAdmin({ doc: refFor }), auth,
  });
  assert.equal(result.draft.id, 'draft-1');
  assert.equal(result.draft.version, 4);
  assert.equal(result.draft.title, 'נשמר');
});

test('discard removes the pointer and recursively removes all private draft artifacts', async () => {
  const operations = [];
  const ownerPath = 'system/recommendationDrafts/owners/owner';
  const versionPath = `${ownerPath}/draftVersions/version-2`;
  const refFor = (path) => ({ path });
  const db = {
    doc: refFor,
    runTransaction: async (work) => work({
      get: async () => ({
        exists: true,
        data: () => ({ ownerId: 'owner', draftId: 'draft-1', versionPath }),
      }),
      update: (ref) => operations.push(['update', ref.path]),
      delete: (ref) => operations.push(['delete', ref.path]),
    }),
    recursiveDelete: async (ref) => operations.push(['recursiveDelete', ref.path]),
  };
  const result = await discardRecommendationDraft({
    admin: firestoreAdmin(db), auth, data: { draftId: 'draft-1' },
  });
  assert.deepEqual(result, { discarded: true });
  assert.deepEqual(operations, [
    ['update', versionPath],
    ['delete', ownerPath],
    ['recursiveDelete', ownerPath],
  ]);
});

test('discard cannot remove a draft while its exact version is publishing', async () => {
  const ownerPath = 'system/recommendationDrafts/owners/owner';
  await assert.rejects(discardRecommendationDraft({
    admin: firestoreAdmin({
      doc: (path) => ({ path }),
      runTransaction: async (work) => work({
        get: async () => ({
          exists: true,
          data: () => ({ ownerId: 'owner', draftId: 'draft-1', state: 'publishing' }),
        }),
      }),
    }),
    auth,
    data: { draftId: 'draft-1' },
  }), (error) => error?.details?.reason === 'RECOMMENDATION_DRAFT_PUBLISHING');
});

test('publish payload distinguishes new and edit exact-location publication', () => {
  const exactDraft = sanitizeRecommendationDraft(partialDraft({
    locationMode: 'exact',
    selectedPlace: { placeId: 'place-1', resolvedPlaceToken: 'token-1', name: 'מקום' },
    title: 'כותרת', description: 'תיאור', budget: 'economy',
  }));
  const create = publishData({ publishRequestId: '123e4567-e89b-42d3-a456-426614174000' }, exactDraft);
  assert.equal(create.placeId, 'place-1');
  assert.equal(create.resolvedPlaceToken, 'token-1');
  assert.equal(create.recommendation.recommendationCatalogVersion, 1);
  const edit = publishData({ sourceRecommendationId: 'rec-1' }, {
    ...exactDraft,
    selectedPlace: { ...exactDraft.selectedPlace, resolvedPlaceToken: '' },
  });
  assert.equal(edit.recommendationId, 'rec-1');
  assert.deepEqual(edit.destinationRef, { countryId: 'HU', cityId: 'budapest' });
  assert.equal(edit.placeId, undefined);
});

test('publish payload preserves verified provider destinations for destination and pin modes', () => {
  const providerDraft = sanitizeRecommendationDraft(partialDraft({
    selectedCountry: { id: 'GR', name: 'יוון' },
    selectedCity: { id: 'dst_mykonos', name: 'מיקונוס' },
    generalDestination: {
      countryId: 'GR',
      cityId: 'dst_mykonos',
      countryName: 'יוון',
      name: 'מיקונוס',
      providerPlaceId: 'google-mykonos',
      resolvedPlaceToken: 'resolved-token-1',
    },
  }));
  const destination = publishData({
    publishRequestId: '123e4567-e89b-42d3-a456-426614174000',
  }, providerDraft);
  assert.deepEqual(destination.destinationRef, {
    countryId: 'GR',
    cityId: 'dst_mykonos',
    provider: 'google',
    providerPlaceId: 'google-mykonos',
    resolvedPlaceToken: 'resolved-token-1',
  });

  const pin = publishData({
    publishRequestId: '123e4567-e89b-42d3-a456-426614174001',
  }, {
    ...providerDraft,
    locationMode: 'pin',
    manualCoordinate: { lat: 37.45, lng: 25.33 },
  });
  assert.deepEqual(pin.destinationRef, destination.destinationRef);
  assert.deepEqual(pin.manualLocation, { coordinates: { lat: 37.45, lng: 25.33 } });

  const catalog = publishData({
    publishRequestId: '123e4567-e89b-42d3-a456-426614174002',
  }, sanitizeRecommendationDraft(partialDraft()));
  assert.deepEqual(catalog.destinationRef, { countryId: 'HU', cityId: 'budapest' });

  assert.throws(() => publishData({
    publishRequestId: '123e4567-e89b-42d3-a456-426614174003',
  }, {
    ...providerDraft,
    selectedCity: { id: 'dst_santorini', name: 'סנטוריני' },
  }), (error) => error?.details?.reason === 'RECOMMENDATION_DRAFT_INVALID');
});

test('publishing requires at least one canonical recommendation image', () => {
  assert.throws(() => assertPublishableRecommendationDraft(partialDraft()), (error) => (
    error?.details?.reason === 'RECOMMENDATION_PHOTO_REQUIRED'
  ));
  assert.doesNotThrow(() => assertPublishableRecommendationDraft(partialDraft({
    media: [media('asset-1')],
  })));
});

test('publishing saves the exact version, falls back from an expired token, and leaves an idempotent receipt', async () => {
  const ownerPath = 'system/recommendationDrafts/owners/owner';
  const versionPath = `${ownerPath}/draftVersions/version-5`;
  const receiptPath = `${ownerPath}/publicationReceipts/draft-1`;
  const pointer = {
    ownerId: 'owner', draftId: 'draft-1', version: 5, versionPath,
    sourceRecommendationId: null,
    publishRequestId: '123e4567-e89b-42d3-a456-426614174000',
  };
  const operations = [];
  let storedPointer = pointer;
  const refs = new Map();
  const refFor = (path) => {
    if (!refs.has(path)) refs.set(path, {
      path,
      collection: (name) => ({ doc: (id) => refFor(`${path}/${name}/${id}`) }),
      get: async () => path === ownerPath
        ? { exists: true, data: () => pointer }
        : path === versionPath
        ? { exists: true, ref: refFor(path), data: () => ({
            ownerId: 'owner', state: 'draft', draft: sanitizeRecommendationDraft(partialDraft({
              locationMode: 'exact',
              selectedPlace: { placeId: 'place-1', resolvedPlaceToken: 'expired-token' },
              title: 'כותרת', description: 'תיאור', budget: 'economy',
              media: [media('asset-1')],
            })),
          }) }
        : { exists: false, data: () => ({}) },
    });
    return refs.get(path);
  };
  const db = {
    doc: refFor,
    runTransaction: async (work) => work({
      get: async (ref) => ref.path === ownerPath
        ? { exists: true, data: () => storedPointer }
        : { exists: false, data: () => ({}) },
      set: (ref, value) => {
        operations.push(['set', ref.path]);
        if (ref.path === ownerPath) storedPointer = { ...storedPointer, ...value };
      },
      update: (ref) => operations.push(['update', ref.path]),
      delete: (ref) => operations.push(['delete', ref.path]),
    }),
    recursiveDelete: async (ref) => operations.push(['recursiveDelete', ref.path]),
  };
  const requests = [];
  const result = await publishRecommendationDraft({
    admin: firestoreAdmin(db), auth,
    data: { draftId: 'draft-1', expectedVersion: 5 },
    saveRecommendationImpl: async ({ data }) => {
      requests.push(data);
      if (requests.length === 1) throw Object.assign(new Error('Token expired; search again.'), { code: 'not-found' });
      return {
        recommendationId: 'rec-1', publicationStatus: 'moderation_hold', publiclyVisible: false,
      };
    },
  });
  assert.equal(result.recommendationId, 'rec-1');
  assert.equal(result.publicationStatus, 'moderation_hold');
  assert.equal(result.publiclyVisible, false);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].resolvedPlaceToken, 'expired-token');
  assert.equal(requests[1].resolvedPlaceToken, undefined);
  assert.deepEqual(operations, [
    ['set', ownerPath],
    ['set', receiptPath],
    ['update', versionPath],
    ['delete', ownerPath],
    ['recursiveDelete', versionPath],
  ]);

  const replayRef = (path) => ({
    path,
    collection: (name) => ({ doc: (id) => replayRef(`${path}/${name}/${id}`) }),
    get: async () => path === receiptPath
      ? { exists: true, data: () => ({
          ownerId: 'owner', version: 5,
          result: { recommendationId: 'rec-1', publicationStatus: 'moderation_hold', publiclyVisible: false },
        }) }
      : { exists: false, data: () => ({}) },
  });
  const replay = await publishRecommendationDraft({
    admin: firestoreAdmin({ doc: replayRef }), auth,
    data: { draftId: 'draft-1', expectedVersion: 5 },
    saveRecommendationImpl: async () => assert.fail('idempotent replay must not save again'),
  });
  assert.equal(replay.idempotentReplay, true);
  assert.equal(replay.publicationStatus, 'moderation_hold');
  assert.equal(replay.publiclyVisible, false);
});

test('publication refuses to acknowledge success if the claimed pointer no longer matches', async () => {
  const ownerPath = 'system/recommendationDrafts/owners/owner';
  const versionPath = `${ownerPath}/draftVersions/version-2`;
  const receiptPath = `${ownerPath}/publicationReceipts/draft-1`;
  let transactionCount = 0;
  const pointer = {
    ownerId: 'owner', draftId: 'draft-1', version: 2, versionPath,
    sourceRecommendationId: null, state: 'draft',
    publishRequestId: '123e4567-e89b-42d3-a456-426614174000',
  };
  const refFor = (path) => ({
    path,
    collection: (name) => ({ doc: (id) => refFor(`${path}/${name}/${id}`) }),
    get: async () => path === ownerPath
      ? { exists: true, data: () => pointer }
      : path === versionPath
        ? { exists: true, ref: refFor(path), data: () => ({ ownerId: 'owner', state: 'draft', draft: partialDraft({ title: 'כותרת', description: 'תיאור', budget: 'economy', media: [media('asset-1')] }) }) }
      : { exists: false },
  });
  const db = {
    doc: refFor,
    runTransaction: async (work) => {
      transactionCount += 1;
      return work({
        get: async (ref) => ref.path === receiptPath
          ? { exists: false }
          : { exists: true, data: () => transactionCount === 1
            ? pointer
            : { ...pointer, version: 3, state: 'draft' } },
        set: () => {},
        update: () => {},
        delete: () => {},
      });
    },
  };
  await assert.rejects(publishRecommendationDraft({
    admin: firestoreAdmin(db), auth,
    data: { draftId: 'draft-1', expectedVersion: 2 },
    saveRecommendationImpl: async () => ({ recommendationId: 'rec-1' }),
  }), (error) => error?.details?.reason === 'RECOMMENDATION_DRAFT_VERSION_CONFLICT');
});

test('cleanup only deletes expired artifacts in the recommendation-draft namespace', async () => {
  const deleted = [];
  const versionDocs = [
    'system/recommendationDrafts/owners/owner/draftVersions/v1',
    'system/routeDrafts/owners/owner/draftVersions/v1',
  ];
  const receiptDocs = [
    'system/recommendationDrafts/owners/owner/publicationReceipts/draft-1',
    'recommendations/rec-1/publicationReceipts/unrelated',
  ];
  const queryFor = (paths) => {
    const query = {
      where: () => query,
      limit: () => query,
      get: async () => ({
        size: paths.length,
        docs: paths.map((path) => ({ ref: { path, delete: async () => deleted.push(path) } })),
      }),
    };
    return query;
  };
  const result = await cleanupRecommendationDraftArtifacts({
    admin: firestoreAdmin({
      collectionGroup: (name) => queryFor(name === 'draftVersions' ? versionDocs : receiptDocs),
    }),
  });
  assert.deepEqual(deleted, [versionDocs[0], receiptDocs[0]]);
  assert.deepEqual(result, { scanned: 4, deleted: 2 });
});
