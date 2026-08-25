const { execFileSync, spawnSync } = require('node:child_process');
const path = require('node:path');

const EAS_CLI_VERSION = '18.0.1';

function fail(message) {
  const error = new Error(message);
  error.code = 'EAS_PRODUCTION_PREFLIGHT_FAILED';
  throw error;
}

function parseArgs(argv) {
  const args = { deployedCommit: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--deployed-commit') {
      args.deployedCommit = String(argv[index + 1] || '').trim();
      index += 1;
    } else {
      fail(`Unknown argument: ${value}`);
    }
  }
  return args;
}

function validateRepositoryState({ branch, head, originMain, status }) {
  if (branch !== 'main') fail(`Production updates must run from main, not ${branch || 'detached HEAD'}.`);
  if (status.trim()) fail('Production updates require a completely clean checkout, including untracked files.');
  if (head !== originMain) fail('Local main must exactly match origin/main before publishing.');
}

function validateDeployedCommit({ deployedCommit, head, isAncestor }) {
  if (!/^[0-9a-f]{7,40}$/i.test(deployedCommit || '')) {
    fail('The current production update does not expose one valid Git commit.');
  }
  if (!isAncestor) {
    fail(
      `Refusing to replace production: current update commit ${deployedCommit} is not an ancestor of candidate ${head}. ` +
      'Merge the deployed work into main before publishing.'
    );
  }
}

function git(repoRoot, args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
}

function runEas(clientRoot, args) {
  const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  return execFileSync(executable, ['-y', `eas-cli@${EAS_CLI_VERSION}`, ...args], {
    cwd: clientRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}

function currentProductionCommit(clientRoot) {
  const branch = JSON.parse(runEas(clientRoot, [
    'update:list', '--branch', 'production', '--limit', '1', '--json', '--non-interactive',
  ]));
  const groupId = branch?.currentPage?.[0]?.group;
  if (!groupId) fail('No current production update group was found.');
  const updates = JSON.parse(runEas(clientRoot, ['update:view', groupId, '--json']));
  const commits = [...new Set((Array.isArray(updates) ? updates : [])
    .map((update) => String(update?.gitCommitHash || '').trim())
    .filter(Boolean))];
  if (commits.length !== 1) fail(`Production group ${groupId} does not map to one Git commit.`);
  return { deployedCommit: commits[0], groupId };
}

function runPreflight({ repoRoot, deployedCommit = '' }) {
  git(repoRoot, ['fetch', '--quiet', 'origin', 'main']);
  const state = {
    branch: git(repoRoot, ['branch', '--show-current']),
    head: git(repoRoot, ['rev-parse', 'HEAD']),
    originMain: git(repoRoot, ['rev-parse', 'origin/main']),
    status: git(repoRoot, ['status', '--porcelain=v1', '--untracked-files=all']),
  };
  validateRepositoryState(state);

  const production = deployedCommit
    ? { deployedCommit, groupId: 'provided-by-release-workflow' }
    : currentProductionCommit(path.join(repoRoot, 'client'));
  const commitExists = spawnSync('git', ['cat-file', '-e', `${production.deployedCommit}^{commit}`], {
    cwd: repoRoot,
    stdio: 'ignore',
  }).status === 0;
  if (!commitExists) fail(`Production commit ${production.deployedCommit} is unavailable locally after fetching main.`);
  const isAncestor = spawnSync('git', [
    'merge-base', '--is-ancestor', production.deployedCommit, state.head,
  ], { cwd: repoRoot, stdio: 'ignore' }).status === 0;
  validateDeployedCommit({ deployedCommit: production.deployedCommit, head: state.head, isAncestor });
  return { ...state, ...production };
}

if (require.main === module) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = runPreflight({ repoRoot: path.resolve(__dirname, '..'), ...args });
    process.stdout.write(
      `EAS production preflight passed: main ${result.head} contains production ${result.deployedCommit} ` +
      `(group ${result.groupId}).\n`
    );
  } catch (error) {
    process.stderr.write(`EAS production preflight failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  parseArgs,
  validateDeployedCommit,
  validateRepositoryState,
};
