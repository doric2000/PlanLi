const test = require('node:test');
const assert = require('node:assert/strict');

const { saveTrip } = require('./tripService');

const approvedCanonicalPolicy = {
  approved: true,
  registryId: 'test-approved',
  kind: 'city_hub',
  groupingPolicy: 'self',
  registryVersion: 3,
  approvalRevision: 1,
  registryAttestation: {
    approved: true, registryId: 'test-approved', registryVersion: 3,
    approvalRevision: 1, countryId: 'IL',
  },
};

function fakeAdmin(seed) {
  const documents = new Map(Object.entries(seed));
  const makeRef = (path) => ({
    path,
    id: path.split('/').at(-1),
    get: async () => ({
      exists: documents.has(path),
      data: () => documents.get(path),
      ref: makeRef(path),
    }),
  });
  const snapshot = (ref) => ({
    exists: documents.has(ref.path),
    data: () => documents.get(ref.path),
    ref,
  });
  const db = {
    doc: makeRef,
    runTransaction: async (handler) => handler({
      get: async (ref) => snapshot(ref),
      set: (ref, data) => documents.set(ref.path, data),
    }),
  };
  return {
    documents,
    firestore: Object.assign(() => db, {
      FieldValue: { serverTimestamp: () => 'time' },
    }),
  };
}

test('trip edits cannot remove a source destination while its reassignment is running', async () => {
  const admin = fakeAdmin({
    'trips/trip-1': {
      ownerId: 'owner', status: 'active', media: [],
      destination: { countryId: 'IL', cityId: 'source' },
    },
    'countries/IL': { name: 'ישראל', status: 'active' },
    'countries/IL/destinations/source': {
      names: { he: 'יעד מקור', en: 'Source' }, status: 'active',
      reassignment: { state: 'reassigning', jobId: 'job-1' },
    },
    'countries/IL/destinations/target': {
      names: { he: 'יעד חדש', en: 'Target' }, status: 'active',
      canonicalPolicy: approvedCanonicalPolicy,
    },
  });
  const auth = {
    uid: 'owner',
    token: { email_verified: true, firebase: { sign_in_provider: 'password' } },
  };

  await assert.rejects(saveTrip({
    admin,
    auth,
    data: {
      tripId: 'trip-1',
      trip: {
        title: 'טיול חדש', description: 'טיול שעובר ליעד אחר', media: [],
        destination: { countryId: 'IL', cityId: 'target' },
      },
    },
  }), /being reassigned/);
  assert.equal(admin.documents.get('trips/trip-1').destination.cityId, 'source');
});
