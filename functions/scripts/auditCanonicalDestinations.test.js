const test = require('node:test');
const assert = require('node:assert/strict');

const { BUILTIN_POLICIES } = require('../canonicalDestinationRegistry');
const { auditDestination, auditRecommendationAssignment, parseArguments } = require('./auditCanonicalDestinations');

test('assignment audit proposes an individual park correction and never automatic publication', () => {
  const result = auditRecommendationAssignment({ id: 'synthetic-park', currentRegistryId: 'lk-sri-lanka-south-coast',
    recommendation: { destination: { countryId: 'LK', cityId: 'south-coast' }, place: {
      placeId: 'ChIJeX6IiP8I5DoR14DZ-5_nEq8', coordinates: { lat: 6.4746, lng: 80.8763 },
    } }, registryEntries: BUILTIN_POLICIES });
  assert.equal(result.proposedRegistryId, 'lk-udawalawe-national-park');
  assert.equal(result.action, 'review_individual_recommendation');
  assert.equal(result.publishAutomatically, false);
});

test('canonical audit is dry-run only', () => {
  assert.deepEqual(parseArguments([]), { projectId: 'planli-f0b12', apply: false });
  assert.equal(parseArguments(['--apply']).apply, true);
});

test('assignment audit uses the country ISO code independently of the document ID', () => {
  const result = auditRecommendationAssignment({ id: 'synthetic-legacy-country', countryCode: 'LK',
    currentRegistryId: 'lk-sri-lanka-south-coast', registryEntries: BUILTIN_POLICIES,
    recommendation: { destination: { countryId: 'סרי לנקה', cityId: 'south-coast' }, place: {
      placeId: 'ChIJeX6IiP8I5DoR14DZ-5_nEq8', coordinates: { lat: 6.4746, lng: 80.8763 },
    } } });
  assert.equal(result.proposedRegistryId, 'lk-udawalawe-national-park');
  assert.equal(result.reviewRequired, true);
});

test('audit identifies the two reported production destination failures', () => {
  const munnar = auditDestination({
    countryId: 'IN', cityId: 'bad-india', countryCode: 'IN', registryEntries: BUILTIN_POLICIES,
    destination: {
      googleCache: { names: { en: 'Kannan Devan Hills', he: 'קננן דבן הילס' }, coordinates: { lat: 10.143, lng: 77.0398 } },
      stats: { recommendationCount: 1 },
    },
  });
  const ometepe = auditDestination({
    countryId: 'NI', cityId: 'bad-rivas', countryCode: 'NI', registryEntries: BUILTIN_POLICIES,
    destination: {
      googleCache: { names: { en: 'Rivas', he: 'ריבס' }, coordinates: { lat: 11.5191, lng: -85.567 } },
      stats: { recommendationCount: 1 },
    },
  });
  assert.deepEqual([munnar.suggestedRegistryId, ometepe.suggestedRegistryId], ['in-munnar', 'ni-ometepe']);
  assert.equal(munnar.status, 'reassignment_candidate');
  assert.equal(ometepe.status, 'reassignment_candidate');
  assert.equal(munnar.knownSuspect, true);
  assert.equal(ometepe.knownSuspect, true);
});

test('audit classifies a completed inactive source separately from active candidates', () => {
  const result = auditDestination({
    countryId: 'NI', cityId: 'old-rivas', countryCode: 'NI', registryEntries: BUILTIN_POLICIES,
    destination: {
      status: 'inactive',
      mergedInto: { countryId: 'NI', cityId: 'canonical-ometepe' },
      googleCache: { names: { en: 'Rivas', he: 'ריבס' }, coordinates: { lat: 11.5191, lng: -85.567 } },
      stats: { recommendationCount: 0 },
    },
  });
  assert.equal(result.status, 'merged_source');
  assert.deepEqual(result.mergedInto, { countryId: 'NI', cityId: 'canonical-ometepe' });
});
