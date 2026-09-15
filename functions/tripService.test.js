const test = require('node:test');
const assert = require('node:assert/strict');

const {
  applyPrivateTripOperations,
  assertTripAllocationAvailable,
  copySharedTrip,
  createTripShare,
  createPrivateTrip,
  deletePrivateTrip,
  distanceFromPathKm,
  MAX_ACTIVE_TRIPS_PER_USER,
  operationReceiptId,
  revokeTripShare,
  saveTrip,
  shareTokenHash,
  tripQuotaId,
} = require('./tripService');
const {
  cleanCustomStop,
  cleanDate,
  cleanOperations,
} = require('./tripPlannerValidation');
const {
  chunkRoutePoints,
  requestRouteChunk,
} = require('./tripRouteService');

const DELETE = Symbol('delete');

class FakeSnapshot {
  constructor(ref, value) {
    this.ref = ref;
    this.id = ref.id;
    this.exists = value !== undefined;
    this.value = value;
  }

  data() {
    return this.value;
  }
}

class FakeReference {
  constructor(store, path) {
    this.store = store;
    this.path = path;
    this.id = path.split('/').at(-1);
  }

  collection(name) {
    return new FakeCollection(this.store, `${this.path}/${name}`);
  }

  async get() {
    return new FakeSnapshot(this, this.store.documents.get(this.path));
  }
}

class FakeCollection {
  constructor(store, path) {
    this.store = store;
    this.path = path;
  }

  doc(id) {
    const documentId = id || `auto-${++this.store.sequence}`;
    return new FakeReference(this.store, `${this.path}/${documentId}`);
  }

  orderBy(field) {
    return {
      get: async () => {
        const prefix = `${this.path}/`;
        const depth = this.path.split('/').length + 1;
        const docs = Array.from(this.store.documents.entries())
          .filter(([path]) => path.startsWith(prefix) && path.split('/').length === depth)
          .map(([path, value]) => new FakeSnapshot(new FakeReference(this.store, path), value))
          .sort((left, right) => {
            const leftValue = left.data()?.[field];
            const rightValue = right.data()?.[field];
            return Number.isFinite(Number(leftValue)) && Number.isFinite(Number(rightValue))
              ? Number(leftValue) - Number(rightValue)
              : String(leftValue || '').localeCompare(String(rightValue || ''));
          });
        return { docs, size: docs.length, empty: docs.length === 0 };
      },
    };
  }
}

function applyWrite(documents, write) {
  if (write.kind === 'delete') {
    documents.delete(write.ref.path);
    return;
  }
  const previous = documents.get(write.ref.path) || {};
  const next = write.kind === 'set' && !write.options?.merge ? { ...write.data } : { ...previous, ...write.data };
  Object.entries(next).forEach(([key, value]) => {
    if (value === DELETE) delete next[key];
  });
  documents.set(write.ref.path, next);
}

function fakeAdmin(seed = {}) {
  const store = {
    documents: new Map(Object.entries(seed)),
    sequence: 0,
    doc(path) { return new FakeReference(store, path); },
    collection(path) { return new FakeCollection(store, path); },
    batch() {
      const writes = [];
      return {
        set(ref, data, options) { writes.push({ kind: 'set', ref, data, options }); },
        update(ref, data) { writes.push({ kind: 'update', ref, data }); },
        delete(ref) { writes.push({ kind: 'delete', ref }); },
        async commit() { writes.forEach((write) => applyWrite(store.documents, write)); },
      };
    },
    async runTransaction(handler) {
      const writes = [];
      const transaction = {
        get: async (ref) => new FakeSnapshot(ref, store.documents.get(ref.path)),
        set: (ref, data, options) => writes.push({ kind: 'set', ref, data, options }),
        update: (ref, data) => writes.push({ kind: 'update', ref, data }),
        delete: (ref) => writes.push({ kind: 'delete', ref }),
      };
      const result = await handler(transaction);
      writes.forEach((write) => applyWrite(store.documents, write));
      return result;
    },
    async recursiveDelete(ref) {
      for (const path of Array.from(store.documents.keys())) {
        if (path === ref.path || path.startsWith(`${ref.path}/`)) store.documents.delete(path);
      }
    },
  };
  const firestore = Object.assign(() => store, {
    FieldValue: {
      serverTimestamp: () => new Date('2026-09-15T10:00:00.000Z'),
      delete: () => DELETE,
    },
  });
  return { firestore, documents: store.documents };
}

const auth = { uid: 'owner' };

const activeRecommendation = {
  status: 'active',
  publicationGate: { destinationApprovalVerified: true },
  title: 'תצפית הכרמל',
  mapLocation: { lat: 32.75, lng: 35.01 },
  place: { address: 'חיפה' },
  destination: { countryId: 'IL', cityId: 'haifa', countryName: 'ישראל', cityName: 'חיפה' },
  media: [],
};

test('planner validation rejects impossible dates and exact stops without coordinates', () => {
  assert.throws(() => cleanDate('2026-02-31'), /date is invalid/);
  assert.throws(() => cleanCustomStop({ title: 'עצירה', locationMode: 'exact' }), /coordinates/);
  assert.deepEqual(cleanCustomStop({ title: 'אזור השרון', locationMode: 'general' }), {
    sourceType: 'custom',
    title: 'אזור השרון',
    subtitle: '',
    note: '',
    locationMode: 'general',
    coordinates: null,
  });
  assert.throws(() => cleanOperations(new Array(51).fill({ type: 'set_title', title: 'x' })), /operations/);
});

test('private trip creation builds ideas and first-day containers and can seed a recommendation', async () => {
  const admin = fakeAdmin({ 'recommendations/rec-1': activeRecommendation });
  const result = await createPrivateTrip({
    admin,
    auth,
    idempotencyKey: 'test-key',
    data: { title: 'סוף שבוע בחיפה', seedRecommendationId: 'rec-1' },
  });
  const root = admin.documents.get(`trips/${result.tripId}`);
  const ideas = admin.documents.get(`trips/${result.tripId}/days/${result.ideasDayId}`);
  const firstDay = admin.documents.get(`trips/${result.tripId}/days/${result.firstDayId}`);
  assert.equal(root.kind, 'private_planner');
  assert.equal(root.ownerId, 'owner');
  assert.equal(root.state, 'active');
  assert.equal(root.stopCount, 1);
  assert.equal(ideas.kind, 'ideas');
  assert.equal(ideas.stopCount, 1);
  assert.equal(firstDay.kind, 'day');
  assert.equal(admin.documents.get(
    `trips/${result.tripId}/days/${result.ideasDayId}/stops/${result.seedStopId}`
  ).recommendationId, 'rec-1');
  assert.equal(admin.documents.get(
    `system/tripPlannerQuotas/accounts/${tripQuotaId('owner', 'test-key')}`
  ).activeTripCount, 1);
  assert.equal(admin.documents.get(
    `system/tripPlannerQuotas/accounts/${tripQuotaId('owner', 'test-key')}`
  ).ownerId, 'owner');
});

test('active trip quota rejects new allocation before any trip document is written', async () => {
  const quotaPath = `system/tripPlannerQuotas/accounts/${tripQuotaId('owner', 'test-key')}`;
  const admin = fakeAdmin({ [quotaPath]: { activeTripCount: MAX_ACTIVE_TRIPS_PER_USER } });
  await assert.rejects(createPrivateTrip({
    admin,
    auth,
    idempotencyKey: 'test-key',
    data: { title: 'One too many' },
  }), (error) => error.code === 'resource-exhausted'
    && error.details?.reason === 'TRIP_LIMIT_REACHED');
  assert.equal(Array.from(admin.documents.keys()).some((path) => path.startsWith('trips/')), false);
  assert.throws(
    () => assertTripAllocationAvailable({ activeTripCount: MAX_ACTIVE_TRIPS_PER_USER }),
    (error) => error.details?.reason === 'TRIP_LIMIT_REACHED'
  );
});

test('trip deletion decrements account quota once and recursively removes descendants', async () => {
  const admin = fakeAdmin();
  const created = await createPrivateTrip({
    admin, auth, idempotencyKey: 'test-key', data: { title: 'Delete me' },
  });
  const quotaPath = `system/tripPlannerQuotas/accounts/${tripQuotaId('owner', 'test-key')}`;
  assert.equal(admin.documents.get(quotaPath).activeTripCount, 1);
  await deletePrivateTrip({
    admin, auth, idempotencyKey: 'test-key', data: { tripId: created.tripId },
  });
  assert.equal(admin.documents.get(quotaPath).activeTripCount, 0);
  assert.equal(Array.from(admin.documents.keys()).some((path) => (
    path === `trips/${created.tripId}` || path.startsWith(`trips/${created.tripId}/`)
  )), false);
});

test('rotating and revoking a private share makes old tokens expiring runtime data', async () => {
  const admin = fakeAdmin();
  const created = await createPrivateTrip({
    admin, auth, idempotencyKey: 'test-key', data: { title: 'Share me' },
  });
  const first = await createTripShare({ admin, auth, data: { tripId: created.tripId } });
  const firstToken = first.deepLink.split('/').at(-1);
  const firstHash = shareTokenHash(firstToken);
  await createTripShare({ admin, auth, data: { tripId: created.tripId } });
  const rotated = admin.documents.get(`system/runtime/tripShareTokens/${firstHash}`);
  assert.equal(rotated.status, 'revoked');
  assert(rotated.expireAt instanceof Date);
  const result = await revokeTripShare({ admin, auth, data: { tripId: created.tripId } });
  assert.deepEqual(result, { tripId: created.tripId, revoked: true });
  const root = admin.documents.get(`trips/${created.tripId}`);
  assert.equal(Object.hasOwn(root, 'activeShareHash'), false);
  const revokedRows = Array.from(admin.documents.entries())
    .filter(([path, value]) => path.startsWith('system/runtime/tripShareTokens/')
      && value.status === 'revoked');
  assert.equal(revokedRows.length, 2);
  assert(revokedRows.every(([, value]) => value.expireAt instanceof Date));
});

test('copying a shared trip uses the same atomic destination-account quota', async () => {
  const admin = fakeAdmin();
  const created = await createPrivateTrip({
    admin, auth, idempotencyKey: 'test-key', data: { title: 'Original' },
  });
  const share = await createTripShare({ admin, auth, data: { tripId: created.tripId } });
  const token = share.deepLink.split('/').at(-1);
  const copyAuth = { uid: 'copy-owner' };
  const quotaPath = `system/tripPlannerQuotas/accounts/${tripQuotaId(copyAuth.uid, 'test-key')}`;
  admin.documents.set(quotaPath, { activeTripCount: MAX_ACTIVE_TRIPS_PER_USER });
  const rootsBefore = Array.from(admin.documents.keys())
    .filter((path) => path.startsWith('trips/') && path.split('/').length === 2).length;
  await assert.rejects(copySharedTrip({
    admin, auth: copyAuth, idempotencyKey: 'test-key', data: { token },
  }), (error) => error.code === 'resource-exhausted'
    && error.details?.reason === 'TRIP_LIMIT_REACHED');
  const rootsAfter = Array.from(admin.documents.keys())
    .filter((path) => path.startsWith('trips/') && path.split('/').length === 2).length;
  assert.equal(rootsAfter, rootsBefore);

  admin.documents.set(quotaPath, { activeTripCount: 0 });
  const copied = await copySharedTrip({
    admin, auth: copyAuth, idempotencyKey: 'test-key', data: { token },
  });
  assert.equal(admin.documents.get(`trips/${copied.tripId}`).ownerId, copyAuth.uid);
  assert.equal(admin.documents.get(quotaPath).activeTripCount, 1);
  assert.equal(admin.documents.get(quotaPath).ownerId, copyAuth.uid);
});

test('idempotent operations add mixed stops once and reject stale revisions', async () => {
  const admin = fakeAdmin({ 'recommendations/rec-1': activeRecommendation });
  const created = await createPrivateTrip({ admin, auth, data: { title: 'טיול' } });
  const request = {
    admin,
    auth,
    idempotencyKey: 'test-key',
    data: {
      tripId: created.tripId,
      expectedRevision: 1,
      operationId: 'mix:1',
      operations: [
        { type: 'add_recommendation_stops', dayId: created.firstDayId, recommendationIds: ['rec-1'] },
        {
          type: 'add_custom_stop',
          dayId: created.firstDayId,
          clientId: 'custom-1',
          stop: {
            title: 'קפה בדרך', subtitle: 'חיפה', locationMode: 'pin',
            coordinates: { lat: 32.8, lng: 34.99 },
          },
        },
      ],
    },
  };
  const first = await applyPrivateTripOperations(request);
  const second = await applyPrivateTripOperations(request);
  assert.deepEqual(second, first);
  assert.equal(first.revision, 2);
  assert.equal(first.createdStopIds.length, 2);
  assert.equal(admin.documents.get(`trips/${created.tripId}`).stopCount, 2);
  assert.equal(admin.documents.get(`trips/${created.tripId}/days/${created.firstDayId}`).stopCount, 2);
  await assert.rejects(applyPrivateTripOperations({
    ...request,
    data: { ...request.data, operationId: 'stale:2', operations: [{ type: 'set_title', title: 'חדש' }] },
  }), (error) => error.code === 'aborted' && error.details?.reason === 'REVISION_CONFLICT');
});

test('operations reject access to another owner trip', async () => {
  const admin = fakeAdmin({
    'trips/trip-1': {
      kind: 'private_planner', ownerId: 'other', title: 'Private', state: 'active',
      ideasDayId: 'ideas', dayCount: 1, stopCount: 0, revision: 1, nextDayOrder: 2,
    },
  });
  await assert.rejects(applyPrivateTripOperations({
    admin,
    auth,
    idempotencyKey: 'key',
    data: {
      tripId: 'trip-1', expectedRevision: 1, operationId: 'owner-check',
      operations: [{ type: 'set_title', title: 'Hijack' }],
    },
  }), (error) => error.code === 'permission-denied');
});

test('a stop moves atomically from ideas into a planned day', async () => {
  const admin = fakeAdmin();
  const created = await createPrivateTrip({ admin, auth, data: { title: 'Move' } });
  await applyPrivateTripOperations({
    admin, auth, idempotencyKey: 'key',
    data: {
      tripId: created.tripId, expectedRevision: 1, operationId: 'add-for-move',
      operations: [{
        type: 'add_custom_stop', dayId: created.ideasDayId, clientId: 'moving-stop',
        stop: { title: 'רעיון', locationMode: 'general' },
      }],
    },
  });
  const moved = await applyPrivateTripOperations({
    admin, auth, idempotencyKey: 'key',
    data: {
      tripId: created.tripId, expectedRevision: 2, operationId: 'move-to-day',
      operations: [{
        type: 'move_stop', dayId: created.ideasDayId,
        targetDayId: created.firstDayId, stopId: 'moving-stop',
      }],
    },
  });
  assert.equal(moved.revision, 3);
  assert.equal(admin.documents.has(`trips/${created.tripId}/days/${created.ideasDayId}/stops/moving-stop`), false);
  assert.equal(admin.documents.get(`trips/${created.tripId}/days/${created.firstDayId}/stops/moving-stop`).title, 'רעיון');
  assert.equal(admin.documents.get(`trips/${created.tripId}/days/${created.ideasDayId}`).stopCount, 0);
  assert.equal(admin.documents.get(`trips/${created.tripId}/days/${created.firstDayId}`).stopCount, 1);
});

test('route point chunking overlaps boundaries without losing a leg', () => {
  const points = Array.from({ length: 25 }, (_, index) => ({ stopId: String(index) }));
  const chunks = chunkRoutePoints(points, 12);
  assert.deepEqual(chunks.map((chunk) => chunk.length), [12, 12, 3]);
  assert.equal(chunks[0].at(-1), chunks[1][0]);
  assert.equal(chunks[1].at(-1), chunks[2][0]);
});

test('route provider response is bounded to polyline, distance and duration', async () => {
  let request;
  const result = await requestRouteChunk({
    accessToken: 'secret-token',
    billingProject: 'planli-f0b12',
    travelMode: 'DRIVE',
    points: [
      { stopId: 'one', coordinates: { lat: 32, lng: 34 } },
      { stopId: 'two', coordinates: { lat: 33, lng: 35 } },
    ],
    fetchImpl: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        json: async () => ({
          routes: [{ distanceMeters: 1234, duration: '321.4s', polyline: { encodedPolyline: 'encoded' } }],
        }),
      };
    },
  });
  assert.equal(request.options.headers.Authorization, 'Bearer secret-token');
  assert.equal(result.encodedPolyline, 'encoded');
  assert.equal(result.durationSeconds, 321);
  assert.deepEqual(Object.keys(result).sort(), [
    'distanceMeters', 'durationSeconds', 'encodedPolyline', 'fromStopId', 'toStopId',
  ]);
});

test('near-route geometry and security hashes are deterministic', () => {
  assert(distanceFromPathKm({ lat: 32.5, lng: 34.5 }, [
    { lat: 32, lng: 34 }, { lat: 33, lng: 35 },
  ]) < 1);
  assert.equal(shareTokenHash('x'.repeat(43)), shareTokenHash('x'.repeat(43)));
  assert.notEqual(operationReceiptId('a', 'b', 'c', 'key'), operationReceiptId('a', 'b', 'd', 'key'));
});

test('legacy public trip publishing is decommissioned', async () => {
  await assert.rejects(saveTrip(), (error) => (
    error.code === 'failed-precondition'
    && error.details?.reason === 'PRIVATE_TRIP_PLANNER_REQUIRED'
  ));
});

test('legacy trip projection and media triggers ignore private planner writes', () => {
  const source = require('node:fs').readFileSync(require.resolve('./index'), 'utf8');
  for (const exportName of [
    'onTripMediaCleanup',
    'onTripFavoriteProjection',
    'onTripAdminSearchWritten',
  ]) {
    const start = source.indexOf(`exports.${exportName}`);
    assert.notEqual(start, -1, `Missing ${exportName}`);
    const block = source.slice(start, source.indexOf('\n);', start) + 3);
    assert.match(block, /kind === 'private_planner'/u, `${exportName} must ignore private trips`);
  }
});
