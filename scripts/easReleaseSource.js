'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { validateRootConfigFiles } = require('./easProductionPreflight');

function git(repoRoot, args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 }).trim();
}

const digest = value => crypto.createHash('sha256').update(value).digest('hex');

function dependencyLockDigest(root) {
  return digest(JSON.stringify(['client/package-lock.json', 'client/node_modules/.package-lock.json'].map(file => {
    const target = path.join(root, file);
    return [file, fs.existsSync(target) ? fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n') : null];
  })));
}

function reuseSource({ repoRoot, baseline, recordPath }) {
  const releases = path.join(fs.realpathSync(repoRoot), '.codex_tmp/releases');
  const absolute = path.resolve(repoRoot, recordPath);
  if (path.dirname(absolute) !== releases || path.extname(absolute) !== '.json'
    || fs.realpathSync(absolute) !== absolute) throw new Error('Source record must be a regular file in this repository\'s release directory.');
  const record = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  if (record.version !== 1 || record.repoRoot !== fs.realpathSync(repoRoot)
    || record.sourceRoot + '.json' !== absolute
    || fs.realpathSync(record.sourceRoot) !== record.sourceRoot) throw new Error('Source record does not belong to this repository/archive.');
  if (record.baselineDigest !== digest(JSON.stringify(baseline))) throw new Error('Installed native baseline changed; prepare a new source archive.');
  const dependencies = path.join(record.sourceRoot, 'client/node_modules');
  if ((baseline.dependencyLayout || 'junction') === 'local-copy' && fs.lstatSync(dependencies).isSymbolicLink()) {
    throw new Error('Archived dependencies must retain the installed build\'s local-copy layout.');
  }
  // Metadata rules come from the reviewed baseline, never from the reusable receipt.
  const source = { ...record, metadataCrlfSha1: baseline.metadataCrlfSha1,
    metadataLfSha1: baseline.metadataLfSha1 || {}, recordPath: absolute };
  verifySource(source);
  console.error('[EAS source] Reusing verified archive; dependency copy skipped.');
  return source;
}

function nativeMetadataBytes(bytes, expectedSha1, file, lineEnding = 'crlf') {
  if (!['lf', 'crlf'].includes(lineEnding)) throw new Error('Unsupported metadata line ending.');
  const text = bytes.toString('utf8');
  if (!Buffer.from(text).equals(bytes)) throw new Error(`Non-text native metadata: ${file}`);
  const normalized = Buffer.from(text.replace(/\r?\n/g, lineEnding === 'lf' ? '\n' : '\r\n'));
  if (crypto.createHash('sha1').update(normalized).digest('hex') !== expectedSha1) {
    throw new Error(`Native metadata content changed: ${file}. Review the installed-build baseline; do not normalize away a content change.`);
  }
  return normalized;
}

function verifySource(record) {
  const { repoRoot, sourceRoot, commit, metadataCrlfSha1, metadataLfSha1 = {} } = record;
  if (git(repoRoot, ['rev-parse', 'HEAD']) !== commit
    || git(repoRoot, ['status', '--porcelain=v1', '--untracked-files=no'])) {
    throw new Error('Tracked source changed during release preparation.');
  }
  if (record.version === 1 && (!record.dependencyLockDigest
    || dependencyLockDigest(repoRoot) !== record.dependencyLockDigest
    || dependencyLockDigest(sourceRoot) !== record.dependencyLockDigest)) {
    throw new Error('Dependency locks changed since source preparation.');
  }
  validateRootConfigFiles(sourceRoot);
  const rows = git(repoRoot, ['ls-tree', '-rz', '--full-tree', commit]).split('\0').filter(Boolean);
  for (const row of rows) {
    const [meta, file] = row.split('\t');
    const [mode, type, blob] = meta.split(' ');
    if (type !== 'blob' || !['100644', '100755'].includes(mode)) throw new Error(`Unsupported archive entry: ${file}`);
    const absolute = path.join(sourceRoot, file);
    // Type-check and read the same open descriptor, avoiding a check/open race.
    // O_NOFOLLOW additionally rejects links on platforms supporting that flag.
    const descriptor = fs.openSync(absolute, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    let bytes;
    try {
      if (!fs.fstatSync(descriptor).isFile()) throw new Error(`Archived entry is not a regular file: ${file}`);
      bytes = fs.readFileSync(descriptor);
    } finally { fs.closeSync(descriptor); }
    if (metadataCrlfSha1[file] || metadataLfSha1[file]) {
      const expected = nativeMetadataBytes(bytes, metadataLfSha1[file] || metadataCrlfSha1[file], file, metadataLfSha1[file] ? 'lf' : 'crlf');
      if (!bytes.equals(expected)) throw new Error(`Native metadata line endings changed: ${file}`);
      bytes = Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
    }
    const blobHash = value => crypto.createHash('sha1').update(`blob ${value.length}\0`).update(value).digest('hex');
    if (blobHash(bytes) !== blob) {
      // Git archive applies checkout line endings. Accept that transformation
      // only for valid UTF-8 text, never for binary data or changed content.
      const text = bytes.toString('utf8');
      if (!Buffer.from(text).equals(bytes) || blobHash(Buffer.from(text.replace(/\r\n/g, '\n'))) !== blob) {
        throw new Error(`Archived source mismatch: ${file}`);
      }
    }
  }
  return { commit, trackedFiles: rows.length };
}

function prepareSource({ repoRoot, baseline, sourceRecord }) {
  repoRoot = fs.realpathSync(repoRoot);
  if (sourceRecord) return reuseSource({ repoRoot, baseline, recordPath: sourceRecord });
  const started = Date.now();
  const dependencyLayout = baseline.dependencyLayout || 'junction';
  if (!['junction', 'local-copy'].includes(dependencyLayout)) throw new Error('Unsupported release dependency layout.');
  const metadataLfSha1 = baseline.metadataLfSha1 || {};
  if (Object.keys(metadataLfSha1).some(file => baseline.metadataCrlfSha1[file])) throw new Error('Conflicting metadata line endings.');
  const commit = git(repoRoot, ['rev-parse', 'HEAD']);
  if (git(repoRoot, ['status', '--porcelain=v1', '--untracked-files=no'])) throw new Error('Commit tracked changes before preparing a release.');
  // Stable depth also preserves the dependency paths recorded by the installed
  // build's fingerprint. This is a Git archive, never another checkout/worktree.
  const releases = path.join(repoRoot, '.codex_tmp/releases');
  fs.mkdirSync(releases, { recursive: true });
  const sourceRoot = fs.mkdtempSync(path.join(releases, `${baseline.platform || 'ios'}-${commit.slice(0, 12)}-`));
  const tarPath = sourceRoot + '.tar';
  // Match this installed Windows-source baseline independently of machine-local
  // Git settings. Do not change global/local Git config or the user's checkout.
  execFileSync('git', ['-c', 'core.autocrlf=true', '-c', 'core.eol=crlf', 'archive', '--format=tar', '--output=' + tarPath, commit], { cwd: repoRoot, windowsHide: true });
  execFileSync('tar', ['-xf', tarPath, '-C', sourceRoot], { windowsHide: true });
  validateRootConfigFiles(sourceRoot);
  for (const [file, hash] of Object.entries({ ...baseline.metadataCrlfSha1, ...metadataLfSha1 })) {
    if (!['client/.gitignore', 'client/eas.json', 'client/GoogleService-Info.plist'].includes(file)) {
      throw new Error(`Unreviewed metadata normalization path: ${file}`);
    }
    const target = path.join(sourceRoot, file);
    fs.writeFileSync(target, nativeMetadataBytes(fs.readFileSync(target), hash, file, metadataLfSha1[file] ? 'lf' : 'crlf'));
  }
  const dependencies = path.join(repoRoot, 'client/node_modules');
  const archivedDependencies = path.join(sourceRoot, 'client/node_modules');
  // Build 34 resolved packages within client/. A junction changes their real paths,
  // autolinking metadata and fingerprint even when dependency bytes are identical.
  if (dependencyLayout === 'local-copy') {
    console.error('[EAS source] Preparing dependency copy once for this release.');
    fs.cpSync(dependencies, archivedDependencies, { recursive: true, dereference: true, errorOnExist: true, force: false });
  }
  else fs.symlinkSync(dependencies, archivedDependencies, process.platform === 'win32' ? 'junction' : 'dir');
  const record = { version: 1, repoRoot, sourceRoot, commit,
    baselineDigest: digest(JSON.stringify(baseline)), dependencyLockDigest: dependencyLockDigest(repoRoot),
    metadataCrlfSha1: baseline.metadataCrlfSha1, metadataLfSha1 };
  const recordPath = sourceRoot + '.json';
  fs.writeFileSync(recordPath, JSON.stringify(record, null, 2));
  verifySource(record);
  console.error(`[EAS source] Prepared and verified in ${Math.round((Date.now() - started) / 1000)}s.`);
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
      // CLI 22.6's update fingerprint path omits server env. Keep this public
      // identity available when app.config.js scopes production app links.
      EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'planli-f0b12',
      NODE_OPTIONS: `--max-old-space-size=2048 --require ${JSON.stringify(path.join(__dirname, 'easArchiveHook.js').replace(/\\/g, '/'))}`,
      PATH: path.join(source.repoRoot, 'client/node_modules/.bin') + path.delimiter + process.env.PATH };
    // Argument array, without a shell: spaces and punctuation in messages are data.
    const started = Date.now();
    const label = args[0] || 'command'; // Never print environment, credentials or argument values.
    console.error(`[EAS] ${label} started.`);
    try {
      return execFileSync(process.execPath, [entry, ...args], { cwd: path.join(source.sourceRoot, 'client'),
        windowsHide: true, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'inherit'], env });
    } finally { console.error(`[EAS] ${label} finished in ${Math.round((Date.now() - started) / 1000)}s.`); }
  };
}

module.exports = { git, nativeMetadataBytes, verifySource, prepareSource, createEasRunner };
