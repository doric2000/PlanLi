'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function inputFiles(root, scope) {
  const inventory = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }).split('\0').filter(Boolean);
  const workspaces = scope === 'client' ? ['', 'client'] : scope === 'functions' || scope === 'rules' ? ['', 'functions'] : ['', 'client', 'functions'];
  const localInputs = [];
  for (const workspace of workspaces) {
    const directory = path.join(root, workspace);
    if (!fs.existsSync(directory)) continue;
    for (const name of fs.readdirSync(directory).filter((name) => /^\.env(?:\.|$)/.test(name))) {
      if (fs.statSync(path.join(directory, name)).isFile()) localInputs.push(path.posix.join(workspace, name));
    }
    const installed = path.posix.join(workspace, 'node_modules/.package-lock.json');
    if (fs.existsSync(path.join(root, installed))) localInputs.push(installed);
  }
  const tracked = [...new Set(inventory)].filter((file) => {
    if (/\.md$|(?:^|\/)(?:\.codex_tmp|node_modules|\.expo|\.expo-validation)\//.test(file)) return false;
    if (/^(?:scripts|shared|config|patches)\//.test(file) || !file.includes('/')) return true;
    if (scope === 'client') return file.startsWith('client/');
    if (scope === 'functions' || scope === 'rules') return file.startsWith('functions/');
    return true;
  });
  return [...new Set([...tracked, ...localInputs])].sort();
}

function signature({ root, scope, command, args, env = process.env, files = inputFiles(root, scope) }) {
  const hash = crypto.createHash('sha256');
  const selectedEnv = Object.fromEntries(Object.keys(env).sort()
    .filter((key) => /^(?:EXPO_|PLANLI_|FIREBASE_|FIRESTORE_|STORAGE_|GOOGLE_|SENTRY_|CI$|NODE_ENV$|NODE_OPTIONS$|BABEL_ENV$|JEST_|JAVA_HOME$|TZ$|LANG$|LC_)/.test(key))
    .map((key) => [key, env[key]]));
  hash.update(JSON.stringify({ version: 1, scope, command, args, node: process.version,
    platform: process.platform, arch: process.arch, env: selectedEnv }));
  for (const file of files) {
    hash.update(`\0${file}\0`);
    const absolute = path.resolve(root, file);
    hash.update(fs.existsSync(absolute) ? fs.readFileSync(absolute) : '<deleted>');
  }
  return hash.digest('hex');
}

function reusableReceipt(file, expected) {
  try {
    const receipt = JSON.parse(fs.readFileSync(file, 'utf8'));
    return receipt.version === 1 && receipt.status === 'passed' && receipt.signature === expected
      && fs.existsSync(receipt.logPath) ? receipt : null;
  } catch { return null; }
}

function writeReceipt(file, receipt) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ version: 1, ...receipt }, null, 2));
}

module.exports = { inputFiles, signature, reusableReceipt, writeReceipt };
