'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { parseArgs, verifyAuditReport } = require('./verifyDependencyAudit');
const clean = () => ({ auditReportVersion: 2, vulnerabilities: {},
  metadata: { vulnerabilities: { total: 0 } } });

test('only the three reviewed workspaces are accepted', () => {
  for (const workspace of ['.', 'client', 'functions']) {
    assert.deepEqual(parseArgs(['--workspace', workspace]), { workspace });
    assert.deepEqual(verifyAuditReport(clean(), { workspace }), { status: 'clean', workspace });
  }
  assert.throws(() => parseArgs(['--workspace', '../outside']), /Usage/);
  assert.throws(() => verifyAuditReport(clean(), { workspace: '../outside' }), /Unreviewed/);
});

test('all advisories are rejected, including the former navigation exception', () => {
  for (const workspace of ['.', 'client', 'functions']) {
    for (const name of ['decode-uri-component', 'query-string', '@react-navigation/core', 'unrelated']) {
      const report = clean();
      report.vulnerabilities[name] = { name, severity: 'moderate', via: [], fixAvailable: false };
      report.metadata.vulnerabilities.total = 1;
      assert.throws(() => verifyAuditReport(report, { workspace }), /not allowed/);
    }
  }
});

test('malformed or inconsistent reports fail closed', () => {
  for (const report of [null, {}, { ...clean(), auditReportVersion: 1 },
    { ...clean(), vulnerabilities: null }, { ...clean(), vulnerabilities: [] },
    { ...clean(), metadata: {} },
    { ...clean(), metadata: { vulnerabilities: { total: 1 } } }]) {
    assert.throws(() => verifyAuditReport(report, { workspace: 'client' }));
  }
});
