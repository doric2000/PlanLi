const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildPublicationManifest,
  decodeFirestoreValue,
  loadLiveRecordsRest,
  migrationReceiptPath,
  normalizedUpdateTime,
  parseArgs,
} = require('./migrateDestinationPublicationGate');
const { catalogId } = require('../destinationCatalogService');

const approvedPolicy = {
  approved: true,
  registryId: 'il-approved-city',
  kind: 'city_hub',
  groupingPolicy: 'self',
  registryVersion: 3,
};

test('publication migration removes unapproved catalog data, holds unsafe content and backfills verified gates', () => {
  const manifest = buildPublicationManifest({
    countries: [{ id: 'IL', data: { status: 'active', code: 'IL' } }],
    registry: [{
      id: 'il-approved-city',
      path: 'system/destinationRegistry/entries/il-approved-city',
      updateTime: 'g1',
      data: {
        status: 'active',
        countryCode: 'IL',
        names: { he: 'עיר מאושרת', en: 'Approved City' },
        aliases: ['Approved City'],
        kind: 'city_hub',
        groupingPolicy: 'self',
        center: { lat: 32, lng: 34 },
        radiusKm: 20,
        providerRefs: { googlePlaceId: 'google-place-approved' },
        googleTypes: ['locality'],
        registryVersion: 3,
        approval: { approvedByAdmin: true },
      },
    }],
    destinations: [
      {
        path: 'countries/IL/destinations/approved', countryId: 'IL', cityId: 'approved', updateTime: 'd1',
        data: { status: 'active', canonicalPolicy: approvedPolicy, stats: { recommendationCount: 9 } },
      },
      {
        path: 'countries/IL/destinations/pending', countryId: 'IL', cityId: 'pending', updateTime: 'd2',
        data: {
          status: 'active', stats: { recommendationCount: 4 },
          canonicalPolicy: { ...approvedPolicy, approved: false, registryId: 'il-pending-city' },
        },
      },
    ],
    catalog: [
      {
        path: `destinationCatalog/${catalogId('IL', 'approved')}`,
        updateTime: 'c1', data: { countryId: 'IL', cityId: 'approved' },
      },
      {
        path: `destinationCatalog/${catalogId('IL', 'pending')}`,
        updateTime: 'c2', data: { countryId: 'IL', cityId: 'pending' },
      },
    ],
    contents: [
      {
        type: 'recommendation', path: 'recommendations/safe', updateTime: 'r1',
        data: { status: 'active', destination: { countryId: 'IL', cityId: 'approved' } },
      },
      {
        type: 'recommendation', path: 'recommendations/pending', updateTime: 'r2',
        data: { status: 'active', destination: { countryId: 'IL', cityId: 'pending' } },
      },
      {
        type: 'route', path: 'routes/mixed', updateTime: 'r3',
        data: {
          status: 'active', destinations: [
            { countryId: 'IL', cityId: 'approved' },
            { countryId: 'IL', cityId: 'pending' },
          ],
        },
      },
      {
        type: 'trip', path: 'trips/malformed', updateTime: 'r4',
        data: { status: 'active', destination: { countryId: 'IL', cityId: '../escape' } },
      },
    ],
  });

  assert.deepEqual(manifest.reviewRequired, [{
    path: 'countries/IL/destinations/pending', destinationKey: 'IL:pending',
  }]);
  assert.ok(manifest.actions.some((entry) => (
    entry.type === 'delete_catalog' && entry.path === `destinationCatalog/${catalogId('IL', 'pending')}`
  )));
  assert.ok(manifest.actions.some((entry) => entry.type === 'verify_content_gate' && entry.path.endsWith('/safe')));
  assert.equal(manifest.actions.filter((entry) => entry.type === 'hold_content').length, 3);
  assert.ok(manifest.actions.some((entry) => (
    entry.type === 'set_recommendation_count' && entry.path.endsWith('/approved') && entry.recommendationCount === 1
  )));
  assert.equal(manifest.fingerprint.length, 64);
});

test('migration arguments are dry-run by default and require explicit apply fields', () => {
  assert.deepEqual(parseArgs(['--project', 'planli-f0b12']), {
    apply: false,
    projectId: 'planli-f0b12',
    expectedFingerprint: null,
    confirmation: null,
  });
  assert.deepEqual(parseArgs([
    '--apply', '--project', 'planli-f0b12', '--fingerprint', 'abc',
    '--confirm', 'APPLY_DESTINATION_PUBLICATION_GATE',
  ]), {
    apply: true,
    projectId: 'planli-f0b12',
    expectedFingerprint: 'abc',
    confirmation: 'APPLY_DESTINATION_PUBLICATION_GATE',
  });
});

test('migration receipts use a private valid document path bound to the manifest fingerprint', () => {
  const fingerprint = 'a'.repeat(64);
  assert.equal(
    migrationReceiptPath(fingerprint),
    `system/migrations/destinationPublicationGate/${fingerprint}`
  );
  assert.equal(migrationReceiptPath(fingerprint).split('/').length % 2, 0);
  assert.throws(() => migrationReceiptPath('not-a-fingerprint'), /fingerprint is invalid/);
});

test('read-only REST inventory uses the existing gcloud token and decodes fixed collections', async () => {
  const calls = [];
  const document = (path, fields = {}) => ({
    name: `projects/planli-f0b12/databases/(default)/documents/${path}`,
    fields,
    updateTime: '2026-08-30T00:00:00.123456789Z',
  });
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    const href = String(url);
    let payload = { documents: [] };
    if (href.endsWith('/documents:runQuery')) {
      payload = [{ document: document('countries/IL/destinations/tel-aviv', {
        status: { stringValue: 'active' },
      }) }];
    } else if (href.includes('/documents/countries?')) {
      payload = { documents: [document('countries/IL', { status: { stringValue: 'active' } })] };
    } else if (href.includes('/documents/system/destinationRegistry/entries?')) {
      payload = { documents: [document('system/destinationRegistry/entries/tel-aviv', {
        aliases: { arrayValue: { values: [{ stringValue: 'Tel Aviv' }] } },
      })] };
    }
    return { ok: true, status: 200, json: async () => payload };
  };

  const records = await loadLiveRecordsRest({
    projectId: 'planli-f0b12', accessToken: 'not-logged-or-written', fetchImpl,
  });
  assert.equal(records.countries.length, 1);
  assert.deepEqual(records.destinations[0], {
    path: 'countries/IL/destinations/tel-aviv',
    id: 'tel-aviv',
    data: { status: 'active' },
    updateTime: '2026-08-30T00:00:00.123456789Z',
    countryId: 'IL',
    cityId: 'tel-aviv',
  });
  assert.deepEqual(records.registry[0].data.aliases, ['Tel Aviv']);
  assert.equal(calls.length, 7);
  assert.equal(calls.filter((call) => call.options.method === 'POST').length, 1);
  assert.ok(calls.every((call) => call.options.headers.Authorization === 'Bearer not-logged-or-written'));
  assert.ok(calls.every((call) => !Object.hasOwn(call.options, 'body') ||
    call.options.body.includes('"allDescendants":true')));
});

test('REST and Admin update times share one lossless nanosecond fingerprint representation', () => {
  assert.equal(
    normalizedUpdateTime('2026-08-30T00:00:00.123456789Z'),
    '2026-08-30T00:00:00.123456789Z'
  );
  assert.equal(
    normalizedUpdateTime({ seconds: 1788048000, nanoseconds: 123456789 }),
    '2026-08-30T00:00:00.123456789Z'
  );
  assert.equal(normalizedUpdateTime(new Date('2026-08-30T00:00:00.123Z')),
    '2026-08-30T00:00:00.123000000Z');
  assert.notEqual(
    normalizedUpdateTime('2026-08-30T00:00:00.123000001Z'),
    normalizedUpdateTime('2026-08-30T00:00:00.123999999Z')
  );
  assert.throws(() => normalizedUpdateTime('not-a-time'), /invalid document update time/);
});

test('Firestore REST value decoder handles nested input without evaluating it', () => {
  assert.deepEqual(decodeFirestoreValue({ mapValue: { fields: {
    approved: { booleanValue: true },
    count: { integerValue: '2' },
    labels: { arrayValue: { values: [{ stringValue: '<script>' }, { nullValue: null }] } },
  } } }), { approved: true, count: 2, labels: ['<script>', null] });
  assert.throws(() => decodeFirestoreValue({ unknownValue: 'x' }), /Unsupported Firestore REST value/);
});
