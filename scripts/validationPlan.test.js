const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  classifyChanges,
  createPlan,
  extractLiteralSpecifiers,
  hasUnsupportedDynamicRelativeLoad,
  normalizePath,
  parseArgs,
  selectDependentTests,
  shouldRunSecurityPreflight,
  transitiveDependencies,
  unique,
} = require('./validationPlan');

function fixtureRepo(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'planli-validation-'));
  for (const [relative, contents] of Object.entries(files)) {
    const absolute = path.join(root, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, contents);
  }
  return root;
}

function removeFixture(root) {
  const resolved = path.resolve(root);
  const expectedPrefix = path.join(path.resolve(os.tmpdir()), 'planli-validation-');
  if (!resolved.startsWith(expectedPrefix)) throw new Error(`Refusing to remove unexpected fixture: ${resolved}`);
  fs.rmSync(resolved, { recursive: true, force: true });
}

test('paths are normalized and deduplicated across Windows and POSIX forms', () => {
  assert.equal(normalizePath('.\\client\\src\\App.js'), 'client/src/App.js');
  assert.deepEqual(unique(['functions\\a.js', './functions/a.js', 'functions/b.js']), [
    'functions/a.js',
    'functions/b.js',
  ]);
});

test('documentation-only changes do not schedule application validation', () => {
  const plan = classifyChanges([
    'README.md',
    'AGENTS.md',
    'client/AGENTS.md',
    'functions/AGENTS.md',
  ]);
  assert.equal(plan.tooling, false);
  assert.equal(plan.client, false);
  assert.equal(plan.functions, false);
  assert.equal(plan.rules, false);
  assert.equal(plan.taxonomy, false);
});

test('validation tooling changes schedule only the lightweight planner suite', () => {
  const plan = classifyChanges(['scripts/validationPlan.js', '.github/workflows/pr-validation.yml']);
  assert.equal(plan.tooling, true);
  assert.equal(plan.validationTooling, true);
  assert.equal(plan.securityTooling, false);
  assert.equal(plan.legalPolicy, false);
  assert.equal(plan.client, false);
  assert.equal(plan.functions, false);
  assert.equal(plan.rules, false);
});

test('security and legal tooling changes schedule their purpose-built checks', () => {
  const security = classifyChanges(['scripts/securityLocalScan.js', '.semgrep/planli.yml']);
  assert.equal(security.tooling, true);
  assert.equal(security.securityTooling, true);
  assert.equal(security.validationTooling, false);
  assert.equal(security.legalPolicy, false);

  const legal = classifyChanges(['scripts/syncLegalPolicy.js', 'config/legal-policy.json']);
  assert.equal(legal.tooling, true);
  assert.equal(legal.legalPolicy, true);
  assert.equal(legal.validationTooling, false);
  assert.equal(legal.securityTooling, false);
});

test('GitHub delegates scanner preflight to the dedicated security workflow', () => {
  assert.equal(shouldRunSecurityPreflight({}), true);
  assert.equal(shouldRunSecurityPreflight({ GITHUB_ACTIONS: 'false' }), true);
  assert.equal(shouldRunSecurityPreflight({ GITHUB_ACTIONS: 'true' }), false);
  assert.equal(shouldRunSecurityPreflight({ GITHUB_ACTIONS: 'TRUE' }), false);
});

test('boundary paths schedule only their purpose-built checks', () => {
  const rules = classifyChanges(['firestore.rules']);
  assert.equal(rules.rules, true);
  assert.equal(rules.client, false);
  assert.equal(rules.functions, false);

  const rulesTest = classifyChanges(['functions/rules.test.js']);
  assert.equal(rulesTest.rules, true);

  const indexes = classifyChanges(['firestore.indexes.json']);
  assert.equal(indexes.indexes, true);
  assert.equal(indexes.functions, true);
  assert.equal(indexes.rules, false);
});

test('admin, native, taxonomy, and dependency changes are classified independently', () => {
  const admin = classifyChanges(['client/src/features/admin/screens/AdminPanelScreen.js']);
  assert.equal(admin.adminExport, true);
  assert.equal(admin.nativeExport, false);

  const native = classifyChanges(['client/app.config.js']);
  assert.equal(native.nativeExport, true);
  assert.equal(native.adminExport, false);

  const taxonomy = classifyChanges(['shared/travelTaxonomy.json']);
  assert.equal(taxonomy.taxonomy, true);
  assert.equal(taxonomy.client, true);
  assert.equal(taxonomy.functions, true);

  const dependency = classifyChanges(['functions/package-lock.json']);
  assert.equal(dependency.functionsFull, true);
  assert.equal(dependency.functionsAudit, true);

  const scriptsOnlyPackageChange = classifyChanges(['functions/package.json']);
  assert.equal(scriptsOnlyPackageChange.functionsFull, false);
  assert.equal(scriptsOnlyPackageChange.functionsAudit, true);
});

test('literal dependency extraction supports CommonJS and module syntax', () => {
  const source = `
    const a = require('./a');
    const b = require.resolve("./b");
    import c from './c.js';
    export { d } from './d.js';
    const e = import('./e.js');
  `;
  assert.deepEqual(extractLiteralSpecifiers(source), ['./a', './b', './c.js', './d.js', './e.js']);
  assert.equal(hasUnsupportedDynamicRelativeLoad(source), false);
  assert.equal(hasUnsupportedDynamicRelativeLoad("require('./' + name)"), true);
  assert.equal(hasUnsupportedDynamicRelativeLoad('import(moduleName)'), true);
});

test('transitive dependency selection returns every affected test once', () => {
  const graph = new Map([
    ['functions/shared.js', new Set()],
    ['functions/service.js', new Set(['functions/shared.js'])],
    ['functions/service.test.js', new Set(['functions/service.js'])],
    ['functions/other.test.js', new Set(['functions/shared.js'])],
  ]);
  assert.deepEqual([...transitiveDependencies(graph, 'functions/service.test.js')].sort(), [
    'functions/service.js',
    'functions/shared.js',
  ]);
  assert.deepEqual(selectDependentTests(graph, ['functions/shared.js']), [
    'functions/other.test.js',
    'functions/service.test.js',
  ]);
});

test('unsupported dynamic backend loading uses the conservative full fallback', (t) => {
  const root = fixtureRepo({
    'functions/shared.js': "const name = './runtime'; module.exports = require(name);",
    'functions/shared.test.js': "require('./shared');",
  });
  t.after(() => removeFixture(root));
  const plan = createPlan(['functions/shared.js'], root);
  assert.equal(plan.functionsFull, true);
  assert.match(plan.fallbackReasons.join('\n'), /full Functions fallback/);
  assert.match(plan.warnings.join('\n'), /dynamic module load/);
});

test('an untested maintenance script falls back only to the script test group', (t) => {
  const root = fixtureRepo({
    'functions/scripts/changedScript.js': 'module.exports = {};',
    'functions/scripts/existingScript.js': 'module.exports = {};',
    'functions/scripts/existingScript.test.js': "require('./existingScript');",
  });
  t.after(() => removeFixture(root));
  const plan = createPlan(['functions/scripts/changedScript.js'], root);
  assert.equal(plan.functionsFull, false);
  assert.deepEqual(plan.functionsTests, ['functions/scripts/existingScript.test.js']);
  assert.match(plan.fallbackReasons.join('\n'), /script test group/);
});

test('CLI defaults include the worktree and explicit heads use exact commits', () => {
  assert.deepEqual(parseArgs([]), {
    command: 'run',
    base: 'main',
    head: 'HEAD',
    scope: 'all',
    includeWorktree: !process.env.CI,
    planOnly: false,
    githubOutput: null,
    help: false,
  });
  assert.equal(parseArgs(['plan', '--base', 'abc', '--head', 'def']).includeWorktree, false);
  assert.equal(parseArgs(['run', '--scope', 'client', '--plan-only']).scope, 'client');
  assert.equal(parseArgs(['--help']).help, true);
  assert.throws(() => parseArgs(['--base']), /missing its required value/);
});
