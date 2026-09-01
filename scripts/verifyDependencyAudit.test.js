'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  allowedClientAdvisory,
  parseArgs,
  verifyAuditReport,
} = require('./verifyDependencyAudit');

const clientLockfile = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, '..', 'client', 'package-lock.json'),
  'utf8',
));

function knownClientReport() {
  const vulnerability = (name, via, effects = []) => ({
    name,
    severity: 'moderate',
    isDirect: false,
    via,
    effects,
    range: '*',
    nodes: [`node_modules/${name}`],
    fixAvailable: false,
  });
  return {
    auditReportVersion: 2,
    vulnerabilities: {
      '@react-navigation/bottom-tabs': vulnerability('@react-navigation/bottom-tabs', [
        '@react-navigation/elements', '@react-navigation/native',
      ]),
      '@react-navigation/core': vulnerability('@react-navigation/core', ['query-string'], [
        '@react-navigation/native',
      ]),
      '@react-navigation/drawer': vulnerability('@react-navigation/drawer', [
        '@react-navigation/elements', '@react-navigation/native',
      ]),
      '@react-navigation/elements': vulnerability('@react-navigation/elements', [
        '@react-navigation/native',
      ], [
        '@react-navigation/bottom-tabs', '@react-navigation/drawer', '@react-navigation/stack',
      ]),
      '@react-navigation/native': vulnerability('@react-navigation/native', [
        '@react-navigation/core',
      ], [
        '@react-navigation/bottom-tabs', '@react-navigation/drawer',
        '@react-navigation/elements', '@react-navigation/stack',
      ]),
      '@react-navigation/stack': vulnerability('@react-navigation/stack', [
        '@react-navigation/elements', '@react-navigation/native',
      ]),
      'decode-uri-component': vulnerability('decode-uri-component', [{
        source: 1147955,
        name: 'decode-uri-component',
        dependency: 'decode-uri-component',
        title: 'decode-uri-component denial of service',
        url: `https://github.com/advisories/${allowedClientAdvisory}`,
        severity: 'moderate',
        range: '<=0.4.2',
      }], ['query-string']),
      'query-string': vulnerability('query-string', ['decode-uri-component'], [
        '@react-navigation/core',
      ]),
    },
    metadata: {
      vulnerabilities: {
        info: 0,
        low: 0,
        moderate: 8,
        high: 0,
        critical: 0,
        total: 8,
      },
    },
  };
}

test('parseArgs accepts only the three reviewed workspaces', () => {
  assert.deepEqual(parseArgs(['--workspace', 'client']), { workspace: 'client' });
  assert.deepEqual(parseArgs(['--workspace', '.']), { workspace: '.' });
  assert.throws(() => parseArgs(['--workspace', '../outside']), /Usage/);
  assert.throws(() => parseArgs(['--workspace', 'client', '--quiet']), /Usage/);
});

test('a clean audit is accepted for every workspace', () => {
  const report = {
    auditReportVersion: 2,
    vulnerabilities: {},
    metadata: { vulnerabilities: { total: 0 } },
  };
  for (const workspace of ['.', 'client', 'functions']) {
    assert.deepEqual(verifyAuditReport(report, { workspace }), { status: 'clean', workspace });
  }
});

test('the exact reviewed React Navigation advisory and lock chain are accepted for client only', () => {
  assert.deepEqual(
    verifyAuditReport(knownClientReport(), { workspace: 'client', lockfile: clientLockfile }),
    {
      status: 'reviewed-unreachable-path',
      workspace: 'client',
      advisory: allowedClientAdvisory,
    },
  );
  assert.throws(
    () => verifyAuditReport(knownClientReport(), { workspace: '.', lockfile: clientLockfile }),
    /not allowlisted/,
  );
});

test('an additional advisory or package cannot hide behind the reviewed exception', () => {
  const report = knownClientReport();
  report.vulnerabilities.unrelated = {
    name: 'unrelated', severity: 'moderate', via: [], effects: [], nodes: ['node_modules/unrelated'],
  };
  report.metadata.vulnerabilities.moderate += 1;
  report.metadata.vulnerabilities.total += 1;
  assert.throws(
    () => verifyAuditReport(report, { workspace: 'client', lockfile: clientLockfile }),
    /outside the reviewed React Navigation chain/,
  );
});

test('a changed GHSA, dependency edge, severity, or available fix requires review', () => {
  const changedGhsa = knownClientReport();
  changedGhsa.vulnerabilities['decode-uri-component'].via[0].url =
    'https://github.com/advisories/GHSA-aaaa-bbbb-cccc';
  assert.throws(
    () => verifyAuditReport(changedGhsa, { workspace: 'client', lockfile: clientLockfile }),
    /outside the reviewed GHSA/,
  );

  const changedPath = knownClientReport();
  changedPath.vulnerabilities['query-string'].effects.push('unreviewed-consumer');
  assert.throws(
    () => verifyAuditReport(changedPath, { workspace: 'client', lockfile: clientLockfile }),
    /unreviewed dependent path/,
  );

  const changedSeverity = knownClientReport();
  changedSeverity.vulnerabilities['decode-uri-component'].severity = 'high';
  assert.throws(
    () => verifyAuditReport(changedSeverity, { workspace: 'client', lockfile: clientLockfile }),
    /severity changed/,
  );

  const availableFix = knownClientReport();
  availableFix.vulnerabilities['decode-uri-component'].fixAvailable = true;
  assert.throws(
    () => verifyAuditReport(availableFix, { workspace: 'client', lockfile: clientLockfile }),
    /supported fix/,
  );
});

test('a lockfile version or reviewed package change requires review', () => {
  const changedLockfile = structuredClone(clientLockfile);
  changedLockfile.packages['node_modules/query-string'].version = '7.1.4';
  assert.throws(
    () => verifyAuditReport(knownClientReport(), {
      workspace: 'client',
      lockfile: changedLockfile,
    }),
    /query-string changed/,
  );
});
