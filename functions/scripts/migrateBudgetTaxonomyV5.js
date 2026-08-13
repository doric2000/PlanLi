/* eslint-disable no-await-in-loop, no-console */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const { initializeAdmin } = require('./localCredentials');

const TARGET_VERSION = 5;
const VALID_POST_BUDGETS = new Set(['free', 'economy', 'balanced', 'comfort', 'premium']);
const DEFAULT_STATE_DIR = path.join(__dirname, '..', '.budget-taxonomy-v5');
const CONFIRMED_BUDGETS = Object.freeze({
  'recommendations/rec_61tU4Xxoyq9t8VRYlzGO': 'economy',
  'recommendations/u47NkbLeexff2Qzd9XRD': 'free',
  'routes/ALhlBaDf39KdZ8uwZyBE': 'free',
});

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : null;
}

function parseArgs(argv) {
  const rollback = valueAfter(argv, '--rollback');
  if (rollback && argv.includes('--apply')) throw new Error('Use either --apply or --rollback, not both.');
  return {
    apply: argv.includes('--apply'),
    rollback: rollback ? path.resolve(rollback) : null,
    stateDir: path.resolve(valueAfter(argv, '--state-dir') || DEFAULT_STATE_DIR),
  };
}

function budgetFor(pathname, data) {
  return pathname.startsWith('recommendations/') ? data.budget : data.facets?.budgetLevel;
}

function migrationCandidate(snapshot) {
  const pathname = snapshot.ref.path;
  const data = snapshot.data() || {};
  if (data.status !== 'active') return null;
  if (!/^recommendations\/[^/]+$/.test(pathname) && !/^routes\/[^/]+$/.test(pathname)) return null;
  const legacy = Number(data.taxonomyVersion || 0) < TARGET_VERSION;
  const oldBudget = budgetFor(pathname, data);
  let budget = oldBudget;
  if (legacy && oldBudget === 'economy') {
    budget = CONFIRMED_BUDGETS[pathname];
    if (!budget) throw new Error(`Unclassified legacy economy content: ${pathname}`);
  }
  if (!VALID_POST_BUDGETS.has(budget)) {
    throw new Error(`Invalid active content budget: ${pathname}`);
  }
  const patch = {};
  if (data.taxonomyVersion !== TARGET_VERSION) patch.taxonomyVersion = TARGET_VERSION;
  if (pathname.startsWith('recommendations/')) {
    if (data.budget !== budget) patch.budget = budget;
    if (data.facets?.budgetLevel !== budget) patch['facets.budgetLevel'] = budget;
  } else if (data.facets?.budgetLevel !== budget) {
    patch['facets.budgetLevel'] = budget;
  }
  if (!Object.keys(patch).length) return null;
  return {
    snapshot,
    path: pathname,
    patch,
    classification: legacy && oldBudget === 'economy' ? budget : null,
    before: {
      taxonomyVersion: data.taxonomyVersion ?? null,
      ...(pathname.startsWith('recommendations/') ? { budget: data.budget ?? null } : {}),
      facetBudgetLevel: data.facets?.budgetLevel ?? null,
    },
  };
}

function createManifestWriter(stateDir) {
  return (manifest) => {
    fs.mkdirSync(stateDir, { recursive: true });
    const stamp = manifest.createdAt.replace(/[:.]/g, '-');
    const manifestPath = path.join(stateDir, `budget-taxonomy-v5-${stamp}.json`);
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
      encoding: 'utf8', mode: 0o600,
    });
    return manifestPath;
  };
}

async function loadDocuments(firestore) {
  const [recommendations, routes] = await Promise.all([
    firestore.collection('recommendations').get(),
    firestore.collection('routes').get(),
  ]);
  return [...recommendations.docs, ...routes.docs];
}

async function migrateBudgetTaxonomy({
  firestore,
  documents,
  apply = false,
  stateDir = DEFAULT_STATE_DIR,
  writeManifest = createManifestWriter(stateDir),
}) {
  const snapshots = documents || await loadDocuments(firestore);
  const candidates = snapshots.map(migrationCandidate).filter(Boolean);
  const summary = {
    mode: apply ? 'apply' : 'dry-run',
    scanned: snapshots.length,
    documentsAffected: candidates.length,
    recommendationsAffected: candidates.filter((entry) => entry.path.startsWith('recommendations/')).length,
    routesAffected: candidates.filter((entry) => entry.path.startsWith('routes/')).length,
    budgetChanges: candidates.filter((entry) => entry.classification || Object.hasOwn(entry.patch, 'budget') ||
      Object.hasOwn(entry.patch, 'facets.budgetLevel')).map((entry) => ({
        path: entry.path,
        from: entry.before.budget ?? entry.before.facetBudgetLevel,
        to: entry.classification || entry.patch.budget || entry.patch['facets.budgetLevel'],
      })),
    applied: 0,
    conflicts: 0,
    manifestPath: null,
  };
  if (!apply || !candidates.length) return summary;

  const manifest = {
    version: 1,
    taxonomyVersion: TARGET_VERSION,
    createdAt: new Date().toISOString(),
    projectId: firestore.projectId || null,
    documents: candidates.map(({ path: documentPath, before }) => ({ path: documentPath, before })),
  };
  summary.manifestPath = writeManifest(manifest);

  for (const candidate of candidates) {
    const applied = await firestore.runTransaction(async (transaction) => {
      const current = await transaction.get(candidate.snapshot.ref);
      if (!current.exists) return false;
      if (candidate.snapshot.updateTime?.isEqual &&
          !candidate.snapshot.updateTime.isEqual(current.updateTime)) return null;
      const refreshed = migrationCandidate(current);
      if (!refreshed) return false;
      transaction.update(current.ref, refreshed.patch);
      return true;
    });
    if (applied === null) summary.conflicts += 1;
    else if (applied) summary.applied += 1;
  }
  return summary;
}

async function rollbackBudgetTaxonomy({ firestore, manifest }) {
  if (manifest?.taxonomyVersion !== TARGET_VERSION || !Array.isArray(manifest.documents)) {
    throw new Error('Invalid budget taxonomy rollback manifest.');
  }
  let restored = 0;
  for (const entry of manifest.documents) {
    if (!/^recommendations\/[^/]+$/.test(entry.path) && !/^routes\/[^/]+$/.test(entry.path)) {
      throw new Error(`Invalid rollback document path: ${entry.path}`);
    }
    const patch = {
      taxonomyVersion: entry.before.taxonomyVersion == null
        ? admin.firestore.FieldValue.delete()
        : entry.before.taxonomyVersion,
      'facets.budgetLevel': entry.before.facetBudgetLevel == null
        ? admin.firestore.FieldValue.delete()
        : entry.before.facetBudgetLevel,
    };
    if (entry.path.startsWith('recommendations/')) {
      patch.budget = entry.before.budget == null
        ? admin.firestore.FieldValue.delete()
        : entry.before.budget;
    }
    await firestore.doc(entry.path).update(patch);
    restored += 1;
  }
  return { mode: 'rollback', restored };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  initializeAdmin(admin);
  const firestore = admin.firestore();
  if (options.rollback) {
    const manifest = JSON.parse(fs.readFileSync(options.rollback, 'utf8'));
    console.log(JSON.stringify(await rollbackBudgetTaxonomy({ firestore, manifest }), null, 2));
    return;
  }
  console.log(`Budget taxonomy v5 migration: ${options.apply ? 'APPLY' : 'DRY RUN'}`);
  const summary = await migrateBudgetTaxonomy({ firestore, ...options });
  console.log(JSON.stringify(summary, null, 2));
  if (!options.apply && summary.documentsAffected) {
    console.log('No data changed. Re-run with --apply after reviewing the classified changes.');
  }
  if (summary.conflicts) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Budget taxonomy v5 migration failed.', error);
    process.exitCode = 1;
  });
}

module.exports = {
  CONFIRMED_BUDGETS,
  migrationCandidate,
  migrateBudgetTaxonomy,
  parseArgs,
  rollbackBudgetTaxonomy,
};
