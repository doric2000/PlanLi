'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const allowedWorkspaces = new Set(['.', 'client', 'functions']);
function parseArgs(argv) {
  if (argv.length !== 2 || argv[0] !== '--workspace' || !allowedWorkspaces.has(argv[1])) {
    throw new Error('Usage: node scripts/verifyDependencyAudit.js --workspace <.|client|functions>');
  }
  return { workspace: argv[1] };
}

function verifyAuditReport(report, { workspace }) {
  assert.ok(allowedWorkspaces.has(workspace), 'Unreviewed audit workspace');
  assert.equal(report?.auditReportVersion, 2, 'Unsupported or invalid npm audit report');
  const vulnerabilities = report.vulnerabilities;
  assert.ok(vulnerabilities && typeof vulnerabilities === 'object' && !Array.isArray(vulnerabilities),
    'npm audit report is missing the vulnerability inventory');
  const metadata = report.metadata?.vulnerabilities;
  assert.ok(metadata && Number.isInteger(metadata.total), 'npm audit report is missing vulnerability totals');
  assert.equal(Object.keys(vulnerabilities).length, 0,
    `Dependency advisories are not allowed for ${workspace}`);
  assert.equal(metadata.total, 0, 'npm audit totals disagree with the vulnerability inventory');
  return { status: 'clean', workspace };
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
  return verifyAuditReport(report, { workspace });
}

function main() {
  const { workspace } = parseArgs(process.argv.slice(2));
  const result = runNpmAudit(workspace);
  console.log(`Dependency audit passed for ${result.workspace}: no advisories.`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Dependency audit policy failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { parseArgs, verifyAuditReport };
