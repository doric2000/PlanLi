'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const allowedWorkspaces = new Set(['.', 'client', 'functions']);
const allowedClientAdvisory = 'GHSA-vcc3-ghjq-m6fr';

const allowedClientVulnerabilities = Object.freeze({
  '@react-navigation/bottom-tabs': {
    via: ['@react-navigation/elements', '@react-navigation/native'],
    effects: [],
  },
  '@react-navigation/core': {
    via: ['query-string'],
    effects: ['@react-navigation/native'],
  },
  '@react-navigation/drawer': {
    via: ['@react-navigation/elements', '@react-navigation/native'],
    effects: [],
  },
  '@react-navigation/elements': {
    via: ['@react-navigation/native'],
    effects: [
      '@react-navigation/bottom-tabs',
      '@react-navigation/drawer',
      '@react-navigation/stack',
    ],
  },
  '@react-navigation/native': {
    via: ['@react-navigation/core'],
    effects: [
      '@react-navigation/bottom-tabs',
      '@react-navigation/drawer',
      '@react-navigation/elements',
      '@react-navigation/stack',
    ],
  },
  '@react-navigation/stack': {
    via: ['@react-navigation/elements', '@react-navigation/native'],
    effects: [],
  },
  'decode-uri-component': {
    via: ['decode-uri-component'],
    effects: ['query-string'],
  },
  'query-string': {
    via: ['decode-uri-component'],
    effects: ['@react-navigation/core'],
  },
});

const allowedClientLockChain = Object.freeze({
  'decode-uri-component': { version: '0.2.2', dependency: null },
  'query-string': {
    version: '7.1.3',
    dependency: ['decode-uri-component', '^0.2.2'],
  },
  '@react-navigation/core': {
    version: '7.13.7',
    dependency: ['query-string', '^7.1.3'],
  },
  '@react-navigation/native': {
    version: '7.1.26',
    dependency: ['@react-navigation/core', '^7.13.7'],
  },
  '@react-navigation/elements': { version: '2.9.3', dependency: null },
  '@react-navigation/bottom-tabs': {
    version: '7.8.12',
    dependency: ['@react-navigation/elements', '^2.9.2'],
  },
  '@react-navigation/drawer': {
    version: '7.7.10',
    dependency: ['@react-navigation/elements', '^2.9.3'],
  },
  '@react-navigation/stack': {
    version: '7.6.12',
    dependency: ['@react-navigation/elements', '^2.9.2'],
  },
});

function sortedStrings(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function parseArgs(argv) {
  if (argv.length !== 2 || argv[0] !== '--workspace' || !allowedWorkspaces.has(argv[1])) {
    throw new Error('Usage: node scripts/verifyDependencyAudit.js --workspace <.|client|functions>');
  }
  return { workspace: argv[1] };
}

function viaNames(vulnerability) {
  assert.ok(Array.isArray(vulnerability.via), 'Audit vulnerability must include a via array');
  return vulnerability.via.map((entry) => (typeof entry === 'string' ? entry : entry?.name));
}

function advisoryIds(report) {
  const ids = new Set();
  for (const vulnerability of Object.values(report.vulnerabilities || {})) {
    for (const entry of vulnerability.via || []) {
      if (typeof entry !== 'object' || entry === null) continue;
      const match = String(entry.url || '').match(/\/advisories\/(GHSA-[a-z0-9-]+)$/i);
      assert.ok(match, `Direct advisory for ${vulnerability.name || 'unknown package'} has no GHSA URL`);
      ids.add(match[1].toLowerCase());
    }
  }
  return sortedStrings(ids);
}

function assertAllowedLockChain(lockfile) {
  assert.equal(lockfile?.lockfileVersion, 3, 'Client lockfile format changed; review the audit exception');
  for (const [packageName, expected] of Object.entries(allowedClientLockChain)) {
    const entry = lockfile.packages?.[`node_modules/${packageName}`];
    assert.ok(entry, `Allowed dependency ${packageName} is missing from the client lockfile`);
    assert.equal(entry.version, expected.version, `${packageName} changed; review the audit exception`);
    if (expected.dependency) {
      const [dependencyName, dependencyRange] = expected.dependency;
      assert.equal(
        entry.dependencies?.[dependencyName],
        dependencyRange,
        `${packageName} no longer has the reviewed ${dependencyName} edge`,
      );
    }
  }
}

function verifyAuditReport(report, { workspace, lockfile = null }) {
  assert.equal(report?.auditReportVersion, 2, 'Unsupported or invalid npm audit report');
  const vulnerabilities = report.vulnerabilities || {};
  const names = sortedStrings(Object.keys(vulnerabilities));
  const metadata = report.metadata?.vulnerabilities;
  assert.ok(metadata && Number.isInteger(metadata.total), 'npm audit report is missing vulnerability totals');

  if (names.length === 0) {
    assert.equal(metadata.total, 0, 'npm audit totals disagree with the vulnerability inventory');
    return { status: 'clean', workspace };
  }

  assert.equal(workspace, 'client', `Dependency advisories are not allowlisted for ${workspace}`);
  assert.ok(lockfile, 'Client lockfile is required to verify the reviewed dependency chain');
  assert.deepEqual(names, sortedStrings(Object.keys(allowedClientVulnerabilities)),
    'Client audit contains a package outside the reviewed React Navigation chain');
  assert.deepEqual(advisoryIds(report), [allowedClientAdvisory.toLowerCase()],
    'Client audit contains an advisory outside the reviewed GHSA');

  for (const [name, expected] of Object.entries(allowedClientVulnerabilities)) {
    const vulnerability = vulnerabilities[name];
    assert.equal(vulnerability.name, name, `Audit package identity mismatch for ${name}`);
    assert.equal(vulnerability.severity, 'moderate', `${name} severity changed; review required`);
    assert.equal(vulnerability.fixAvailable, false, `${name} now has a supported fix; remove the exception`);
    assert.deepEqual(sortedStrings(viaNames(vulnerability)), sortedStrings(expected.via),
      `${name} has an unreviewed advisory path`);
    assert.deepEqual(sortedStrings(vulnerability.effects || []), sortedStrings(expected.effects),
      `${name} has an unreviewed dependent path`);
    assert.deepEqual(vulnerability.nodes, [`node_modules/${name}`],
      `${name} is installed at an unreviewed path`);
  }

  const directAdvisory = vulnerabilities['decode-uri-component'].via[0];
  assert.equal(directAdvisory.dependency, 'decode-uri-component');
  assert.equal(directAdvisory.severity, 'moderate');
  assert.equal(directAdvisory.range, '<=0.4.2');
  assert.equal(directAdvisory.url, `https://github.com/advisories/${allowedClientAdvisory}`);
  assert.deepEqual(metadata, {
    info: 0,
    low: 0,
    moderate: 8,
    high: 0,
    critical: 0,
    total: 8,
  }, 'Client audit totals changed; review required');
  assertAllowedLockChain(lockfile);

  return {
    status: 'reviewed-unreachable-path',
    workspace,
    advisory: allowedClientAdvisory,
  };
}

function runNpmAudit(workspace) {
  const cwd = path.resolve(repoRoot, workspace);
  const npmCliCandidates = [
    path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.resolve(path.dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ];
  const npmCli = npmCliCandidates.find((candidate) => fs.existsSync(candidate));
  const command = npmCli ? process.execPath : 'npm';
  const commandArgs = npmCli
    ? [npmCli, 'audit', '--json', '--audit-level=moderate']
    : ['audit', '--json', '--audit-level=moderate'];
  const result = spawnSync(command, commandArgs, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`npm audit failed operationally for ${workspace} (exit ${result.status})`);
  }
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    throw new Error(`npm audit returned invalid JSON for ${workspace}: ${String(result.stderr || '').trim()}`);
  }
  const lockfile = workspace === 'client'
    ? JSON.parse(fs.readFileSync(path.join(cwd, 'package-lock.json'), 'utf8'))
    : null;
  return verifyAuditReport(report, { workspace, lockfile });
}

function main() {
  const { workspace } = parseArgs(process.argv.slice(2));
  const result = runNpmAudit(workspace);
  if (result.status === 'clean') {
    console.log(`Dependency audit passed for ${workspace}: no advisories.`);
    return;
  }
  console.log(
    `Dependency audit passed for ${workspace}: ${result.advisory} is limited to the reviewed, unreachable React Navigation path.`,
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Dependency audit policy failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  advisoryIds,
  allowedClientAdvisory,
  allowedClientLockChain,
  allowedClientVulnerabilities,
  parseArgs,
  verifyAuditReport,
};
