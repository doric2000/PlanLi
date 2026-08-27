/* eslint-disable no-await-in-loop, no-console */
const admin = require('firebase-admin');
const { discoveryRegionForCountry, routeRegionFields } = require('../discoveryRegions');
const { initializeAdmin } = require('./localCredentials');

const PAGE_SIZE = 350;

function regionPatchForDocument(kind, data, documentId) {
  if (kind === 'route') {
    const countryIds = (data?.destinations || []).map((entry) => entry?.countryId).filter(Boolean);
    if (!countryIds.length) throw new Error(`Route ${documentId} has no canonical destinations.`);
    const fields = routeRegionFields(countryIds);
    if (fields.discoveryRegionIds.length !== new Set(countryIds).size && countryIds.some((id) => !discoveryRegionForCountry(id))) {
      throw new Error(`Route ${documentId} contains an unsupported country.`);
    }
    return fields;
  }
  const countryId = kind === 'country' ? documentId : data?.countryId || data?.destination?.countryId;
  const discoveryRegionId = discoveryRegionForCountry(countryId);
  if (!discoveryRegionId) throw new Error(`${kind} ${documentId} has an unsupported country.`);
  return { discoveryRegionId };
}

function patchesEqual(data, patch) {
  return Object.entries(patch).every(([key, value]) => JSON.stringify(data?.[key]) === JSON.stringify(value));
}

async function scanQuery({ firestore, queryFactory, kind, apply, summary }) {
  let cursor = null;
  while (true) {
    let query = queryFactory().orderBy(admin.firestore.FieldPath.documentId()).limit(PAGE_SIZE);
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    if (snapshot.empty) break;
    const batch = firestore.batch();
    let writes = 0;
    snapshot.docs.forEach((document) => {
      const data = document.data() || {};
      const patch = regionPatchForDocument(kind, data, document.id);
      summary.scanned += 1;
      summary.byKind[kind] = (summary.byKind[kind] || 0) + 1;
      if (patchesEqual(data, patch)) { summary.current += 1; return; }
      summary.ready += 1;
      if (apply) { batch.update(document.ref, patch); writes += 1; }
    });
    if (writes) { await batch.commit(); summary.updated += writes; }
    cursor = snapshot.docs.at(-1);
    if (snapshot.size < PAGE_SIZE) break;
  }
}

async function backfillDiscoveryRegions({ firestore, apply = false }) {
  const summary = { scanned: 0, current: 0, ready: 0, updated: 0, byKind: {} };
  const targets = [
    ['country', () => firestore.collection('countries')],
    ['destination', () => firestore.collectionGroup('destinations')],
    ['catalog', () => firestore.collection('destinationCatalog')],
    ['recommendation', () => firestore.collection('recommendations')],
    ['route', () => firestore.collection('routes')],
  ];
  for (const [kind, queryFactory] of targets) {
    await scanQuery({ firestore, queryFactory, kind, apply, summary });
  }
  return summary;
}

async function main() {
  const apply = process.argv.slice(2).includes('--apply');
  initializeAdmin(admin);
  console.log(`Discovery-region backfill: ${apply ? 'APPLY' : 'DRY RUN'}`);
  const summary = await backfillDiscoveryRegions({ firestore: admin.firestore(), apply });
  console.log('Discovery-region backfill complete.', summary);
  if (!apply) console.log('No data changed. Re-run with --apply only after reviewing this summary.');
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });

module.exports = { backfillDiscoveryRegions, patchesEqual, regionPatchForDocument };
