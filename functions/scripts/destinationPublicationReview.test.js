const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildDestinationPublicationReview,
  isStandardLocalityCandidate,
  markdownCell,
  providerTypes,
  renderMarkdown,
} = require('./destinationPublicationReview');

function destination(id, data) {
  return { path: `countries/IL/destinations/${id}`, id, countryId: 'IL', cityId: id, data };
}

const registryData = {
  status: 'active',
  countryCode: 'IL',
  kind: 'city_hub',
  groupingPolicy: 'self',
  registryVersion: 3,
  providerRefs: { googlePlaceId: 'place-1' },
};

const validRegistry = (entry) => ({ valid: true, entry });

test('review separates exact legacy bindings, pending active destinations and inactive records', () => {
  const report = buildDestinationPublicationReview({
    countries: [{ id: 'IL', data: { status: 'active', code: 'IL' } }],
    registry: [{ id: 'il-safe', path: 'system/destinationRegistry/entries/il-safe', data: registryData }],
    catalog: [{ data: { countryId: 'IL', cityId: 'safe' } }],
    contents: [{ type: 'recommendation', data: { destination: { countryId: 'IL', cityId: 'safe' } } }],
    destinations: [
      destination('safe', {
        status: 'active', names: { he: 'בטוח', en: 'Safe' },
        providerRefs: { googlePlaceId: 'place-1' },
        canonicalPolicy: {
          approved: true, registryId: 'il-safe', kind: 'city_hub', groupingPolicy: 'self',
          registryVersion: 3,
        },
      }),
      destination('pending', {
        status: 'active', names: { he: 'ממתין', en: 'Pending' },
        googleCache: { types: ['political', 'locality', 'locality'] },
        providerRefs: { googlePlaceId: 'other' },
        canonicalPolicy: { approved: false, registryId: 'missing', kind: 'city_hub', groupingPolicy: 'self' },
      }),
      destination('inactive', { status: 'inactive', names: { en: 'Inactive' } }),
    ],
  }, { validateRegistry: validRegistry });

  assert.deepEqual(report.counts, {
    total: 3,
    active_pending_manual_review: 1,
    inactive_not_public: 1,
    legacy_binding_needs_admin_attestation: 1,
  });
  const safe = report.rows.find((row) => row.cityId === 'safe');
  assert.equal(safe.category, 'legacy_binding_needs_admin_attestation');
  assert.equal(safe.contentReferences, 1);
  assert.equal(safe.catalogPresent, true);
  assert.deepEqual(safe.reasons, []);
  const pending = report.rows.find((row) => row.cityId === 'pending');
  assert.deepEqual(pending.providerTypes, ['locality', 'political']);
  assert.equal(pending.standardLocalityCandidate, true);
});

test('only a cached Google locality with an exact provider id is a standard city candidate', () => {
  const locality = {
    providerRefs: { googlePlaceId: 'place-2' },
    googleCache: { types: ['political', 'locality', 'LOCALITY', '<unsafe>'] },
  };
  assert.deepEqual(providerTypes(locality), ['<unsafe>', 'locality', 'political']);
  assert.equal(isStandardLocalityCandidate(locality, ['registry_missing']), true);
  assert.equal(isStandardLocalityCandidate(locality, ['registry_missing', 'registry_invalid']), false);
  assert.equal(isStandardLocalityCandidate({
    ...locality,
    googleCache: { types: ['natural_feature', 'establishment'] },
  }, ['registry_missing']), false);
  assert.equal(isStandardLocalityCandidate({ googleCache: locality.googleCache }, ['registry_missing']), false);
});

test('a legacy registry-version upgrade remains admin-attestation eligible when identity still matches', () => {
  const report = buildDestinationPublicationReview({
    countries: [{ id: 'IL', data: { status: 'active', code: 'IL' } }],
    registry: [{
      id: 'il-safe', path: 'system/destinationRegistry/entries/il-safe',
      data: { ...registryData, registryVersion: 3 },
    }],
    catalog: [],
    contents: [],
    destinations: [destination('safe', {
      status: 'active', names: { he: 'בטוח', en: 'Safe' },
      providerRefs: { googlePlaceId: 'place-1' },
      canonicalPolicy: {
        approved: true, registryId: 'il-safe', kind: 'city_hub', groupingPolicy: 'self',
        version: 1,
      },
    })],
  }, { validateRegistry: validRegistry });
  assert.equal(report.rows[0].category, 'legacy_binding_needs_admin_attestation');
  assert.deepEqual(report.rows[0].reasons, ['registry_version_mismatch']);
});

test('markdown report escapes destination-controlled HTML, pipes and backticks', () => {
  assert.equal(markdownCell('<img|`x`>'), '&lt;img&#124;&#96;x&#96;&gt;');
  const markdown = renderMarkdown({
    fingerprint: 'a'.repeat(64),
    counts: { total: 1, active_pending_manual_review: 1 },
    rows: [{
      countryId: 'IL', names: { he: '<script>', en: 'A|B' }, status: 'active',
      category: 'active_pending_manual_review', contentReferences: 0, catalogPresent: false,
      providerPlaceId: '', providerTypes: ['<unsafe|type>'], standardLocalityCandidate: false,
      registryProviderPlaceId: '', reasons: ['registry_missing'],
    }],
  }, '2026-08-30T00:00:00Z');
  assert.equal(markdown.includes('<script>'), false);
  assert.match(markdown, /&lt;script&gt;/u);
  assert.match(markdown, /A&#124;B/u);
  assert.equal(markdown.includes('<unsafe|type>'), false);
  assert.match(markdown, /&lt;unsafe&#124;type&gt;/u);
  assert.match(markdown, /\| 0 \|/u);
});
