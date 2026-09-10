'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { runPreflight } = require('./easProductionPreflight');
const { prepareSource, createEasRunner, verifySource } = require('./easReleaseSource');
const { readBaseline, verifyLocalNative, verifyPreviewNative } = require('./easNativeCompatibility');
const { validateEasIdentity, validateEasVersion, validateMessage, validateReleaseConfiguration,
  validatePreviewUpdates, parseRepublishedGroupId } = require('./easProductionUpdate');
const { verifyProductionUpdateArtifact } = require('./easUpdateArtifact');

function parseArgs(argv) {
  const args = { apply: false, message: '' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--apply') args.apply = true;
    else if (argv[i] === '--message') args.message = String(argv[++i] || '');
    else throw new Error(`Unknown candidate argument: ${argv[i]}`);
  }
  return args;
}

// Dependencies are injected for sequencing tests. A failed native check must
// never reach `eas update`, even if publication was explicitly requested.
async function runCandidate({ repoRoot, args }, dependencies = {}) {
  const prepare = dependencies.prepareSource || prepareSource;
  const runner = dependencies.createEasRunner || createEasRunner;
  const localCheck = dependencies.verifyLocalNative || verifyLocalNative;
  const preflight = dependencies.runPreflight || runPreflight;
  const baseline = readBaseline(repoRoot);
  if (args.apply) {
    validateMessage(args.message);
    preflight({ repoRoot, archive: true });
  }
  const source = prepare({ repoRoot, baseline });
  const app = JSON.parse(fs.readFileSync(path.join(source.sourceRoot, 'client/app.json'), 'utf8')).expo;
  const eas = JSON.parse(fs.readFileSync(path.join(source.sourceRoot, 'client/eas.json'), 'utf8'));
  validateReleaseConfiguration({ app, eas });
  const runEas = runner(source);
  validateEasVersion(runEas(['--version']));
  validateEasIdentity(runEas(['whoami']));
  const native = localCheck({ runEas, baseline, sourceRoot: source.sourceRoot });
  const proofPath = source.sourceRoot + '-native-preflight.json';
  fs.writeFileSync(proofPath, JSON.stringify({ ...native, sourceCommit: source.commit, verifiedAt: new Date().toISOString() }, null, 2));
  if (!args.apply) return { apply: false, sourceCommit: source.commit, native, proofPath };
  // Recheck main/lineage after the potentially slow fingerprint computation.
  preflight({ repoRoot, archive: true });
  (dependencies.verifySource || verifySource)(source);
  const output = runEas(['update', '--branch', 'staging', '--platform', 'ios', '--environment', 'production',
    '--message', args.message, '--emit-metadata', '--non-interactive']);
  fs.writeFileSync(source.sourceRoot + '-publish.log', output);
  const groupId = parseRepublishedGroupId(output);
  const updates = JSON.parse(runEas(['update:view', groupId, '--json']));
  validatePreviewUpdates({ value: updates, groupId, head: source.commit });
  const publishedNative = (dependencies.verifyPreviewNative || verifyPreviewNative)({ runEas, baseline, sourceRoot: source.sourceRoot, update: updates[0] });
  if (publishedNative.fingerprint !== native.fingerprint) throw new Error('Fingerprint changed between preflight and candidate publication; do not promote.');
  const artifact = await (dependencies.verifyArtifact || verifyProductionUpdateArtifact)(updates, groupId);
  const result = { apply: true, sourceCommit: source.commit, groupId, native, artifact, proofPath };
  fs.writeFileSync(source.sourceRoot + '-candidate.json', JSON.stringify(result, null, 2));
  return result;
}

if (require.main === module) runCandidate({ repoRoot: path.resolve(__dirname, '..'), args: parseArgs(process.argv.slice(2)) })
  .then(result => console.log(JSON.stringify(result, null, 2)))
  .catch(error => { console.error(`EAS candidate preflight failed: ${error.message}`); process.exitCode = 1; });

module.exports = { parseArgs, runCandidate };
