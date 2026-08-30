const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  batchesOf,
  collectSourceFiles,
  fullScanTargets,
  gitleaksReportedCommitCount,
  localEnvironmentFiles,
  mergeSarif,
  parseArgs,
  semgrepConfigs,
  snapshotFiles,
} = require('./securityLocalScan');

test('parseArgs accepts an exact diff range', () => {
  assert.deepEqual(parseArgs(['diff', '--base', 'abc', '--head', 'def']), {
    mode: 'diff', base: 'abc', head: 'def',
  });
});

test('parseArgs rejects unknown arguments', () => {
  assert.throws(() => parseArgs(['full', '--silent']), /Unknown argument/);
});

test('input scan uses only the repository-specific high-signal rules', () => {
  const configs = semgrepConfigs();
  assert.equal(configs.length, 1);
  assert.equal(path.basename(configs[0]), 'planli-security.yml');
});

test('full scan targets every existing production source root, not only sink-prefilter hits', () => {
  const targets = fullScanTargets().map((target) => target.replace(/\\/g, '/'));
  assert.ok(targets.includes('functions'));
  assert.ok(targets.includes('client/src'));
  assert.ok(targets.includes('scripts'));
});

test('Semgrep batches are bounded and SARIF results are merged', () => {
  assert.deepEqual(batchesOf(['a', 'b', 'c'], 2), [['a', 'b'], ['c']]);
  const merged = mergeSarif([
    { version: '2.1.0', runs: [{ tool: { driver: { name: 'Semgrep' } }, results: [{ ruleId: 'a' }] }] },
    { version: '2.1.0', runs: [{ tool: { driver: { name: 'Semgrep' } }, results: [{ ruleId: 'b' }] }] },
  ]);
  assert.deepEqual(merged.runs[0].results.map((result) => result.ruleId), ['a', 'b']);
});

test('Gitleaks reported commit evidence is parsed separately from Git inventory', () => {
  assert.equal(gitleaksReportedCommitCount('INF 428 commits scanned.'), 428);
  assert.equal(gitleaksReportedCommitCount('no scan summary'), 0);
});

test('source snapshots are stable and exclude test fixtures', () => {
  const first = collectSourceFiles(['scripts']);
  const second = collectSourceFiles(['scripts']);
  assert.deepEqual(first, second);
  assert.ok(first.includes('scripts/securityLocalScan.js'));
  assert.ok(!first.some((file) => /\.test\.[cm]?[jt]sx?$/i.test(file)));
  assert.equal(snapshotFiles(first), snapshotFiles(second));
});

test('ignored local environment inventory is non-empty and excludes scanner artifacts', () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'planli-env-inventory-'));
  try {
    fs.mkdirSync(path.join(fixture, 'client'), { recursive: true });
    fs.mkdirSync(path.join(fixture, '.codex_tmp'), { recursive: true });
    fs.mkdirSync(path.join(fixture, 'node_modules', 'package'), { recursive: true });
    fs.writeFileSync(path.join(fixture, 'client', '.env'), 'TOKEN=redacted\n');
    fs.writeFileSync(path.join(fixture, 'client', '.env.example'), 'TOKEN=\n');
    fs.writeFileSync(path.join(fixture, '.codex_tmp', '.env'), 'CANARY=ignored\n');
    fs.writeFileSync(path.join(fixture, 'node_modules', 'package', '.env'), 'TOKEN=ignored\n');
    assert.deepEqual(localEnvironmentFiles(fixture), [
      'client/.env',
      'client/.env.example',
    ]);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});
