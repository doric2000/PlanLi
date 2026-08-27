const test = require('node:test');
const assert = require('node:assert/strict');

const {
  qualityIssues,
  holdDestinationContentDocuments,
  listDestinationReviews,
  notifyAdminsOfDestination,
  destinationCoordinates,
  selectAirportByIataCode,
  syncDestinationAirport,
} = require('./destinationAdminService');
const { nearestScheduledAirports } = require('./airportFacts');

function validDestination() {
  return {
    status: 'active',
    canonicalPolicy: { approved: true, registryId: 'il-tel-aviv', kind: 'city_hub', groupingPolicy: 'self' },
    providerRefs: { googlePlaceId: 'place-1' },
    googleCache: {
      names: { he: 'תל אביב', en: 'Tel Aviv' },
      countryCode: 'IL',
      coordinates: { lat: 32.08, lng: 34.78 },
      expiresAt: new Date('2030-01-01T00:00:00Z'),
    },
    identity: { countryCode: 'IL' },
    destinationImage: {
      source: { type: 'unsplash' },
      urls: { large: 'https://example.com/l', feed: 'https://example.com/f', thumb: 'https://example.com/t' },
      attribution: { providerName: 'Unsplash' },
      selection: { validation: { version: 1 } },
    },
    travelFacts: { closestAirport: { iataCode: 'TLV' } },
  };
}

test('destination quality accepts complete reviewed data', () => {
  assert.deepEqual(qualityIssues(validDestination(), {}, { approvedAt: new Date() }, Date.parse('2029-01-01')), []);
});

test('destination quality reports identity, image, airport and job problems', () => {
  const issues = qualityIssues({ googleCache: { names: { he: 'עיר' }, countryCode: 'IL' }, identity: { countryCode: 'US' } }, {
    imageSync: { state: 'failed' }, identitySync: { state: 'needs_review' },
  }, {});
  const codes = new Set(issues.map((issue) => issue.code));
  for (const code of ['missing_english_name', 'missing_google_place', 'country_conflict', 'missing_coordinates', 'missing_image', 'image_job_failed', 'identity_job_failed', 'unapproved_canonical_destination', 'new_destination']) {
    assert.ok(codes.has(code), `missing issue ${code}`);
  }
});

test('destination quality rejects Latin-only Hebrew names and flags transliteration for review', () => {
  const latin = validDestination();
  latin.googleCache.names.he = 'Vlore';
  assert.ok(qualityIssues(latin).some((issue) => issue.code === 'missing_hebrew_name'));

  const fallback = validDestination();
  fallback.googleCache.nameSources = { he: 'transliteration_fallback', en: 'google' };
  const issue = qualityIssues(fallback).find((entry) => entry.code === 'fallback_hebrew_name');
  assert.equal(issue?.severity, 'warning');
});

test('destinationCoordinates reads multiple coordinate shapes', () => {
  assert.deepEqual(destinationCoordinates({
    coords: { latitude: 32.08, longitude: 34.78 },
  }), { lat: 32.08, lng: 34.78 });
  assert.deepEqual(destinationCoordinates({
    mapLocation: { geometry: { coordinates: [-80.1918, 25.7617] } },
  }), { lat: 25.7617, lng: -80.1918 });
  assert.deepEqual(destinationCoordinates({
    location: { lat: 48.8566, lng: 2.3522 },
  }), { lat: 48.8566, lng: 2.3522 });
  assert.deepEqual(destinationCoordinates({
    googleCache: { geometry: { location: { lat: 31.7767, lng: 35.2345 } } },
  }), { lat: 31.7767, lng: 35.2345 });
  assert.deepEqual(destinationCoordinates({
    identity: { geometry: { location: { lat: 33.66, lng: -95.5555 } } },
  }), { lat: 33.66, lng: -95.5555 });
  assert.equal(destinationCoordinates({ place: {} }), null);
});

test('destination discovery retries use the same durable notification generation', async () => {
  const calls = [];
  const destination = {
    notificationVersion: 1,
    names: { he: '×—×™×¤×”' },
    image: { urls: { thumb: 'https://example.com/haifa.jpg' } },
  };
  const fanout = async (input) => { calls.push(input); return { delivered: 1 }; };

  await notifyAdminsOfDestination({
    admin: {}, countryId: 'il', cityId: 'haifa', destination, fanout,
  });
  await notifyAdminsOfDestination({
    admin: {}, countryId: 'il', cityId: 'haifa', destination, fanout,
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].notificationId, calls[1].notificationId);
  assert.equal(calls[0].activityVersion, 1);
  assert.equal(calls[1].activityVersion, 1);
  assert.equal(calls[0].createOnly, true);
});

test('holding destination content writes the status, notification, and unread counter atomically', async () => {
  const content = {
    ownerId: 'owner-1',
    status: 'active',
    title: 'A recommendation',
    media: [{ url: 'https://example.com/photo.jpg' }],
  };
  const contentRef = {
    id: 'post-1',
    path: 'recommendations/post-1',
    parent: { id: 'recommendations' },
  };
  const entry = { id: 'post-1', ref: contentRef };
  const writes = [];
  const db = {
    doc: (path) => ({ path }),
    runTransaction: async (callback) => {
      let writeStarted = false;
      const transaction = {
        get: async (ref) => {
          assert.equal(writeStarted, false, 'all transaction reads must precede writes');
          if (ref.path === contentRef.path) return { exists: true, data: () => ({ ...content }) };
          if (ref.path === 'users/owner-1') return { exists: true, data: () => ({}) };
          return { exists: false, data: () => undefined };
        },
        update: (ref, patch) => {
          writeStarted = true;
          Object.assign(content, patch);
          writes.push({ operation: 'update', path: ref.path, patch });
        },
        set: (ref, value, options) => {
          writeStarted = true;
          writes.push({ operation: 'set', path: ref.path, value, options });
        },
      };
      return callback(transaction);
    },
  };
  const firestore = () => db;
  firestore.FieldValue = {
    increment: (value) => ({ increment: value }),
    serverTimestamp: () => 'server-time',
  };
  const patch = { status: 'moderation_hold', updatedAt: 'server-time' };

  await holdDestinationContentDocuments({
    admin: { firestore },
    documents: [entry],
    patch,
  });

  assert.equal(content.status, 'moderation_hold');
  assert.equal(writes.filter((write) => write.operation === 'update').length, 1);
  const notificationWrite = writes.find((write) => write.path.startsWith('users/owner-1/notifications/'));
  assert.equal(notificationWrite.value.schemaVersion, 2);
  assert.equal(notificationWrite.value.subtype, 'content_held');
  assert.equal(notificationWrite.value.target.id, 'post-1');
  assert.deepEqual(notificationWrite.value.target.thumbUrls, ['https://example.com/photo.jpg']);
  const stateWrite = writes.find((write) => write.path === 'users/owner-1/notificationState/state');
  assert.deepEqual(stateWrite.value.personalUnread, { increment: 1 });

  const writeCount = writes.length;
  await holdDestinationContentDocuments({
    admin: { firestore },
    documents: [entry],
    patch,
  });
  assert.equal(writes.length, writeCount, 'retry must skip content already placed on hold');
});

test('airport candidates are bounded, sorted and distance annotated', () => {
  const result = nearestScheduledAirports({ lat: 0, lng: 0 }, [
    { ident: 'B', iataCode: 'BBB', coordinates: { lat: 1, lng: 0 } },
    { ident: 'A', iataCode: 'AAA', coordinates: { lat: 0.1, lng: 0 } },
    { ident: 'C', iataCode: 'CCC', coordinates: { lat: 20, lng: 20 } },
  ], { limit: 2, maxDistanceKm: 300 });
  assert.deepEqual(result.map((entry) => entry.iataCode), ['AAA', 'BBB']);
  assert.ok(result[0].distanceKm < result[1].distanceKm);
});

test('selectAirportByIataCode is stable against spacing, casing and list limit artifacts', () => {
  const airports = [
    { ident: 'A', iataCode: 'AAA', coordinates: { lat: 0.1, lng: 0 } },
    { ident: 'B', iataCode: 'BBB', coordinates: { lat: 0.2, lng: 0 } },
    { ident: 'C', iataCode: 'CCC', coordinates: { lat: 3, lng: 3 } },
  ];
  const coordinates = { lat: 0, lng: 0 };
  const result = selectAirportByIataCode(coordinates, airports, ' bbb ', { limit: 1 });
  assert.equal(result.iataCode, 'BBB');
  assert.equal(result.ident, 'B');
});

test('selectAirportByIataCode can skip nearby limit when admin sets override', () => {
  const airports = [
    { ident: 'MIA', iataCode: 'MIA', coordinates: { lat: 40.0, lng: 40.0 } },
  ];
  assert.equal(
    selectAirportByIataCode({ lat: 0, lng: 0 }, airports, 'MIA', { limit: 1, enforceMaxDistance: false }).iataCode,
    'MIA'
  );
});

test('selectAirportByIataCode can bypass distance cap for explicit manual matches', () => {
  const airports = [
    { ident: 'NEAR', iataCode: 'AAA', coordinates: { lat: 1, lng: 1 } },
    { ident: 'MIA', iataCode: 'MIA', coordinates: { lat: 40, lng: 40 } },
    ...Array.from({ length: 18 }, (_, index) => ({
      ident: `F${String(index).padStart(2, '0')}`,
      iataCode: `F${String(index + 2).padStart(2, '0')}`,
      coordinates: { lat: 20 + index * 0.1, lng: 20 + index * 0.1 },
    })),
  ];
  const result = selectAirportByIataCode(
    { lat: 0, lng: 0 },
    airports,
    'MIA',
    { limit: 1, maxDistanceKm: 300, enforceMaxDistance: false }
  );
  assert.equal(result.iataCode, 'MIA');
});

test('syncDestinationAirport does not overwrite an existing closestAirport when forced', async () => {
  const cityData = { travelFacts: { closestAirport: { iataCode: 'TLV' } } };
  const db = {
    doc(path) {
      if (path === 'countries/c1/destinations/city-1') {
        return {
          get: async () => ({ exists: true, data: () => cityData }),
        };
      }
      if (path === 'countries/c1') return { get: async () => ({ exists: true, data: () => ({ name: 'Israel' }) }) };
      if (path === 'system/runtime/destinationJobs/c1_city-1') return { get: async () => ({ exists: false, data: () => ({}) }) };
      if (path.startsWith('system/moderation/destinationReviews/')) return { get: async () => ({ exists: false, data: () => ({}) }) };
      throw new Error(`Unexpected Firestore path: ${path}`);
    },
    FieldValue: { serverTimestamp: () => 'server-time' },
  };
  const admin = { firestore: () => db };
  const result = await syncDestinationAirport({
    admin,
    countryId: 'c1',
    cityId: 'city-1',
    applyWhenMissingOnly: true,
  });
  assert.equal(result.updated, false);
  assert.equal(result.updatedByAdmin, false);
  assert.equal(cityData.travelFacts.closestAirport.iataCode, 'TLV');
});

test('listing destination reviews is a pure read and never starts a quality scan', async () => {
  let collectionGroupCalls = 0;
  const query = {
    orderBy: () => query,
    limit: () => query,
    where: () => query,
    get: async () => ({ size: 0, docs: [] }),
  };
  const db = {
    doc(path) {
      if (path === 'system/moderation/admins/admin-1') return { get: async () => ({ exists: true, data: () => ({ active: true }) }) };
      throw new Error(`Unexpected Firestore path: ${path}`);
    },
    collection(path) {
      assert.equal(path, 'system/moderation/destinationReviews');
      return query;
    },
    collectionGroup() {
      collectionGroupCalls += 1;
      throw new Error('list must not scan destinations');
    },
  };
  const result = await listDestinationReviews({
    admin: { firestore: () => db },
    auth: { uid: 'admin-1', token: { admin: true } },
    data: {},
  });
  assert.deepEqual(result, { items: [], nextCursor: null });
  assert.equal(collectionGroupCalls, 0);
});

test('listing destination reviews puts pending cities before approved cities', async () => {
  const pendingDoc = { id: 'pending', data: () => ({ status: 'open', names: { he: 'ממתינה' } }) };
  const approvedDoc = { id: 'approved', data: () => ({ status: 'approved', names: { he: 'מאושרת' } }) };
  const responses = [[pendingDoc], [approvedDoc]];
  const whereCalls = [];
  const query = {
    where: (...args) => { whereCalls.push(args); return query; },
    orderBy: () => query,
    limit: () => query,
    get: async () => ({ docs: responses.shift() || [] }),
  };
  const db = {
    doc(path) {
      if (path === 'system/moderation/admins/admin-1') return { get: async () => ({ exists: true, data: () => ({ active: true }) }) };
      throw new Error(`Unexpected Firestore path: ${path}`);
    },
    collection(path) {
      assert.equal(path, 'system/moderation/destinationReviews');
      return query;
    },
  };
  const result = await listDestinationReviews({
    admin: { firestore: () => db },
    auth: { uid: 'admin-1', token: { admin: true } },
    data: {},
  });
  assert.deepEqual(result.items.map((item) => item.id), ['pending', 'approved']);
  assert.deepEqual(whereCalls, [
    ['status', 'in', ['blocked', 'open', 'ready']],
    ['status', 'in', ['approved', 'approved_with_warnings', 'inactive']],
  ]);
});
