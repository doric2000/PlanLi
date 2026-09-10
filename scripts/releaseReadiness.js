'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { createPlan, changedFilesFromGit, runPlan, runCommand } = require('./validationPlan');
const { isNativeReleaseInput } = require('./nativeReleaseInputs');

function releasePlan(files, { kind = 'ota', platform = 'ios', root = path.resolve(__dirname, '..') } = {}) {
  if (!['ota', 'build', 'full'].includes(kind)) throw new Error('kind must be ota, build or full');
  if (!['ios', 'android'].includes(platform)) throw new Error('platform must be ios or android');
  const nativeChanges = files.filter(isNativeReleaseInput);
  if (kind === 'ota' && nativeChanges.length) {
    throw new Error(`Native inputs changed: ${nativeChanges.join(', ')}. Review compatibility against the installed binary before publishing an OTA; build validation alone is not proof of compatibility.`);
  }
  const plan = createPlan(files, root);
  plan.client = true;
  plan.adminExport = false;
  // EAS Update exports the candidate once; EAS Build compiles its own bundle.
  plan.nativeExport = false;
  plan.clientAudit = false; // Dedicated dependency policy owns this check.
  if (kind === 'full') {
    plan.clientFull = true;
    plan.functions = true;
    plan.functionsFull = true;
    plan.rules = true;
  }
  return { plan, kind, platform, checkNative: kind !== 'ota', backend: plan.functions || plan.rules };
}

function main() {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--kind', '--platform', '--base', '--scope'].includes(args[i]) || !args[i + 1]) throw new Error('Usage: --kind ota|build|full --platform ios|android --base <deployed-commit> [--scope plan|client|backend|all]');
    options[args[i].slice(2)] = args[i + 1];
  }
  if (!options.base) throw new Error('An explicit deployed source commit is required; main...HEAD is empty after a merge');
  const scope = options.scope || 'all';
  if (!['plan', 'client', 'backend', 'all'].includes(scope)) throw new Error('Invalid release validation scope');
  const root = path.resolve(__dirname, '..');
  const files = changedFilesFromGit({ base: options.base, head: 'HEAD', includeWorktree: !process.env.CI }, root);
  const release = releasePlan(files, { ...options, root });
  if (scope === 'plan') {
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT,
      `backend=${Boolean(release.backend)}\nrules=${Boolean(release.plan.rules)}\n`);
    console.log(JSON.stringify(release));
    return;
  }
  if (scope === 'all' || scope === 'client') runPlan(release.plan, 'client', root);
  if (scope === 'all' || scope === 'backend') {
    runPlan(release.plan, 'functions', root);
    runPlan(release.plan, 'rules', root);
  }
  const client = path.join(root, 'client');
  if (release.checkNative && scope !== 'backend') {
    if (release.platform === 'ios') {
      runCommand('ios-build-readiness', process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'verify:ios-build-readiness'], client, root);
    } else {
      const cli = require.resolve('expo/bin/cli', { paths: [client] });
      runCommand('android-config-verify', process.execPath, [cli, 'config', '--type', 'public'], client, root);
      runCommand('android-package-verify', process.execPath, [cli, 'install', '--check'], client, root);
    }
  }
  console.log(`Release readiness: ${release.kind}/${release.platform}; backend=${release.backend ? 'affected checks or explicit full release' : 'not required'}`);
}

if (require.main === module) main();
module.exports = { releasePlan };
