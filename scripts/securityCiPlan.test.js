const test = require('node:test');
const assert = require('node:assert/strict');
const { createSecurityPlan, planFromEvent, WEEKLY } = require('./securityCiPlan');
const plan = (files, event = 'pull_request') => createSecurityPlan({ event, files, base: 'a'.repeat(40), head: 'b'.repeat(40) });

test('documentation PR scans new secrets without application or dependency scanners', () => {
  const p = plan(['README.md', 'client/AGENTS.md']);
  assert.equal(p.secrets, true);
  for (const key of ['codeql', 'semgrep', 'dependencyReview', 'dependencyAudit']) assert.equal(p[key], false);
  assert.equal(p.secretLogOptions, `${'a'.repeat(40)}..${'b'.repeat(40)} -m`);
});
test('code PR scans changed Semgrep inputs and runs whole-program CodeQL', () => {
  const p = plan(['client/src/config/firebase.js', 'client/__tests__/Auth.test.js']);
  assert.equal(p.codeql, true);
  assert.equal(p.semgrep, true);
  assert.deepEqual(p.semgrepFiles, ['client/src/config/firebase.js']);
  assert.deepEqual(p.audits, []);
});
test('main keeps CodeQL and delta secrets without repeating PR dependency or invariant checks', () => {
  const p = plan(['functions/index.js', 'functions/package-lock.json'], 'push');
  assert.equal(p.codeql, true);
  assert.equal(p.secrets, true);
  assert.equal(p.semgrep, false);
  assert.equal(p.dependencyReview, false);
  assert.deepEqual(p.audits, []);
});

test('source filtering excludes complete test/dependency segments and test suffixes', () => {
  const excluded = ['client/__tests__/screen.js', 'functions/node_modules/pkg/index.js',
    'scripts/check.test.cjs'];
  assert.equal(plan(excluded).codeql, false);
  assert.deepEqual(plan([...excluded, 'client/src/__tests__helpers/screen.js',
    'scripts/check.test.js.backup.js']).semgrepFiles,
  ['client/src/__tests__helpers/screen.js', 'scripts/check.test.js.backup.js']);
});
test('dependency checks select the changed workspace and review Actions dependencies', () => {
  assert.deepEqual(plan(['client/package-lock.json']).audits, ['client']);
  assert.equal(plan(['.github/workflows/pr-validation.yml']).dependencyReview, true);
});
test('daily audits and weekly full scans are independent', () => {
  const daily = createSecurityPlan({ event: 'schedule', schedule: '17 3 * * *' });
  assert.deepEqual(daily.audits, ['.', 'client', 'functions']);
  assert.equal(daily.secrets, false);
  assert.equal(daily.codeql, false);
  const weekly = createSecurityPlan({ event: 'schedule', schedule: WEEKLY });
  assert.equal(weekly.codeql, true);
  assert.equal(weekly.secretLogOptions, '--all -m');
  assert.equal(weekly.semgrep, true);
});
test('invalid event or missing revisions fails closed', () => {
  assert.throws(() => plan([], 'unknown'), /Unsupported/);
  assert.throws(() => planFromEvent('pull_request', {}), /Missing exact/);
});
test('scanner changes scan the whole invariant inventory', () => {
  assert.deepEqual(plan(['.semgrep/planli-security.yml']).semgrepFiles, ['functions', 'client/src', 'client/index.js', 'scripts']);
});


test('the actual security aggregator blocks failures and accepts intentional skips', () => {
  const fs = require('node:fs');
  const vm = require('node:vm');
  const source = fs.readFileSync(require('node:path').join(__dirname, '../.github/workflows/security.yml'), 'utf8');
  const script = source.match(/node -e '([^']+)'/)[1];
  const gate = (results) => { let status = 0; vm.runInNewContext(script, { process: { env: { RESULTS: JSON.stringify(results) }, exit: (code) => { status = code; } } }); return status; };
  assert.equal(gate({ changes: { result: 'success' }, codeql: { result: 'skipped' }, secrets: { result: 'success' } }), 0);
  assert.equal(gate({ changes: { result: 'failure' }, codeql: { result: 'skipped' } }), 1);
  for (const result of ['failure', 'cancelled', 'pending']) assert.equal(gate({ changes: { result: 'success' }, secrets: { result } }), 1);
  assert.match(source, /if: always\(\)/);
  for (const name of ['CodeQL (JavaScript/TypeScript)', 'PlanLi security invariants', 'Full-history secret scan', 'Dependency review', 'Locked dependency audit']) {
    assert.ok(source.includes('name: ' + name), name);
  }
});

test('the fail-closed aggregate retains an existing required security check name', () => {
  const workflow = require('node:fs').readFileSync(require('node:path').join(__dirname, '../.github/workflows/security.yml'), 'utf8');
  const aggregate = workflow.slice(workflow.indexOf('  security-policy:'));
  assert.match(aggregate, /name: PlanLi security invariants/);
  assert.match(aggregate, /if: always\(\)/);
});
