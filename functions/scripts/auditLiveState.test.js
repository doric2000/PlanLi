const test = require('node:test');
const assert = require('node:assert/strict');

const {
  activeLocationIntegrity,
  allowedMergedProviderGroup,
  failures,
  inspectValue,
  isAllowedRoot,
} = require('./auditLiveState');

function destinationDocument(path, data) {
  return { ref: { path }, data: () => data };
}

test('provider duplicates are allowed only for inactive sources merged into one active target', () => {
  const active = destinationDocument('countries/IN/destinations/munnar', { status: 'active' });
  const merged = destinationDocument('countries/IN/destinations/legacy', {
    status: 'inactive', mergedInto: { countryId: 'IN', cityId: 'munnar' },
  });
  assert.equal(allowedMergedProviderGroup([merged, active]), true);
  assert.equal(allowedMergedProviderGroup([active, destinationDocument(
    'countries/IN/destinations/other', { status: 'active' }
  )]), false);
  assert.equal(allowedMergedProviderGroup([active, destinationDocument(
    'countries/IN/destinations/legacy', {
      status: 'inactive', mergedInto: { countryId: 'IN', cityId: 'another-target' },
    }
  )]), false);
});

test('live audit recognizes the server-owned global notification device registry', () => {
  assert.equal(isAllowedRoot('notificationDevices'), true);
  assert.equal(isAllowedRoot('unexpectedCollection'), false);
});

test('live audit rejects rating fields at every object depth', () => {
  const report = {
    forbiddenFields: [],
    usReferences: [],
    euReferenceCount: 0,
  };

  inspectValue({
    rating: 4.8,
    preview: { metrics: { rating: 0 } },
    entries: [{ rating: 3 }],
  }, 'recommendations/one', '', report);

  assert.deepEqual(
    report.forbiddenFields.map((entry) => entry.field),
    ['rating', 'preview.metrics.rating', 'entries[0].rating']
  );
});

test('live audit detects embedded credentials without returning their values or document ids', () => {
  const report = {
    forbiddenFields: [],
    credentialReferences: [],
    usReferences: [],
    euReferenceCount: 0,
  };

  inspectValue({
    imageUrl: ['https://maps.googleapis.com/maps/api/place/photo?key=', 'AI',
      'za', 'A'.repeat(35)].join(''),
  }, 'countries/IL/destinations/dst_private', '', report);

  assert.deepEqual(report.credentialReferences, [{
    collectionShape: 'countries/*/destinations',
    field: 'imageUrl',
    kind: 'gcp-api-key',
  }]);
  assert.equal(JSON.stringify(report).includes('dst_private'), false);
  assert.equal(JSON.stringify(report).includes('AIza'), false);
});

test('an empty prelaunch database does not fail only because no public media sample exists', () => {
  const report = {
    firestore: {
      unexpectedRoots: [], forbiddenFields: [], usReferences: [], invalidCountryIds: [],
      credentialReferences: [],
      invalidCityIds: [], duplicateCountryCodes: [], duplicateCityProviders: [],
      invalidFavorites: [], orphanFavorites: [], counterMismatches: [],
      invalidTaxonomyContent: [], profileCountMismatch: null,
    },
    storage: {
      missingInEurope: [], checksumMismatches: [],
      eu: { location: 'EUROPE-WEST1', uniformAccess: true, corsOrigins: [], stagingLifecycle: true },
    },
    functions: { count: 1, unexpected: [] },
    publicMediaRead: { pathFound: false, status: null },
  };

  assert.deepEqual(failures(report), []);
});

test('live audit blocks launch while a deployed function still binds a legacy Maps key', () => {
  const report = {
    firestore: {
      unexpectedRoots: [], forbiddenFields: [], usReferences: [], invalidCountryIds: [],
      credentialReferences: [], invalidCityIds: [], duplicateCountryCodes: [],
      duplicateCityProviders: [], invalidFavorites: [], orphanFavorites: [],
      counterMismatches: [], invalidTaxonomyContent: [], profileCountMismatch: null,
    },
    storage: {
      missingInEurope: [], checksumMismatches: [],
      eu: { location: 'EUROPE-WEST1', uniformAccess: true, corsOrigins: [], stagingLifecycle: true },
    },
    functions: {
      count: 1,
      unexpected: [],
      legacyMapsSecretBindings: [{ name: 'searchPlaces', secrets: ['GOOGLE_PLACES_NEW_KEY'] }],
    },
    publicMediaRead: { pathFound: false, status: null },
  };
  assert.deepEqual(failures(report), [
    { name: 'searchPlaces', secrets: ['GOOGLE_PLACES_NEW_KEY'] },
  ]);
});

test('location audit covers active recommendations, route stops and deleted source links', () => {
  const documents = [
    destinationDocument('countries/IL', { status: 'active' }),
    destinationDocument('countries/IL/destinations/hod-hasharon', {
      status: 'active', names: { he: 'הוד השרון', en: 'Hod Hasharon' },
    }),
    destinationDocument('recommendations/active', {
      status: 'active', locationMode: 'exact',
      destination: { countryId: 'IL', cityId: 'hod-hasharon', cityName: 'הוד השרון' },
      place: { placeId: 'hod-cafe' },
    }),
    { id: 'route-1', ...destinationDocument('routes/route-1', {
      status: 'active', activeRevisionId: 'revision-1',
      destinations: [{ countryId: 'IL', cityId: 'hod-hasharon', cityName: 'הוד השרון' }],
    }) },
    destinationDocument('routes/route-1/revisions/revision-1/days/day-1/stops/stop-1', {
      locationPrecision: 'exact',
      destination: { countryId: 'IL', cityId: 'hod-hasharon', cityName: 'הוד השרון' },
      place: { placeId: 'hod-cafe' },
      source: { recommendationId: 'deleted' },
    }),
  ];
  documents.forEach((document) => {
    document.id ||= document.ref.path.split('/').at(-1);
  });
  const result = activeLocationIntegrity(documents);
  assert.deepEqual(result.invalidReferences, []);
  assert.deepEqual(result.invalidNames, []);
  assert.deepEqual(result.orphanSources, [{
    documentPath: 'routes/route-1/revisions/revision-1/days/day-1/stops/stop-1',
    recommendationId: 'deleted',
    sourceStatus: 'missing',
  }]);
});

test('location audit treats every non-active recommendation source status as orphaned', () => {
  for (const sourceStatus of ['moderation_hold', 'suspended', 'inactive', 'deleting']) {
    const documents = [
      destinationDocument('countries/IL', { status: 'active' }),
      destinationDocument('countries/IL/destinations/hod-hasharon', {
        status: 'active', names: { he: 'הוד השרון' },
      }),
      destinationDocument('recommendations/source', { status: sourceStatus }),
      { id: 'route-1', ...destinationDocument('routes/route-1', {
        status: 'active', activeRevisionId: 'revision-1',
      }) },
      destinationDocument('routes/route-1/revisions/revision-1/days/day-1/stops/stop-1', {
        locationPrecision: 'general',
        destination: { countryId: 'IL', cityId: 'hod-hasharon', cityName: 'הוד השרון' },
        source: { recommendationId: 'source' },
      }),
    ];
    documents.forEach((document) => {
      document.id ||= document.ref.path.split('/').at(-1);
    });
    assert.deepEqual(activeLocationIntegrity(documents).orphanSources, [{
      documentPath: 'routes/route-1/revisions/revision-1/days/day-1/stops/stop-1',
      recommendationId: 'source',
      sourceStatus,
    }]);
  }
});
