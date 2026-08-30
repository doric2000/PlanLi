#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const TARGET_DIRECTORIES = Object.freeze([
  'functions/.budget-taxonomy-v5',
  'functions/.canonical-media-migration',
  'functions/.database-canonical-migration',
  'functions/.destination-images',
  'functions/.media-migration-state',
  'functions/.prelaunch-reset',
  'functions/.public-profiles-backfill',
  'functions/.rating-removal',
  'functions/.recommendation-catalog-v1',
  'functions/.recommendation-curation',
  'functions/.storage-eu-migration',
]);
const TEXT_EXTENSIONS = new Set(['.js', '.json', '.jsonl', '.log', '.tmp', '.txt']);
const CREDENTIAL_RULES = Object.freeze([
  { kind: 'gcp-api-key', pattern: /AIza[0-9A-Za-z_-]{35}/g },
  { kind: 'private-key', pattern: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC )?PRIVATE KEY-----/g },
  { kind: 'firebase-refresh-token', pattern: /\b1\/[0-9A-Za-z_-]{20,}/g },
  { kind: 'github-token', pattern: /\bgh[pousr]_[0-9A-Za-z]{30,}/g },
  { kind: 'aws-access-key', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { kind: 'openai-api-key', pattern: /\bsk-(?:proj-)?[0-9A-Za-z_-]{20,}/g },
]);

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sanitizeText(text) {
  let output = String(text);
  const findings = [];
  for (const { kind, pattern } of CREDENTIAL_RULES) {
    const matches = output.match(pattern) || [];
    if (!matches.length) continue;
    findings.push({ kind, count: matches.length });
    output = output.replace(pattern, `[REDACTED:${kind}]`);
  }
  return { output, findings };
}

function collectTextFiles(repoRoot) {
  const files = [];
  for (const relativeDirectory of TARGET_DIRECTORIES) {
    const directory = path.resolve(repoRoot, relativeDirectory);
    const expectedPrefix = `${path.resolve(repoRoot, 'functions')}${path.sep}`;
    if (!directory.startsWith(expectedPrefix)) throw new Error('Unsafe migration artifact directory.');
    if (!fs.existsSync(directory)) continue;
    const pending = [directory];
    while (pending.length) {
      const current = pending.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const absolute = path.join(current, entry.name);
        if (entry.isDirectory()) pending.push(absolute);
        else if (entry.isFile() && TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
          files.push(absolute);
        }
      }
    }
  }
  return files.sort();
}

function buildManifest(repoRoot = REPO_ROOT) {
  const files = [];
  for (const absolute of collectTextFiles(repoRoot)) {
    const before = fs.readFileSync(absolute);
    const result = sanitizeText(before.toString('utf8'));
    if (!result.findings.length) continue;
    files.push({
      path: path.relative(repoRoot, absolute).replace(/\\/g, '/'),
      beforeSha256: sha256(before),
      afterSha256: sha256(Buffer.from(result.output, 'utf8')),
      findings: result.findings,
    });
  }
  const manifest = { files };
  return { ...manifest, manifestSha256: sha256(JSON.stringify(manifest)) };
}

function run({ apply = false, expectedManifestHash = '', repoRoot = REPO_ROOT } = {}) {
  const resolvedRoot = path.resolve(repoRoot);
  const manifest = buildManifest(resolvedRoot);
  if (apply && !expectedManifestHash) throw new Error('Apply requires --manifest-hash.');
  if (apply && expectedManifestHash !== manifest.manifestSha256) {
    throw new Error('Manifest hash mismatch; run a new dry-run and review it.');
  }
  if (apply) {
    for (const entry of manifest.files) {
      const absolute = path.resolve(resolvedRoot, entry.path);
      const before = fs.readFileSync(absolute);
      if (sha256(before) !== entry.beforeSha256) throw new Error(`Artifact changed before apply: ${entry.path}`);
      const result = sanitizeText(before.toString('utf8'));
      const temporary = `${absolute}.sanitize-${process.pid}`;
      try {
        fs.writeFileSync(temporary, result.output, { encoding: 'utf8', flag: 'wx' });
        if (sha256(fs.readFileSync(temporary)) !== entry.afterSha256) {
          throw new Error(`Sanitized artifact hash mismatch: ${entry.path}`);
        }
        fs.renameSync(temporary, absolute);
      } finally {
        if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true });
      }
    }
    const remaining = buildManifest(resolvedRoot);
    if (remaining.files.length) throw new Error('Credential patterns remain after sanitization.');
  }
  return { mode: apply ? 'apply' : 'dry-run', ...manifest };
}

function parseArgs(argv) {
  const options = { apply: false, expectedManifestHash: '' };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--apply') options.apply = true;
    else if (argv[index] === '--manifest-hash') {
      options.expectedManifestHash = String(argv[index + 1] || '').trim();
      index += 1;
    } else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  return options;
}

if (require.main === module) {
  try {
    const result = run(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.mode === 'dry-run' && result.files.length) {
      process.stdout.write('No file changed. Re-run with --apply and the exact manifest hash.\n');
    }
  } catch (error) {
    process.stderr.write(`Local migration-artifact cleanup failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  buildManifest,
  parseArgs,
  run,
  sanitizeText,
};
