const test = require('node:test');
const assert = require('node:assert/strict');

const { listDestinationReviews, qualityIssues } = require('./destinationAdminService');
const { nearestScheduledAirports } = require('./airportFacts');

function validDestination() {
  return {
    status: 'active',
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
  for (const code of ['missing_english_name', 'missing_google_place', 'country_conflict', 'missing_coordinates', 'missing_image', 'image_job_failed', 'identity_job_failed', 'new_destination']) {
    assert.ok(codes.has(code), `missing issue ${code}`);
  }
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
      if (path === 'system/moderation/admins/admin-1') return { get: async () => ({ exists: true }) };
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
