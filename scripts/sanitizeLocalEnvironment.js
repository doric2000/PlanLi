#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const TARGET_PATH = path.join(REPO_ROOT, 'client', '.env');
const DEPRECATED_VARIABLES = new Set([
  'EXPO_PUBLIC_GOOGLE_MAPS_KEY',
  'EXPO_PUBLIC_WEATHER_API_KEY',
]);

function sanitizeEnvironmentText(text) {
  const newline = String(text).includes('\r\n') ? '\r\n' : '\n';
  const terminalNewline = String(text).endsWith('\n');
  const removed = [];
  const lines = String(text).split(/\r?\n/).filter((line, index, entries) => {
    if (index === entries.length - 1 && line === '' && terminalNewline) return false;
    const name = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1];
    if (!DEPRECATED_VARIABLES.has(name)) return true;
    removed.push(name);
    return false;
  });
  return {
    output: `${lines.join(newline)}${terminalNewline ? newline : ''}`,
    removed: [...new Set(removed)].sort(),
  };
}

function run({ apply = false, targetPath = TARGET_PATH } = {}) {
  const resolvedTarget = path.resolve(targetPath);
  if (resolvedTarget !== TARGET_PATH) throw new Error('Refusing to sanitize any path except client/.env.');
  if (!fs.existsSync(resolvedTarget)) {
    return { mode: apply ? 'apply' : 'dry-run', changed: false, removed: [], target: 'client/.env' };
  }
  const before = fs.readFileSync(resolvedTarget, 'utf8');
  const result = sanitizeEnvironmentText(before);
  if (apply && result.output !== before) {
    const temporaryPath = `${resolvedTarget}.sanitize-${process.pid}`;
    try {
      fs.writeFileSync(temporaryPath, result.output, { encoding: 'utf8', flag: 'wx' });
      fs.renameSync(temporaryPath, resolvedTarget);
    } finally {
      if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath, { force: true });
    }
    const verified = sanitizeEnvironmentText(fs.readFileSync(resolvedTarget, 'utf8'));
    if (verified.removed.length) throw new Error('Post-write verification found deprecated variables.');
  }
  return {
    mode: apply ? 'apply' : 'dry-run',
    changed: result.output !== before,
    removed: result.removed,
    target: 'client/.env',
  };
}

if (require.main === module) {
  try {
    const unknown = process.argv.slice(2).filter((value) => value !== '--apply');
    if (unknown.length) throw new Error(`Unknown argument: ${unknown[0]}`);
    const result = run({ apply: process.argv.includes('--apply') });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.mode === 'dry-run' && result.changed) {
      process.stdout.write('No file changed. Re-run with --apply after reviewing the variable names.\n');
    }
  } catch (error) {
    process.stderr.write(`Local environment cleanup failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { DEPRECATED_VARIABLES, run, sanitizeEnvironmentText };
