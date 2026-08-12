const test = require('node:test');
const assert = require('node:assert/strict');

const { failures, inspectValue } = require('./auditLiveState');

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

test('an empty prelaunch database does not fail only because no public media sample exists', () => {
  const report = {
    firestore: {
      unexpectedRoots: [], forbiddenFields: [], usReferences: [], invalidCountryIds: [],
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
