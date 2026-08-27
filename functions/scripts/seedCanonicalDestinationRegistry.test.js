const test = require('node:test');
const assert = require('node:assert/strict');

const { CANDIDATES } = require('../data/canonicalDestinationCandidates');
const {
  auditEntries,
  enrichCandidate,
  mergePolicy,
  parseArguments,
  run,
} = require('./seedCanonicalDestinationRegistry');

test('registry seed is dry-run by default and apply requires enrichment', async () => {
  assert.deepEqual(parseArguments([]), { apply: false, enrich: false, projectId: 'planli-f0b12' });
  const result = await run();
  assert.equal(result.mode, 'local-dry-run');
  assert.equal(result.localAudit.valid, true);
  await assert.rejects(() => run({ apply: true }), /requires --enrich/);
});

test('built-in grouping policy is merged into researched candidates', () => {
  const munnar = mergePolicy(CANDIDATES.find((entry) => entry.id === 'in-munnar'));
  assert.ok(munnar.aliases.includes('Kannan Devan Hills'));
  const audit = auditEntries(CANDIDATES.map(mergePolicy), { requireProviderIdentity: false });
  assert.equal(audit.valid, true);
});

test('registry seed audit blocks dangling parents and duplicate provider identities', () => {
  const entries = CANDIDATES.map(mergePolicy).map((entry, index) => ({
    ...entry,
    providerRefs: { googlePlaceId: `place-${index}` },
    center: { lat: 20 + index, lng: 20 + index },
    radiusKm: 1,
  }));
  entries[1] = {
    ...entries[1],
    parentId: 'missing-parent',
    providerRefs: { googlePlaceId: entries[0].providerRefs.googlePlaceId },
  };
  const audit = auditEntries(entries, { requireProviderIdentity: true });
  assert.equal(audit.valid, false);
  assert.ok(audit.collectionIssues.some((issue) => issue.code === 'missing_parent'));
  assert.ok(audit.collectionIssues.some((issue) => issue.code === 'duplicate_google_place_id'));
});

test('reviewed enrichment overrides select an exact island identity from ambiguous results', async () => {
  const candidate = CANDIDATES.find((entry) => entry.id === 'es-ibiza');
  const country = { longText: 'Spain', shortText: 'ES', types: ['country'] };
  const result = await enrichCandidate(candidate, {
    apiKey: 'test-key',
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ places: [
        {
          id: 'ChIJhRmdbbxGmRIRiPpXk_IayrY', displayName: { text: 'Eivissa' },
          addressComponents: [country], location: { latitude: 38.9, longitude: 1.43 },
        },
        {
          id: 'ChIJQzkJhWNHmRIR1iaEzSVHBgk', displayName: { text: 'Ibiza' },
          addressComponents: [country], location: { latitude: 39.0, longitude: 1.45 },
          viewport: { low: { latitude: 38.8, longitude: 1.2 }, high: { latitude: 39.2, longitude: 1.7 } },
        },
      ] }),
    }),
  });
  assert.equal(result.providerRefs.googlePlaceId, 'ChIJQzkJhWNHmRIR1iaEzSVHBgk');
  assert.deepEqual(result.center, { lat: 39, lng: 1.45 });
  assert.deepEqual(result.viewport, {
    southwest: { lat: 38.8, lng: 1.2 },
    northeast: { lat: 39.2, lng: 1.7 },
  });
  assert.equal(result.enrichmentIssue, undefined);
});
