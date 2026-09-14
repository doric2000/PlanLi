/* eslint-disable no-console */
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const admin = require('firebase-admin');
const { initializeAdmin } = require('./localCredentials');
const { CANDIDATES } = require('../data/canonicalDestinationCandidates');
const { BUILTIN_POLICIES, canonicalDestinationId, REGISTRY_PATH } = require('../canonicalDestinationRegistry');
const { compactDestinationSearchText, catalogData, catalogId } = require('../destinationCatalogService');
const { destinationAcceptsNewReferences } = require('../destinationReferencePolicy');
const { getLocalCountryMetadata } = require('../countryMetadata');
const { discoveryRegionForCountry } = require('../discoveryRegions');
const { distanceKm } = require('../destinationIdentityService');
const { POLICY_ID, ISSUER, reviewedCatalogDestination } = require('../reviewedCatalogPolicy');
const { touchRegistryRevision } = require('../destinationRegistryRevision');

function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function point(value) { return value && Number.isFinite(value.lat) && Math.abs(value.lat) <= 90 &&
  Number.isFinite(value.lng) && Math.abs(value.lng) <= 180 ? value : null; }
function namesFor(value) { return [value.names?.he, value.names?.en, value.googleCache?.names?.he,
  value.googleCache?.names?.en, value.identity?.names?.he, value.identity?.names?.en, ...(value.aliases || [])]
  .map(compactDestinationSearchText).filter(Boolean); }
function cityPoint(value) { return point(value.googleCache?.coordinates) || point(value.identity?.coordinates) || point(value.center); }
function countryData(code) {
  const names = { he: new Intl.DisplayNames(['he'], { type: 'region' }).of(code),
    en: new Intl.DisplayNames(['en'], { type: 'region' }).of(code) };
  return { code, name: names.he, names, ...getLocalCountryMetadata(code),
    discoveryRegionId: discoveryRegionForCountry(code), status: 'active' };
}

async function inventory(db) {
  const [registry, countries, cities, metadata] = await Promise.all([
    db.collection(REGISTRY_PATH).get(), db.collection('countries').get(),
    db.collectionGroup('destinations').get(),
    db.doc('system/destinationRegistry').get(),
  ]);
  return { countryRevisions: metadata.data()?.countryRevisions || {},
    registry: registry.docs.map(d => ({ id: d.id, ...d.data() })),
    countries: countries.docs.map(d => ({ id: d.id, ...d.data() })),
    cities: cities.docs.map(d => ({ path: d.ref.path, id: d.id, ...d.data() })) };
}

function buildPlan(snapshot, { candidates = CANDIDATES, supplements = {}, now = new Date() } = {}) {
  const catalogDigest = digest({ candidates, supplements });
  const registry = new Map(snapshot.registry.map(e => [e.id, e]));
  const countryByCode = new Map(snapshot.countries.map(c => [c.code, c]));
  const cities = snapshot.cities.slice();
  const actions = [];
  for (const candidate of candidates) {
    const existing = registry.get(candidate.id);
    const builtIn = BUILTIN_POLICIES.find(e => e.id === candidate.id);
    const source = { ...candidate, ...(supplements[candidate.id] || {}) };
    const center = point(builtIn?.center) || point(existing?.center) || point(source.center);
    const code = source.countryCode;
    const country = countryByCode.get(code) || { id: code, ...countryData(code) };
    const reject = reason => actions.push({ candidateId: candidate.id, outcome: 'excluded', reason });
    if (country.status !== 'active') { reject('country_inactive'); continue; }
    if ((existing && existing.status !== 'active') || builtIn?.geometryPolicy?.source === 'identity_requires_review' ||
        existing?.geometryPolicy?.source === 'identity_requires_review') { reject('preserved_identity_restriction'); continue; }
    if (!center || !/[\u05d0-\u05ea]/.test(source.names?.he || '') || !source.names?.en) {
      reject('incomplete_identity'); continue;
    }
    const kind = builtIn?.kind || existing?.kind || source.kind;
    const preferredNames = builtIn?.names || existing?.names || source.names;
    const names = namesFor(source);
    const providerId = existing?.providerRefs?.googlePlaceId || source.providerRefs?.googlePlaceId;
    const matching = cities.filter(city => city.path.split('/')[1] === country.id && (
      city.canonicalPolicy?.registryId === source.id || city.path === existing?.destinationPath ||
      (providerId && city.providerRefs?.googlePlaceId === providerId) ||
      (source.research?.wikidataId && city.identity?.sourceId === source.research.wikidataId) ||
      ((city.canonicalPolicy?.kind === kind || city.destinationType === ({city_hub:'city',island:'island',natural_feature:'natural_feature',province:'region',tourism_region:'region'})[kind]) &&
        namesFor(city).some(n => names.includes(n)) && cityPoint(city) && distanceKm(center, cityPoint(city)) <= 5)
    ));
    const activeMatches = matching.filter(c => destinationAcceptsNewReferences(c, country.id));
    if (activeMatches.length > 1) { reject('ambiguous_existing_destination'); continue; }
    if (!activeMatches.length && matching.length) { reject('preserved_existing_destination_restriction'); continue; }
    const linked = activeMatches[0];
    const registryId = linked?.canonicalPolicy?.registryId || source.id;
    const cityId = linked?.id || canonicalDestinationId(country.id, registryId);
    const destinationPath = `countries/${country.id}/destinations/${cityId}`;
    const priorRegistry = registry.get(registryId);
    if (priorRegistry && priorRegistry.status !== 'active') { reject('preserved_identity_restriction'); continue; }
    const identity = { source: 'planli_catalog', sourceId: source.id, countryCode: code, policyId: POLICY_ID, catalogDigest,
      names: preferredNames, coordinates: center, sources: [...(source.researchSources || []),
        ...(source.coordinateSource ? [{ title: 'Coordinate source', ...source.coordinateSource }] : [])],
      ...(source.research?.wikidataId ? { wikidataId: source.research.wikidataId } : {}) };
    const entry = {
      id: registryId, countryCode: code, names: preferredNames,
      aliases: [...new Set([...Object.values(preferredNames), ...Object.values(source.names),
        ...(existing?.aliases || []), ...(source.aliases || [])])],
      kind, parentId: builtIn?.parentId || existing?.parentId || null,
      groupingPolicy: builtIn?.groupingPolicy || existing?.groupingPolicy || source.groupingPolicy,
      center, identity, researchSources: identity.sources, status: 'active', registryVersion: 3,
      destinationPath, catalogCandidateIds: [...new Set([...(priorRegistry?.catalogCandidateIds || []), source.id])],
      providerRefs: priorRegistry?.providerRefs || source.providerRefs || {},
      geometryPolicy: { autoMatchEligible: false, aliasAutoMatchEligible: true, source: POLICY_ID, version: 4 },
      approval: { approvedByPolicy: true, approvedByAdmin: false, policyId: POLICY_ID,
        approvedBy: ISSUER, approvedAt: now, catalogDigest }, approvalRevision: 1,
    };
    const city = linked || { id: cityId, path: destinationPath, ...reviewedCatalogDestination(entry, country.id, cityId, now) };
    actions.push({ candidateId: source.id, outcome: linked ? 'linked' : 'created',
      countryId: country.id, countryCode: code, country: Object.fromEntries(Object.entries(country).filter(([k]) => k !== 'id')),
      cityId, destinationPath, registryId, entry, city,
      expectedCountry: snapshot.countries.some(c => c.id === country.id) ? digest(country) : null,
      expectedCity: snapshot.cities.some(c => c.path === destinationPath) ? digest(linked) : null,
      expectedRegistry: snapshot.registry.some(e => e.id === registryId)
        ? digest(snapshot.registry.find(e => e.id === registryId)) : null,
    });
    if (!linked) cities.push(city);
    registry.set(registryId, linked && priorRegistry ? { ...priorRegistry, catalogCandidateIds: entry.catalogCandidateIds } : entry);
  }
  const countryRevisions = snapshot.countryRevisions || {};
  const planDigest = digest({ catalogDigest, countryRevisions, actions: actions.map(a => ({
    candidateId: a.candidateId, outcome: a.outcome, reason: a.reason, destinationPath: a.destinationPath,
    registryId: a.registryId, expectedRegistry: a.expectedRegistry, expectedCity: a.expectedCity,
    expectedCountry: a.expectedCountry, identity: a.entry?.identity, aliases: a.entry?.aliases,
    kind: a.entry?.kind, parentId: a.entry?.parentId, groupingPolicy: a.entry?.groupingPolicy,
  })) });
  return { catalogDigest, planDigest, countryRevisions, count: candidates.length, actions,
    summary: actions.reduce((r,a) => { r[a.outcome]=(r[a.outcome]||0)+1; return r; }, {}) };
}

async function applyPlan(db, plan, adminImpl = admin, checkpoint = () => {}) {
  const receipt = { created: 0, linked: 0, excluded: 0, conflicts: [] };
  const revisions = { ...plan.countryRevisions };
  for (const action of plan.actions) {
    if (action.outcome === 'excluded') { receipt.excluded++; continue; }
    const outcome = await db.runTransaction(async transaction => {
      const countryRef = db.doc(`countries/${action.countryId}`);
      const cityRef = db.doc(action.destinationPath);
      const registryRef = db.doc(`${REGISTRY_PATH}/${action.registryId}`);
      const [countrySnap, citySnap, registrySnap, metadata] = await Promise.all([
        transaction.get(countryRef), transaction.get(cityRef), transaction.get(registryRef),
        transaction.get(db.doc('system/destinationRegistry')),
      ]);
      if ((metadata.data()?.countryRevisions?.[action.countryCode] || '') !==
          (revisions[action.countryCode] || '')) return 'conflict';
      const country = countrySnap.exists ? countrySnap.data() : action.country;
      if (country.status !== 'active' || country.code !== action.countryCode) return 'conflict';
      const current = citySnap.exists ? citySnap.data() : null;
      if (current && (!destinationAcceptsNewReferences(current, action.countryId) ||
          current.canonicalPolicy.registryId !== action.registryId)) return 'conflict';
      if (!current && action.outcome === 'linked') return 'conflict';
      const reg = registrySnap.exists ? registrySnap.data() : null;
      if ((reg && reg.status !== 'active') || reg?.geometryPolicy?.source === 'identity_requires_review') return 'conflict';
      if (reg && reg.countryCode !== action.countryCode) return 'conflict';
      if (reg && action.expectedRegistry && digest({id:registrySnap.id,...reg}) !== action.expectedRegistry &&
          reg.approval?.catalogDigest !== plan.catalogDigest && !(reg.catalogCandidateIds || []).includes(action.candidateId)) return 'conflict';
      const timestamp = adminImpl.firestore.FieldValue.serverTimestamp();
      if (!countrySnap.exists) transaction.create(countryRef, { ...country, createdAt: timestamp, updatedAt: timestamp });
      const { id, path, ...plannedCity } = action.city;
      const city = current || plannedCity;
      if (!current) transaction.create(cityRef, { ...city, createdAt: timestamp, updatedAt: timestamp });
      const registryChanged = !reg || reg.destinationPath !== action.destinationPath ||
        !(reg.catalogCandidateIds || []).includes(action.candidateId);
      if (reg && registryChanged) {
        transaction.set(registryRef, { catalogCandidateIds: [...new Set([...(reg.catalogCandidateIds || []), action.candidateId])],
          destinationPath: action.destinationPath }, { merge: true });
      } else if (!reg) {
        const { id: registryId, ...entry } = action.entry;
        transaction.set(registryRef, { ...entry, updatedAt: timestamp }, { merge: true });
      }
      transaction.set(db.doc(`destinationCatalog/${catalogId(action.countryId, action.cityId)}`),
        catalogData({ countryId: action.countryId, cityId: action.cityId, city, country, timestamp }));
      const revision = registryChanged ? touchRegistryRevision(transaction, db, action.countryCode)
        : revisions[action.countryCode] || '';
      return { outcome: current ? 'linked' : 'created', revision };
    });
    if (outcome === 'conflict') receipt.conflicts.push(action.candidateId);
    else { receipt[outcome.outcome]++; revisions[action.countryCode] = outcome.revision; }
    checkpoint(receipt);
  }
  return receipt;
}

async function main(argv = process.argv.slice(2)) {
  const value = flag => argv.includes(flag) ? argv[argv.indexOf(flag)+1] : '';
  const output = value('--output');
  const ignoredRoot = path.resolve(__dirname, '../../.codex_tmp');
  const relativeOutput = output && path.relative(ignoredRoot, path.resolve(output));
  if (!relativeOutput || relativeOutput.startsWith('..') || path.isAbsolute(relativeOutput)) throw new Error('An ignored --output path is required.');
  initializeAdmin(admin, { projectId: 'planli-f0b12' });
  const snapshot = await inventory(admin.firestore());
  const supplements = value('--supplements') ? JSON.parse(fs.readFileSync(value('--supplements'),'utf8'))
    : require('../data/reviewedDestinationCoordinates.json');
  const plan = buildPlan(snapshot, { supplements });
  if (argv.includes('--apply')) {
    if (value('--expected-digest') !== plan.catalogDigest) throw new Error('Review the dry-run digest before apply.');
    if (value('--expected-plan-digest') !== plan.planDigest) throw new Error('Live inventory changed: review a fresh dry-run plan digest.');
    if (plan.actions.some(a => a.reason === 'incomplete_identity' || a.reason === 'ambiguous_existing_destination')) {
      throw new Error('Resolve incomplete/ambiguous identities before applying.');
    }
    fs.writeFileSync(output, JSON.stringify(plan, null, 2));
    plan.receipt = await applyPlan(admin.firestore(), plan, admin, receipt => {
      // Persist partial progress even if a later transaction or process fails.
      fs.writeFileSync(`${output}.receipt.json`, JSON.stringify(receipt, null, 2));
    });
  }
  fs.writeFileSync(output, JSON.stringify(plan, null, 2));
  console.log(JSON.stringify({ mode: argv.includes('--apply') ? 'apply' : 'dry-run', catalogDigest: plan.catalogDigest, planDigest: plan.planDigest,
    count: plan.count, summary: plan.summary, exclusions: plan.actions.filter(a => a.outcome==='excluded'), receipt:plan.receipt }));
}
if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode=1; })
  .finally(() => admin.apps.length ? admin.app().delete() : undefined);
module.exports = { buildPlan, applyPlan, inventory, digest };
