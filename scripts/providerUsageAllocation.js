#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');
const { SKU_ALLOWANCES, COLLECTION, POLICY_VERSION, validUsageRecord } = require('../functions/providerUsagePolicy');
const { allocationBudget } = require('./providerUsageBudget');
const PROJECT = 'planli-f0b12';
const CONFIRM = 'CREATE REVIEWED PLANLI MONTHLY ALLOCATION';
const digest = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const integer = (value) => Number.isSafeInteger(value) && value >= 0;

// Input is an ignored, reviewed evidence manifest, never a production-data fixture.
function allocationRecords(manifest) {
  if (manifest?.schemaVersion !== 1 || manifest.projectId !== PROJECT
    || !/^\d{4}-(0[1-9]|1[0-2])$/.test(manifest.period || '')
    || !/^billingAccounts\/[A-Z0-9-]+$/.test(manifest.billingAccount || '')
    || !/^[a-f0-9]{64}$/.test(manifest.evidenceSha256 || '')
    || !Number.isFinite(Date.parse(manifest.observedAt))
    || !Number.isFinite(Date.parse(manifest.rolloutDeadline))
    || Date.parse(manifest.rolloutDeadline) < Date.parse(manifest.observedAt)) throw new Error('Allocation needs complete reviewed usage evidence.');
  if (Object.keys(manifest.skus || {}).sort().join(',') !== Object.keys(SKU_ALLOWANCES).sort().join(',')) {
    throw new Error('Allocation must explicitly include every reviewed SKU.');
  }
  allocationBudget(manifest);
  const approvalSha256 = digest(manifest);
  return Object.keys(SKU_ALLOWANCES).map((sku) => {
    const row = manifest.skus[sku];
    const baselineUsed = row.projectUsedUpperBound + row.reportingAndRolloutReserve;
    if (!integer(baselineUsed)) throw new Error(`Unsafe baseline: ${sku}.`);
    return { schemaVersion: POLICY_VERSION, projectId: PROJECT, period: manifest.period, sku,
      approvalSha256, limit: row.limit, baselineUsed, reserved: 0 };
  });
}

async function inspect(db, records) {
  const snapshots = await db.getAll(...records.map((record) => db.doc(`${COLLECTION}/${record.period}_${record.sku}`)));
  return snapshots.map((snapshot, index) => ({ expected: records[index], current: snapshot.data() || null }));
}
function summarize(rows) {
  return rows.map(({ expected, current }) => {
    if (current && (!validUsageRecord(current, expected)
      || ['approvalSha256', 'limit', 'baselineUsed'].some((key) => current[key] !== expected[key]))) {
      throw new Error(`Existing allocation differs: ${expected.sku}; never reset a live counter.`);
    }
    return { sku: expected.sku, action: current ? 'reuse' : 'create', limit: expected.limit,
      baselineUsed: expected.baselineUsed, reserved: current?.reserved || 0,
      remaining: Math.max(0, expected.limit - expected.baselineUsed - (current?.reserved || 0)) };
  });
}

async function execute({ db, manifest, apply = false, manifestHash, stateHash, confirm, now = Date.now() }) {
  const records = allocationRecords(manifest);
  const rows = await inspect(db, records);
  const actions = summarize(rows);
  const beforeHash = digest(rows);
  const hash = digest(manifest);
  if (!apply) return { mode: 'dry-run', manifestSha256: hash, stateSha256: beforeHash,
    budget: allocationBudget(manifest), actions };
  if (manifestHash !== hash || stateHash !== beforeHash || confirm !== CONFIRM) throw new Error('Apply requires matching manifest/state hashes and typed confirmation.');
  if (now > Date.parse(manifest.rolloutDeadline)) throw new Error('Usage evidence expired; update the reporting and rollout reserve before apply.');
  if (now < Date.parse(manifest.observedAt)) throw new Error('Usage evidence is in the future.');
  await db.runTransaction(async (transaction) => {
    const refs = records.map((record) => db.doc(`${COLLECTION}/${record.period}_${record.sku}`));
    const snapshots = await transaction.getAll(...refs);
    const currentRows = snapshots.map((snapshot, index) => ({ expected: records[index], current: snapshot.data() || null }));
    summarize(currentRows);
    if (digest(currentRows) !== beforeHash) throw new Error('Allocation changed since dry-run; inspect again.');
    snapshots.forEach((snapshot, index) => {
      if (!snapshot.exists) transaction.create(refs[index], records[index]);
    });
  });
  const verified = summarize(await inspect(db, records));
  if (verified.some((row) => row.action !== 'reuse')) throw new Error('Allocation read-back failed.');
  return { mode: 'apply', manifestSha256: hash, readBackVerified: true, actions: verified };
}

function parseArgs(argv) {
  const options = { apply: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--apply') options.apply = true;
    else if (['--manifest', '--manifest-hash', '--state-hash', '--confirm'].includes(argv[i])) {
      options[argv[i].slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[++i];
    } else throw new Error('Unknown argument.');
  }
  if (!options.manifest) throw new Error('--manifest is required.');
  return options;
}
if (require.main === module) (async () => {
  const options = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(fs.readFileSync(options.manifest, 'utf8'));
  allocationRecords(manifest); // Validate before even obtaining credentials.
  const admin = require('../functions/node_modules/firebase-admin');
  const { gcloudAccessToken } = require('../functions/scripts/localCredentials');
  const app = admin.initializeApp({ projectId: PROJECT, credential: { getAccessToken: async () => gcloudAccessToken() } });
  try { process.stdout.write(`${JSON.stringify(await execute({ ...options, manifest, db: app.firestore() }), null, 2)}\n`); }
  finally { await app.delete(); }
})().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
module.exports = { allocationRecords, execute, summarize, digest, CONFIRM };
