const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPlan, applyPlan, inventory } = require('./scripts/importReviewedDestinationCatalog');
const { createDestinationMemoryAdmin } = require('./testSupport/destinationMemoryAdmin');
const { hasReviewedCatalogApproval } = require('./reviewedCatalogPolicy');
const { registryEntriesForCountry, clearRegistryCache, matchCanonicalEntry, validateRegistryEntry } = require('./canonicalDestinationRegistry');
const { destinationAcceptsNewReferences } = require('./destinationReferencePolicy');
const { hasUsableDestinationCache } = require('./destinationCacheService');
const { CANDIDATES } = require('./data/canonicalDestinationCandidates');
const supplements = require('./data/reviewedDestinationCoordinates.json');
const candidate = { id: 'al-ksamil', countryCode: 'AL', names: { he: 'קסאמיל', en: 'Ksamil' },
  aliases: ['Kasmil'], kind: 'city_hub', groupingPolicy: 'self', center: { lat: 39.7637, lng: 19.9943 },
  researchSources: [{ title: 'Public identity fixture', url: 'https://example.org/ksamil' }] };
const planFor = async (admin, candidates = [candidate]) => buildPlan(await inventory(admin.firestore()), { candidates });

test('catalog import materializes searchable, publishable identities without inventing Google data and reruns safely', async () => {
  const admin = createDestinationMemoryAdmin();
  const plan = await planFor(admin);
  assert.equal(hasReviewedCatalogApproval(plan.actions[0].entry), true);
  assert.deepEqual(validateRegistryEntry(plan.actions[0].entry).errors, []);
  assert.equal((await applyPlan(admin.firestore(), plan, admin)).created, 1);
  const city = admin.documents.get(plan.actions[0].destinationPath);
  assert.equal(destinationAcceptsNewReferences(city, 'AL'), true);
  assert.equal(hasUsableDestinationCache(city), true);
  assert.equal(city.googleCache, undefined);
  assert.deepEqual(city.providerRefs, {});
  const catalog = [...admin.documents].find(([p]) => p.startsWith('destinationCatalog/'))[1];
  assert.equal(catalog.status, 'active'); assert.ok(catalog.search.prefixes.includes('kasmil'));
  const rerun = await planFor(admin);
  assert.equal(rerun.summary.linked, 1);
  assert.equal((await applyPlan(admin.firestore(), rerun, admin)).created, 0);
  assert.equal([...admin.documents.keys()].filter(p => /^countries\/[^/]+\/destinations\//.test(p)).length, 1);
  assert.deepEqual(admin.documents.get(plan.actions[0].destinationPath), city);
  const { qualityIssues, canonicalApprovalBindingIssues, selectDestinationPolicyRegistryBinding } = require('./destinationAdminService');
  assert.equal(qualityIssues(city).some(issue => issue.severity === 'error'), false);
  const entry = { id: plan.actions[0].registryId, ...admin.documents.get(`system/destinationRegistry/entries/${plan.actions[0].registryId}`) };
  assert.deepEqual(canonicalApprovalBindingIssues(city, entry), []);
  assert.equal(selectDestinationPolicyRegistryBinding({ currentCity: city, countryCode: 'AL',
    destinationPath: plan.actions[0].destinationPath, registryEntries: [entry] }).issue, undefined);
  const { destinationNamePatch } = require('./destinationRenameService');
  assert.equal(destinationNamePatch('קסמיל', city)['identity.names.he'], 'קסמיל');
  assert.equal(Object.keys(destinationNamePatch('קסמיל', city)).some(key => key.startsWith('googleCache')), false);
  const identityResult = await require('./destinationImageService').resolveAndPersistDestinationIdentity({
    admin, countryId: 'AL', cityId: plan.actions[0].cityId });
  assert.equal(identityResult.state, 'ready'); assert.deepEqual(identityResult.identity, city.identity);
});

test('a stale server instance refreshes its country registry immediately after an import', async () => {
  clearRegistryCache();
  const admin = createDestinationMemoryAdmin(); const db = admin.firestore();
  assert.equal((await registryEntriesForCountry(db, 'AL')).some(e => e.id === candidate.id), false);
  const plan = await planFor(admin); await applyPlan(db, plan, admin);
  const entries = await registryEntriesForCountry(db, 'AL');
  assert.equal(entries.some(e => e.id === candidate.id), true);
  assert.equal(matchCanonicalEntry(entries, { countryCode: 'AL', aliases: ['Ksamil'],
    coordinates: { lat: 39.7668, lng: 20.0001 } }).entry.id, candidate.id);
  assert.equal(matchCanonicalEntry(entries, { countryCode: 'AL', aliases: ['Ksamil'],
    coordinates: { lat: 41.3, lng: 19.8 } })?.entry, undefined);
  assert.equal(matchCanonicalEntry(entries, { countryCode: 'GR', aliases: ['Ksamil'],
    coordinates: candidate.center })?.entry, undefined);
});

test('inactive destinations, ambiguous identities and concurrent registry changes are never overwritten', async () => {
  const admin = createDestinationMemoryAdmin(); const plan = await planFor(admin);
  await applyPlan(admin.firestore(), plan, admin);
  const path = plan.actions[0].destinationPath;
  const city = admin.documents.get(path);
  admin.documents.set(path, { ...city, status: 'inactive' });
  assert.equal((await planFor(admin)).actions[0].reason, 'preserved_existing_destination_restriction');
  admin.documents.set(path, city);
  admin.documents.set('countries/AL/destinations/duplicate', { ...city, canonicalPolicy: {
    ...city.canonicalPolicy, registryId: 'al-other', registryAttestation: { ...city.canonicalPolicy.registryAttestation, registryId: 'al-other' } } });
  assert.equal((await planFor(admin)).actions[0].reason, 'ambiguous_existing_destination');
  admin.documents.delete('countries/AL/destinations/duplicate');
  const stale = await planFor(admin);
  admin.documents.set('system/destinationRegistry', { countryRevisions: { AL: 'admin-changed-policy' } });
  assert.deepEqual((await applyPlan(admin.firestore(), stale, admin)).conflicts, [candidate.id]);
});

test('approval is bound to names, country, coordinates, source evidence and supported destination kind', () => {
  const entry = buildPlan({ registry: [], countries: [], cities: [] }, { candidates: [candidate] }).actions[0].entry;
  for (const patch of [{ countryCode: 'GR' }, { names: { he: 'אחר', en: 'Other' } },
    { center: { lat: 0, lng: 0 } }, { kind: 'hotel' }, { groupingPolicy: 'anything' },
    { identity: { ...entry.identity, sources: [] } }, { geometryPolicy: { autoMatchEligible: true } }]) {
    assert.equal(hasReviewedCatalogApproval({ ...entry, ...patch }), false);
  }
});

test('plan fingerprints are repeatable and materialization preserves existing registry decisions', async () => {
  const existing = { id: candidate.id, ...candidate, names: { he: 'קסמיל', en: 'Ksamil' },
    status: 'active', approval: { approvedByAdmin: true }, geometryPolicy: {
      autoMatchEligible: false, aliasAutoMatchEligible: true, source: 'admin_approved_aliases' } };
  const admin = createDestinationMemoryAdmin({ [`system/destinationRegistry/entries/${candidate.id}`]: existing });
  const snapshot = await inventory(admin.firestore());
  const first = buildPlan(snapshot, { candidates: [candidate], now: new Date(1000) });
  const second = buildPlan(snapshot, { candidates: [candidate], now: new Date(2000) });
  assert.equal(first.planDigest, second.planDigest);
  await applyPlan(admin.firestore(), first, admin);
  const reg = admin.documents.get(`system/destinationRegistry/entries/${candidate.id}`);
  assert.deepEqual(reg.approval, existing.approval); assert.deepEqual(reg.geometryPolicy, existing.geometryPolicy);
  assert.equal(admin.documents.get(first.actions[0].destinationPath).identity.names.he, 'קסמיל');
  assert.notEqual((await planFor(admin)).planDigest, first.planDigest);
});

test('the full 3000-candidate plan validates every available identity and reports unresolved coordinates', () => {
  // Existing curated provider geometry is separately inventoried by the dry-run.
  const plan = buildPlan({ registry: [], countries: [], cities: [] }, { candidates: CANDIDATES, supplements });
  assert.equal(plan.count, 3000);
  for (const id of Object.keys(supplements)) assert.notEqual(plan.actions.find(a => a.candidateId === id).outcome, 'excluded', id);
  assert.equal(plan.actions.filter(a => a.outcome === 'excluded').every(a =>
    ['incomplete_identity', 'preserved_identity_restriction'].includes(a.reason)), true);
  for (const action of plan.actions.filter(a => a.outcome !== 'excluded')) assert.equal(hasReviewedCatalogApproval(action.entry), true, action.candidateId);
});
