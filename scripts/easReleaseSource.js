'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { validateRootConfigFiles } = require('./easProductionPreflight');

function git(repoRoot, args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 }).trim();
}

function nativeMetadataBytes(bytes, expectedSha1, file) {
  const text = bytes.toString('utf8');
  if (!Buffer.from(text).equals(bytes)) throw new Error(`Non-text native metadata: ${file}`);
  const normalized = Buffer.from(text.replace(/\r?\n/g, '\r\n'));
  if (crypto.createHash('sha1').update(normalized).digest('hex') !== expectedSha1) {
    throw new Error(`Native metadata content changed: ${file}. Review the installed-build baseline; do not normalize away a content change.`);
  }
  return normalized;
}

function verifySource(record) {
  const { repoRoot, sourceRoot, commit, metadataCrlfSha1 } = record;
  if (git(repoRoot, ['rev-parse', 'HEAD']) !== commit
    || git(repoRoot, ['status', '--porcelain=v1', '--untracked-files=no'])) {
    throw new Error('Tracked source changed during release preparation.');
  }
  validateRootConfigFiles(sourceRoot);
  const rows = git(repoRoot, ['ls-tree', '-rz', '--full-tree', commit]).split('\0').filter(Boolean);
  for (const row of rows) {
    const [meta, file] = row.split('\t');
    const [mode, type, blob] = meta.split(' ');
    if (type !== 'blob' || !['100644', '100755'].includes(mode)) throw new Error(`Unsupported archive entry: ${file}`);
    const absolute = path.join(sourceRoot, file);
    if (fs.lstatSync(absolute).isSymbolicLink()) throw new Error(`Archived file became a link: ${file}`);
    let bytes = fs.readFileSync(absolute);
    if (metadataCrlfSha1[file]) {
      const expected = nativeMetadataBytes(bytes, metadataCrlfSha1[file], file);
      if (!bytes.equals(expected)) throw new Error(`Native metadata line endings changed: ${file}`);
      bytes = Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
    }
    const actual = crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    if (actual !== blob) throw new Error(`Archived source mismatch: ${file}`);
  }
  return { commit, trackedFiles: rows.length };
}

function prepareSource({ repoRoot, baseline }) {
  const commit = git(repoRoot, ['rev-parse', 'HEAD']);
  if (git(repoRoot, ['status', '--porcelain=v1', '--untracked-files=no'])) throw new Error('Commit tracked changes before preparing a release.');
  // Stable depth also preserves the dependency paths recorded by the installed
  // build's fingerprint. This is a Git archive, never another checkout/worktree.
  const releases = path.join(repoRoot, '.codex_tmp/releases');
  fs.mkdirSync(releases, { recursive: true });
  const sourceRoot = fs.mkdtempSync(path.join(releases, `ios-${commit.slice(0, 12)}-`));
  const tarPath = sourceRoot + '.tar';
  execFileSync('git', ['archive', '--format=tar', '--output=' + tarPath, commit], { cwd: repoRoot, windowsHide: true });
  execFileSync('tar', ['-xf', tarPath, '-C', sourceRoot], { windowsHide: true });
  validateRootConfigFiles(sourceRoot);
  for (const [file, hash] of Object.entries(baseline.metadataCrlfSha1)) {
    if (!['client/.gitignore', 'client/eas.json', 'client/GoogleService-Info.plist'].includes(file)) {
      throw new Error(`Unreviewed metadata normalization path: ${file}`);
    }
    const target = path.join(sourceRoot, file);
    fs.writeFileSync(target, nativeMetadataBytes(fs.readFileSync(target), hash, file));
  }
  fs.symlinkSync(path.join(repoRoot, 'client/node_modules'), path.join(sourceRoot, 'client/node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  const record = { repoRoot, sourceRoot, commit, metadataCrlfSha1: baseline.metadataCrlfSha1 };
  const recordPath = sourceRoot + '.json';
  fs.writeFileSync(recordPath, JSON.stringify(record, null, 2));
  verifySource(record);
  return { ...record, recordPath };
}

function resolveEasEntry() {
  const globalModules = execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['root', '-g'], {
    encoding: 'utf8', windowsHide: true, shell: process.platform === 'win32',
  }).trim();
  const entry = path.join(globalModules, 'eas-cli/bin/run');
  if (!fs.existsSync(entry)) throw new Error('Install the repository-pinned global EAS CLI before releasing.');
  return entry;
}

function createEasRunner(source, { entry = resolveEasEntry() } = {}) {
  const cliRoot = path.resolve(entry, '../..');
  const version = JSON.parse(fs.readFileSync(path.join(cliRoot, 'package.json'), 'utf8')).version;
  if (version !== '22.6.0') throw new Error(`Expected the pinned EAS CLI 22.6.0; found ${version}`);
  return (args) => {
    if (process.env.EAS_SKIP_AUTO_FINGERPRINT) throw new Error('Fingerprint skipping is not allowed in the guarded release workflow.');
    verifySource(source);
    const env = { ...process.env, EAS_NO_VCS: '1', EAS_PROJECT_ROOT: source.sourceRoot,
      PLANLI_EAS_SOURCE_RECORD: source.recordPath, PLANLI_EAS_CLI_ROOT: cliRoot,
      PLANLI_ENV: 'production', EXPO_NO_DOTENV: '1', CI: '1',
      NODE_OPTIONS: `--max-old-space-size=2048 --require ${JSON.stringify(path.join(__dirname, 'easArchiveHook.js').replace(/\\/g, '/'))}`,
      PATH: path.join(source.repoRoot, 'client/node_modules/.bin') + path.delimiter + process.env.PATH };
    // Argument array, without a shell: spaces and punctuation in messages are data.
    return execFileSync(process.execPath, [entry, ...args], { cwd: path.join(source.sourceRoot, 'client'),
      windowsHide: true, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'inherit'], env });
  };
}

module.exports = { git, nativeMetadataBytes, verifySource, prepareSource, createEasRunner };
