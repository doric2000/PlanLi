'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function readBaseline(repoRoot) {
  const baseline = JSON.parse(fs.readFileSync(path.join(repoRoot, 'config/eas-ios-native-baseline.json'), 'utf8'));
  const app = JSON.parse(fs.readFileSync(path.join(repoRoot, 'client/app.json'), 'utf8')).expo;
  if (baseline.version !== 1 || baseline.projectId !== app.extra?.eas?.projectId
    || baseline.runtime !== (app.ios?.runtimeVersion || app.runtimeVersion)
    || baseline.iosVersion !== (app.ios?.version || app.version) || baseline.channel !== 'production') {
    throw new Error('Native baseline does not match the configured iOS project/runtime/version.');
  }
  return baseline;
}

function normalizedHash(bytes) {
  return crypto.createHash('sha256').update(Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'))).digest('hex');
}

function parseEasJson(output) {
  const text = String(output).trim();
  try { return JSON.parse(text); } catch { /* CLI 22.6 logs env loading before some JSON results. */ }
  // Accept a complete terminal JSON value after informational lines. Never
  // include environment output in an error or guess when the JSON is malformed.
  const candidates = [];
  for (const match of text.matchAll(/^[\[{]/gm)) {
    try { candidates.push(JSON.parse(text.slice(match.index))); } catch { /* not a complete JSON value */ }
  }
  if (candidates.length !== 1) throw new Error('EAS did not return one complete JSON result.');
  return candidates[0];
}

function validateBuild(build, baseline) {
  if (build.id !== baseline.buildId || build.app?.id !== baseline.projectId
    || build.platform !== 'IOS' || build.status !== 'FINISHED'
    || build.appBuildVersion !== baseline.buildNumber
    || build.runtime?.version !== baseline.runtime
    || build.updateChannel?.name !== baseline.channel
    || build.fingerprint?.hash !== baseline.fingerprint) {
    throw new Error('Installed iOS baseline does not match EAS build metadata. Review the baseline before releasing.');
  }
}

function validateFingerprint({ hash, baseline, sourceRoot, readFile = fs.readFileSync }) {
  if (!/^[a-f0-9]{40}$/.test(hash || '')) throw new Error('Missing or invalid native fingerprint; refusing publication.');
  if (hash === baseline.fingerprint) return { status: 'exact', fingerprint: hash, buildFingerprint: baseline.fingerprint };
  const reviewed = baseline.reviewedOptionalDelta;
  if (!reviewed || hash !== reviewed.fingerprint || !Object.keys(reviewed.requiredSources || {}).length) {
    throw new Error(`Unreviewed native fingerprint ${hash}; expected build ${baseline.fingerprint}. Compare fingerprint hashes and review the native change before any upload.`);
  }
  for (const [file, expected] of Object.entries(reviewed.requiredSources)) {
    if (!file.startsWith('client/') || file.includes('..') || file.includes('\\')) throw new Error('Invalid compatibility source path.');
    if (normalizedHash(readFile(path.join(sourceRoot, file))) !== expected) {
      throw new Error(`Optional-native compatibility review is stale: ${file} changed. Recheck the missing-module path before release.`);
    }
  }
  return { status: 'reviewed-optional-module', fingerprint: hash, buildFingerprint: baseline.fingerprint,
    module: reviewed.module, review: reviewed.review, nativeFeatureEnabled: false };
}

function previewNativeMetadata(channel, updateId) {
  const found = [];
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (value.id === updateId && value.fingerprint) found.push(value);
    Object.values(value).forEach(visit);
  }
  visit(channel);
  if (found.length !== 1) throw new Error('Expected exactly one candidate fingerprint in EAS channel metadata.');
  const item = found[0];
  if (item.environment !== 'production') throw new Error('Candidate fingerprint was not generated with the production environment.');
  return item;
}

function verifyBuild({ runEas, baseline }) {
  const build = parseEasJson(runEas(['build:view', baseline.buildId, '--json']));
  validateBuild(build, baseline);
  return build;
}

function verifyLocalNative({ runEas, baseline, sourceRoot }) {
  verifyBuild({ runEas, baseline });
  // CLI 22.6.0 incorrectly treats mixed --build-id/--update-id comparisons as
  // update-vs-local. Generate explicitly; never use that ambiguous command.
  const generated = parseEasJson(runEas(['fingerprint:generate', '--platform', 'ios', '--environment', 'production', '--json', '--non-interactive']));
  return validateFingerprint({ hash: generated.hash, baseline, sourceRoot });
}

function verifyPreviewNative({ runEas, baseline, sourceRoot, update }) {
  verifyBuild({ runEas, baseline });
  const channel = parseEasJson(runEas(['channel:view', 'staging', '--json']));
  const metadata = previewNativeMetadata(channel, update.id);
  if (metadata.group !== update.group) throw new Error('Candidate fingerprint group mismatch.');
  return validateFingerprint({ hash: metadata.fingerprint.hash, baseline, sourceRoot });
}

module.exports = { readBaseline, normalizedHash, parseEasJson, validateBuild, validateFingerprint,
  previewNativeMetadata, verifyBuild, verifyLocalNative, verifyPreviewNative };
