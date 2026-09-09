const test = require('node:test');
const assert = require('node:assert/strict');

const { CANDIDATES } = require('../data/canonicalDestinationCandidates');
const {
  auditEntries,
  commitRegistry,
  enrichCandidate,
  mergePolicy,
  parseArguments,
  run,
} = require('./seedCanonicalDestinationRegistry');

test('registry seed is dry-run by default and apply requires enrichment', async () => {
  assert.deepEqual(parseArguments([]), { apply: false, enrich: false, projectId: 'planli-f0b12', offset: 0, limit: 3000, checkpoint: '' });
  const result = await run();
  assert.equal(result.mode, 'local-dry-run');
  assert.equal(result.localAudit.valid, true);
  await assert.rejects(() => run({ apply: true }), /requires --enrich/);
});

test('built-in grouping policy is merged into researched candidates', () => {
  const munnar = mergePolicy(CANDIDATES.find((entry) => entry.id === 'in-munnar'));
  assert.ok(munnar.aliases.includes('Kannan Devan Hills'));
  assert.equal(munnar.radiusKm, 32);
  assert.deepEqual(munnar.center, { lat: 10.0889, lng: 77.0595 });
  assert.equal(munnar.geometryPolicy.source, 'planli_reviewed');
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
    projectId: 'planli-f0b12',
    accessTokenProvider: async () => 'oauth-token',
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ places: [
        {
          id: 'ChIJhRmdbbxGmRIRiPpXk_IayrY', displayName: { text: 'Eivissa' },
          addressComponents: [country], location: { latitude: 38.9, longitude: 1.43 },
          types: ['locality', 'political'],
        },
        {
          id: 'ChIJQzkJhWNHmRIR1iaEzSVHBgk', displayName: { text: 'Ibiza' },
          addressComponents: [country], location: { latitude: 39.0, longitude: 1.45 },
          types: ['island', 'natural_feature'],
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

test('city enrichment refuses a business Place ID even when it is the only result', async () => {
  const candidate = CANDIDATES.find((entry) => entry.id === 'at-vienna');
  let requestBody;
  const result = await enrichCandidate(candidate, {
    projectId: 'planli-f0b12',
    accessTokenProvider: async () => 'oauth-token',
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return { ok: true, json: async () => ({ places: [{
        id: 'vienna-event-venue', displayName: { text: 'Vienna' },
        addressComponents: [{ longText: 'Austria', shortText: 'AT', types: ['country'] }],
        location: { latitude: 48.2, longitude: 16.37 },
        types: ['event_venue', 'point_of_interest', 'establishment'],
      }] }) };
    },
  });
  assert.equal(requestBody.includedType, 'locality');
  assert.equal(requestBody.strictTypeFiltering, true);
  assert.equal(result.providerRefs, undefined);
  assert.equal(result.enrichmentIssue, 'missing_google_match');
});

test('country-qualified catalog labels accept their explicit provider aliases', async () => {
  for (const [id, country, providerName] of [
    ['ni-granada-nicaragua', 'NI', 'Granada'], ['co-cartagena-colombia', 'CO', 'Cartagena'],
    ['cl-santiago-chile', 'CL', 'Santiago'], ['ec-cuenca-ecuador', 'EC', 'Cuenca'],
  ]) {
    const candidate = CANDIDATES.find((entry) => entry.id === id);
    const result = await enrichCandidate(candidate, { accessTokenProvider: async () => 'synthetic',
      fetchImpl: async () => ({ ok: true, json: async () => ({ places: [{
        id: `synthetic-${id}`, displayName: { text: providerName }, types: ['locality'],
        location: { latitude: 1, longitude: 1 },
        addressComponents: [{ shortText: country, types: ['country'] }],
      }] }) }) });
    assert.equal(result.enrichmentIssue, undefined, id);
    assert.equal(result.providerRefs.googlePlaceId, `synthetic-${id}`);
  }
});

test('enrichment refuses Southern Province as the identity of the south coast', async () => {
  const candidate = mergePolicy(CANDIDATES.find((entry) => entry.id === 'lk-sri-lanka-south-coast'));
  const result = await enrichCandidate(candidate, { fetchImpl: () => assert.fail('No provider call for quarantined identity') });
  assert.equal(result.enrichmentIssue, 'review_required_provider_identity');
  assert.equal(result.geometryPolicy.autoMatchEligible, false);
});

test('an unrelated same-country city cannot win just because Google returns one result', async () => {
  const candidate = CANDIDATES.find((entry) => entry.names.en === 'Bergen' && entry.countryCode === 'NO');
  const result = await enrichCandidate(candidate, { projectId: 'planli-f0b12', accessTokenProvider: async () => 'test',
    fetchImpl: async () => ({ ok: true, json: async () => ({ places: [{ id: 'wrong',
      displayName: { text: 'Oslo' }, types: ['locality'], location: { latitude: 59.91, longitude: 10.75 },
      addressComponents: [{ shortText: 'NO', types: ['country'] }],
    }] }) }) });
  assert.equal(result.enrichmentIssue, 'missing_google_match');
});

test('resumed imports preserve administrator decisions and existing provider identities', async () => {
  const entries = [
    { id: 'lk-existing', providerRefs: { googlePlaceId: 'existing', googlePlaceIds: ['secondary'] } },
    { id: 'lk-alias', providerRefs: { googlePlaceId: 'existing' } },
    { id: 'lk-secondary', providerRefs: { googlePlaceId: 'secondary' } },
    { id: 'lk-reverse-secondary', providerRefs: { googlePlaceId: 'different', googlePlaceIds: ['existing'] } },
    { id: 'lk-both-secondary', providerRefs: { googlePlaceId: 'another', googlePlaceIds: ['secondary'] } },
    { id: 'lk-new', providerRefs: { googlePlaceId: 'new' }, names: { he: 'חדש', en: 'New' } },
  ];
  const documents = new Map([['system/destinationRegistry/entries/lk-existing', {
    ...entries[0], status: 'inactive', approval: { approvedByAdmin: true }, names: { he: 'שם מנהל' },
  }]]);
  const original = structuredClone(documents.get('system/destinationRegistry/entries/lk-existing'));
  const db = { doc: (path) => ({ path, set: async () => {} }),
    collection: () => ({ where: (field, _op, value) => ({ limit: () => ({ field, providerId: value }) }) }),
    runTransaction: async (body) => body({
      get: async (query) => query.path
        ? { exists: documents.has(query.path), data: () => documents.get(query.path) }
        : { empty: ![...documents.values()].some((entry) => query.field === 'providerRefs.googlePlaceIds'
          ? entry.providerRefs.googlePlaceIds?.includes(query.providerId)
          : entry.providerRefs.googlePlaceId === query.providerId) },
      create: (ref, data) => documents.set(ref.path, data),
    }),
  };
  const admin = { firestore: { FieldValue: { serverTimestamp: () => 'timestamp' } } };
  assert.equal((await commitRegistry(db, entries, admin)).created, 1);
  assert.equal((await commitRegistry(db, entries, admin)).created, 0);
  assert.equal(documents.size, 2);
  assert.deepEqual(documents.get('system/destinationRegistry/entries/lk-existing'), original);
});
