#!/usr/bin/env node

const { spawn, spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const OUTPUT_ROOT = path.join(REPO_ROOT, '.codex_tmp', 'security-local');
const TOOLS_ROOT = path.join(REPO_ROOT, '.codex_tmp', 'tools');
const SEMGREP_VERSION = '1.175.0';
const GITLEAKS_VERSION = '8.30.1';
const GITLEAKS_SHA256 = 'd29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e';
const SEMGREP_TARGETS = ['functions', 'client/src', 'client/index.js', 'server', 'scripts'];
const SEMGREP_SOURCE_RE = /\.(?:cjs|mjs|js|jsx|ts|tsx|json|ya?ml)$/i;
const SEMGREP_CODE_RE = /\.(?:cjs|mjs|js|jsx|ts|tsx)$/i;
const EXCLUDED_DIRECTORIES = new Set(['.codex_tmp', '.git', '__tests__', 'node_modules']);

function progress(message) {
  process.stderr.write(`[security] ${message}\n`);
}

function fail(message) {
  const error = new Error(message);
  error.code = 'PLANLI_LOCAL_SECURITY_SCAN_FAILED';
  throw error;
}

function executable(name) {
  if (process.platform !== 'win32') return name;
  if (name === 'npm') return 'npm.cmd';
  if (['uvx', 'gh', 'curl', 'tar', 'git', 'rg'].includes(name)) return `${name}.exe`;
  return name;
}

function run(command, args, {
  cwd = REPO_ROOT,
  allowedExitCodes = [0],
  capture = false,
  timeoutMs = 15 * 60 * 1000,
  env = process.env,
} = {}) {
  const result = spawnSync(executable(command), args, {
    cwd,
    encoding: 'utf8',
    env,
    maxBuffer: 128 * 1024 * 1024,
    shell: false,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    timeout: timeoutMs,
    windowsHide: true,
  });
  if (result.error?.code === 'ETIMEDOUT') fail(`${command} exceeded ${Math.round(timeoutMs / 60000)} minutes.`);
  if (result.error) fail(`${command} could not start: ${result.error.message}`);
  if (!allowedExitCodes.includes(result.status)) {
    const detail = capture ? String(result.stderr || result.stdout || '').trim() : '';
    fail(`${command} exited with ${result.status}${detail ? `: ${detail}` : ''}`);
  }
  return result;
}

function killProcessTree(child) {
  if (!child?.pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    return;
  }
  child.kill('SIGTERM');
}

function runAsync(command, args, {
  cwd = REPO_ROOT,
  allowedExitCodes = [0],
  timeoutMs = 2 * 60 * 1000,
  env = process.env,
} = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable(command), args, {
      cwd,
      encoding: 'utf8',
      env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killProcessTree(child);
    }, timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(new Error(`${command} could not start: ${error.message}`));
    });
    child.once('close', (status) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`${command} batch exceeded ${Math.round(timeoutMs / 1000)} seconds and its process tree was stopped.`));
        return;
      }
      if (!allowedExitCodes.includes(status)) {
        reject(new Error(`${command} exited with ${status}: ${String(stderr || stdout).trim()}`));
        return;
      }
      resolve({ status, stdout, stderr });
    });
  });
}

function git(args) {
  return run('git', args, { capture: true }).stdout.trim();
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function normalize(value) {
  return String(value || '').replace(/\\/g, '/');
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function createReportDir(mode) {
  const id = `${mode}-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID()}`;
  const reportDir = path.join(OUTPUT_ROOT, id);
  fs.mkdirSync(reportDir, { recursive: true });
  return { id, reportDir };
}

function assertRepository() {
  const root = git(['rev-parse', '--show-toplevel']);
  if (path.resolve(root).toLowerCase() !== REPO_ROOT.toLowerCase()) {
    fail(`Wrong Git root: expected ${REPO_ROOT}, got ${root}.`);
  }
}

function gitleaksPaths() {
  const toolDir = path.join(TOOLS_ROOT, `gitleaks-${GITLEAKS_VERSION}`);
  return {
    archive: path.join(toolDir, `gitleaks_${GITLEAKS_VERSION}_windows_x64.zip`),
    executable: process.platform === 'win32'
      ? path.join(toolDir, 'gitleaks.exe')
      : 'gitleaks',
    toolDir,
  };
}

function bootstrapGitleaks() {
  if (process.platform !== 'win32') return 'gitleaks';
  const paths = gitleaksPaths();
  if (!fs.existsSync(paths.executable)) {
    fs.mkdirSync(paths.toolDir, { recursive: true });
    if (!fs.existsSync(paths.archive)) {
      run('curl', [
        '--fail', '--location', '--proto', '=https', '--tlsv1.2', '--output', paths.archive,
        `https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/${path.basename(paths.archive)}`,
      ], { timeoutMs: 5 * 60 * 1000 });
    }
    if (sha256File(paths.archive) !== GITLEAKS_SHA256) fail('Pinned Gitleaks archive checksum mismatch.');
    run('tar', ['-xf', paths.archive, '-C', paths.toolDir], { timeoutMs: 5 * 60 * 1000 });
  }
  return paths.executable;
}

function parseArgs(argv) {
  const args = { mode: argv[0] || 'preflight', base: '', head: '' };
  for (let index = 1; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--base' || value === '--head') {
      args[value.slice(2)] = String(argv[index + 1] || '').trim();
      index += 1;
    } else {
      fail(`Unknown argument: ${value}`);
    }
  }
  return args;
}

function resolveRevision(value, name) {
  if (!value) fail(`Missing --${name}.`);
  return git(['rev-parse', '--verify', `${value}^{commit}`]);
}

function changedTargets(base, head) {
  const baseSha = resolveRevision(base, 'base');
  const headSha = resolveRevision(head, 'head');
  const files = git(['diff', '--name-only', '--diff-filter=ACMRTUXB', baseSha, headSha])
    .split(/\r?\n/)
    .map((file) => normalize(file).trim())
    .filter((file) => file && SEMGREP_SOURCE_RE.test(file) && fs.existsSync(path.join(REPO_ROOT, file)));
  if (!files.length) fail(`No source-like files changed in ${baseSha}..${headSha}.`);
  return { baseSha, headSha, files };
}

function semgrepConfigs() {
  return [path.join(REPO_ROOT, '.semgrep', 'planli-security.yml')];
}

function collectSourceFiles(targets) {
  const files = new Set();
  function visit(absolute) {
    if (!fs.existsSync(absolute)) return;
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) return;
    if (stat.isFile()) {
      const relative = normalize(path.relative(REPO_ROOT, absolute));
      if (SEMGREP_SOURCE_RE.test(relative) && !/\.test\.(?:cjs|mjs|js|jsx|ts|tsx)$/i.test(relative)) {
        files.add(relative);
      }
      return;
    }
    if (!stat.isDirectory()) return;
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      if (entry.isDirectory() && EXCLUDED_DIRECTORIES.has(entry.name)) continue;
      visit(path.join(absolute, entry.name));
    }
  }
  for (const target of targets) visit(path.resolve(REPO_ROOT, target));
  return [...files].sort();
}

function snapshotFiles(files) {
  const hash = crypto.createHash('sha256');
  for (const file of files) {
    hash.update(file);
    hash.update('\0');
    hash.update(fs.readFileSync(path.join(REPO_ROOT, file)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function localEnvironmentFiles(root = REPO_ROOT) {
  const files = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRECTORIES.has(entry.name)) visit(path.join(directory, entry.name));
        continue;
      }
      if (!entry.isFile() || !/^\.env(?:\..+)?$/i.test(entry.name)) continue;
      files.push(normalize(path.relative(root, path.join(directory, entry.name))));
    }
  }
  visit(root);
  return files.sort();
}

function inputSinkTargets() {
  const pattern = [
    'eval\\s*\\(', 'new\\s+Function', 'child_process', '\\.exec(?:Sync)?\\s*\\(',
    'Linking\\.openURL', 'dangerouslySetInnerHTML', '\\.innerHTML', 'x-forwarded-for',
    '\\.bucket\\s*\\(\\s*\\)', 'cleanText\\s*\\(', 'new\\s+RegExp',
  ].join('|');
  const result = run('rg', [
    '-l', '--hidden', '--glob', '!**/*.test.*', '--glob', '!**/__tests__/**',
    '--glob', '!**/node_modules/**', '--glob', '!hosting/admin/**', pattern, ...SEMGREP_TARGETS,
  ], { capture: true, allowedExitCodes: [0, 1] });
  const targets = result.stdout.split(/\r?\n/).map((file) => file.trim()).filter(Boolean);
  if (!targets.length) fail('Input-sink prefilter found no files; refusing an empty scan.');
  return targets;
}

function fullScanTargets() {
  const targets = SEMGREP_TARGETS.filter((target) => fs.existsSync(path.join(REPO_ROOT, target)));
  if (!targets.length) fail('Full scan resolved no source roots.');
  return targets;
}

function batchesOf(values, size) {
  const batches = [];
  for (let index = 0; index < values.length; index += size) {
    batches.push(values.slice(index, index + size));
  }
  return batches;
}

function mergeSarif(reports) {
  const first = reports.find((report) => Array.isArray(report?.runs));
  if (!first) return { version: '2.1.0', runs: [] };
  const merged = structuredClone(first);
  if (merged.runs?.[0]) {
    merged.runs[0].results = reports.flatMap((report) => report?.runs?.[0]?.results || []);
    const artifacts = reports.flatMap((report) => report?.runs?.[0]?.artifacts || []);
    if (artifacts.length) merged.runs[0].artifacts = artifacts;
  }
  return merged;
}

async function runSemgrep({ reportDir, targets }) {
  const reportPath = path.join(reportDir, 'semgrep.json');
  const sarifPath = path.join(reportDir, 'semgrep.sarif');
  const codeTargets = collectSourceFiles(targets).filter((file) => SEMGREP_CODE_RE.test(file));
  if (!codeTargets.length) fail('Semgrep resolved no JavaScript or TypeScript files.');
  const batches = batchesOf(codeTargets, process.platform === 'win32' ? 50 : codeTargets.length);
  const env = { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' };
  const reports = [];
  const sarifReports = [];
  for (let index = 0; index < batches.length; index += 1) {
    const batchName = `batch-${String(index + 1).padStart(3, '0')}`;
    const batchJson = path.join(reportDir, `${batchName}.semgrep.json`);
    const batchSarif = path.join(reportDir, `${batchName}.semgrep.sarif`);
    progress(`Semgrep ${batchName}/${batches.length}: ${batches[index].length} files.`);
    const args = ['--from', `semgrep==${SEMGREP_VERSION}`, 'semgrep', 'scan',
      '--x-rule-validation=core-only', '--metrics', 'off', '--disable-version-check',
      '--jobs', '2', '--timeout', '20', '--max-memory', '2048',
      '--json-output', batchJson, '--sarif-output', batchSarif, '--error'];
    for (const config of semgrepConfigs()) args.push('--config', config);
    args.push(...batches[index]);
    await runAsync('uvx', args, { allowedExitCodes: [0, 1], timeoutMs: 2 * 60 * 1000, env });
    if (!fs.existsSync(batchJson) || !fs.existsSync(batchSarif)) {
      fail(`Semgrep ${batchName} did not produce both JSON and SARIF output.`);
    }
    const report = JSON.parse(fs.readFileSync(batchJson, 'utf8'));
    if ((report.errors || []).length) fail(`Semgrep ${batchName} reported ${report.errors.length} scanner errors.`);
    reports.push(report);
    sarifReports.push(JSON.parse(fs.readFileSync(batchSarif, 'utf8')));
  }
  const findings = reports.flatMap((report) => report.results || []);
  writeJson(reportPath, {
    version: SEMGREP_VERSION,
    status: 'completed',
    batchCount: batches.length,
    scannedFileCount: codeTargets.length,
    results: findings,
    errors: [],
  });
  writeJson(sarifPath, mergeSarif(sarifReports));
  return { findings, reportPath, sarifPath };
}

function runGitleaks({ reportDir, logOpts }) {
  const expectedCommitCount = Number(git(['rev-list', '--count', logOpts === '--all' ? '--all' : logOpts]));
  if (!Number.isInteger(expectedCommitCount) || expectedCommitCount < 1) fail('Gitleaks target contains no commits.');
  const gitleaks = bootstrapGitleaks();
  const reportPath = path.join(reportDir, 'gitleaks.json');
  const args = ['git', '--redact=100', '--report-format', 'json', '--report-path', reportPath,
    '--timeout', '600', '--no-banner', '--no-color'];
  if (logOpts) args.push('--log-opts', logOpts);
  args.push(REPO_ROOT);
  const result = run(gitleaks, args, {
    allowedExitCodes: [0, 1],
    capture: true,
    timeoutMs: 11 * 60 * 1000,
  });
  const scannerLog = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
  if (scannerLog) process.stderr.write(`${scannerLog}\n`);
  const reportedCommitCount = gitleaksReportedCommitCount(scannerLog);
  if (!Number.isInteger(reportedCommitCount) || reportedCommitCount < 1) {
    fail('Gitleaks did not report a non-empty commit scan.');
  }
  if (!fs.existsSync(reportPath)) fail('Gitleaks did not produce JSON output.');
  const findings = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  return {
    findings: Array.isArray(findings) ? findings : [],
    reportPath,
    expectedCommitCount,
    reportedCommitCount,
  };
}

function safeFilesystemFinding(finding = {}) {
  return {
    ruleId: String(finding.RuleID || ''),
    description: String(finding.Description || ''),
    file: normalize(finding.File),
    startLine: Number(finding.StartLine || 0),
    endLine: Number(finding.EndLine || 0),
    fingerprint: String(finding.Fingerprint || ''),
  };
}

function runGitleaksFilesystem({ reportDir }) {
  const files = localEnvironmentFiles();
  const gitleaks = bootstrapGitleaks();
  const configPath = path.join(REPO_ROOT, '.gitleaks.toml');
  if (!fs.existsSync(configPath)) fail('Missing .gitleaks.toml local-environment policy.');
  const findings = [];
  for (let index = 0; index < files.length; index += 1) {
    const batchPath = path.join(reportDir, `local-env-${String(index + 1).padStart(3, '0')}.json`);
    run(gitleaks, [
      'dir', '--config', configPath, '--redact=100', '--report-format', 'json',
      '--report-path', batchPath, '--timeout', '60', '--no-banner', '--no-color', files[index],
    ], { allowedExitCodes: [0, 1], capture: true, timeoutMs: 90 * 1000 });
    if (!fs.existsSync(batchPath)) fail(`Gitleaks produced no local report for ${files[index]}.`);
    const batch = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
    findings.push(...(Array.isArray(batch) ? batch.map(safeFilesystemFinding) : []));
    fs.rmSync(batchPath, { force: true });
  }
  const reportPath = path.join(reportDir, 'gitleaks-local-environment.json');
  writeJson(reportPath, {
    version: GITLEAKS_VERSION,
    status: 'completed',
    scannedFiles: files,
    findings,
  });
  return { files, findings, reportPath };
}

function runGitleaksWorkingTree({ reportDir }) {
  const gitleaks = bootstrapGitleaks();
  const configPath = path.join(REPO_ROOT, '.gitleaks.toml');
  if (!fs.existsSync(configPath)) fail('Missing .gitleaks.toml working-tree policy.');
  const inventory = git(['ls-files', '--cached', '--others', '--exclude-standard'])
    .split(/\r?\n/).map((file) => file.trim()).filter(Boolean);
  if (!inventory.length) fail('Working-tree secret scan resolved no source inventory.');
  const rawReportPath = path.join(reportDir, 'gitleaks-working-tree.raw.json');
  run(gitleaks, [
    'dir', '--config', configPath, '--redact=100', '--report-format', 'json',
    '--report-path', rawReportPath, '--timeout', '600', '--no-banner', '--no-color', REPO_ROOT,
  ], { allowedExitCodes: [0, 1], capture: true, timeoutMs: 11 * 60 * 1000 });
  if (!fs.existsSync(rawReportPath)) fail('Gitleaks produced no working-tree report.');
  const raw = JSON.parse(fs.readFileSync(rawReportPath, 'utf8'));
  const findings = Array.isArray(raw) ? raw.map(safeFilesystemFinding) : [];
  fs.rmSync(rawReportPath, { force: true });
  const reportPath = path.join(reportDir, 'gitleaks-working-tree.json');
  writeJson(reportPath, {
    version: GITLEAKS_VERSION,
    status: 'completed',
    sourceInventoryCount: inventory.length,
    findings,
  });
  return { inventory, findings, reportPath };
}

function gitleaksReportedCommitCount(scannerLog) {
  return Number(String(scannerLog || '').match(/(\d+) commits scanned/i)?.[1] || 0);
}

function runAudit(workspace, reportDir) {
  const cwd = workspace === 'root' ? REPO_ROOT : path.join(REPO_ROOT, workspace);
  const lockfile = path.join(cwd, 'package-lock.json');
  if (!fs.existsSync(lockfile)) fail(`Missing lockfile for ${workspace}: ${lockfile}`);
  const npmCliCandidates = [
    process.env.npm_execpath,
    path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.resolve(path.dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ].filter(Boolean);
  const npmCli = npmCliCandidates.find((candidate) => fs.existsSync(candidate));
  if (!npmCli) fail('The npm CLI entry point could not be located for dependency auditing.');
  const result = run(process.execPath, [npmCli, 'audit', '--json', '--audit-level=moderate'], {
    cwd,
    allowedExitCodes: [0, 1],
    capture: true,
    timeoutMs: 5 * 60 * 1000,
  });
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    fail(`npm audit returned invalid JSON for ${workspace}: ${String(result.stderr || '').trim()}`);
  }
  const reportPath = path.join(reportDir, `npm-audit-${workspace}.json`);
  writeJson(reportPath, report);
  const vulnerabilities = report.metadata?.vulnerabilities || {};
  const blocking = Number(vulnerabilities.moderate || 0) + Number(vulnerabilities.high || 0) +
    Number(vulnerabilities.critical || 0);
  return { blocking, reportPath, vulnerabilities };
}

function verifySemgrepCanary() {
  const canaryRoot = path.join(REPO_ROOT, '.codex_tmp', 'security-local-canary');
  fs.mkdirSync(canaryRoot, { recursive: true });
  const canaryDir = fs.mkdtempSync(path.join(canaryRoot, 'run-'));
  const canaryFile = path.join(canaryDir, 'commandInjection.js');
  const reportPath = path.join(canaryDir, 'semgrep.json');
  fs.writeFileSync(
    canaryFile,
    'function unsafe(input) { require("node:child_process").exec(input); return eval(input); }\n',
    'utf8'
  );
  try {
    const result = run('uvx', [
      '--from', `semgrep==${SEMGREP_VERSION}`, 'semgrep', 'scan',
      '--metrics', 'off', '--disable-version-check', '--no-git-ignore', '--error',
      '--json-output', reportPath, '--config', semgrepConfigs()[0], canaryFile,
    ], {
      allowedExitCodes: [0, 1],
      capture: true,
      timeoutMs: 2 * 60 * 1000,
      env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
    });
    if (!fs.existsSync(reportPath)) fail(`Semgrep canary produced no report: ${String(result.stderr || '').trim()}`);
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const detected = new Set((report.results || []).map((finding) => String(finding.check_id || '')));
    const required = ['planli.javascript-eval', 'planli.child-process-shell'];
    if (!required.every((id) => [...detected].some((value) => value.endsWith(id)))) {
      fail('Semgrep eval/command-injection canary was not fully detected; refusing to trust the scanner.');
    }
    return true;
  } finally {
    fs.rmSync(canaryDir, { recursive: true, force: true });
  }
}

function verifyGitleaksFilesystemCanary(gitleaks) {
  const canaryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'planli-security-env-canary-'));
  const canaryFile = path.join(canaryDir, '.env');
  const reportPath = path.join(canaryDir, 'gitleaks.json');
  fs.writeFileSync(
    canaryFile,
    ['AWS_ACCESS_KEY_ID=', 'AKIA', 'QWERTYUIOPASDFGH', '\n'].join(''),
    'utf8'
  );
  try {
    run(gitleaks, [
      'dir', '--config', path.join(REPO_ROOT, '.gitleaks.toml'), '--redact=100',
      '--report-format', 'json', '--report-path', reportPath, '--timeout', '60',
      '--no-banner', '--no-color', canaryFile,
    ], { allowedExitCodes: [0, 1], capture: true, timeoutMs: 90 * 1000 });
    if (!fs.existsSync(reportPath)) fail('Gitleaks local-environment canary produced no report.');
    const findings = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    if (!Array.isArray(findings) || !findings.some((finding) => finding.RuleID === 'aws-access-token')) {
      fail('Gitleaks local-environment canary was not detected; refusing to trust the scanner.');
    }
    return true;
  } finally {
    fs.rmSync(canaryDir, { recursive: true, force: true });
  }
}

function preflight() {
  assertRepository();
  progress('Checking pinned scanner versions.');
  const gitleaks = bootstrapGitleaks();
  const semgrepVersion = run('uvx', ['--from', `semgrep==${SEMGREP_VERSION}`, 'semgrep', '--version'], {
    capture: true,
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
  }).stdout.trim();
  const gitleaksVersion = run(gitleaks, ['version'], { capture: true }).stdout.trim();
  if (semgrepVersion !== SEMGREP_VERSION) fail(`Unexpected Semgrep version: ${semgrepVersion}`);
  if (gitleaksVersion !== GITLEAKS_VERSION) fail(`Unexpected Gitleaks version: ${gitleaksVersion}`);
  progress('Running an intentional command-injection canary.');
  const canaryDetected = verifySemgrepCanary();
  progress('Running an intentional ignored-.env credential canary.');
  const localEnvironmentCanaryDetected = verifyGitleaksFilesystemCanary(gitleaks);
  return {
    semgrepVersion,
    gitleaksVersion,
    customRulesSha256: sha256File(semgrepConfigs()[0]),
    canaryDetected,
    localEnvironmentCanaryDetected,
  };
}

async function execute(args) {
  const tools = preflight();
  if (args.mode === 'preflight') return { mode: 'preflight', tools };
  let inventoryTargets = SEMGREP_TARGETS;
  let semgrepTargets = args.mode === 'inputs' ? inputSinkTargets() : null;
  let logOpts = '--all';
  let revisions = null;
  if (args.mode === 'diff') {
    revisions = changedTargets(args.base, args.head);
    inventoryTargets = revisions.files;
    semgrepTargets = revisions.files;
    logOpts = `${revisions.baseSha}..${revisions.headSha}`;
  } else if (!['full', 'inputs'].includes(args.mode)) {
    fail(`Unknown mode: ${args.mode}. Expected preflight, diff, full, or inputs.`);
  }
  if (args.mode === 'full') semgrepTargets = fullScanTargets();
  const sourceFiles = collectSourceFiles(inventoryTargets);
  const semgrepCandidateFiles = collectSourceFiles(semgrepTargets).filter((file) => SEMGREP_CODE_RE.test(file));
  if (!sourceFiles.length) fail('No source files resolved for the requested scan.');
  if (!semgrepCandidateFiles.length) fail('No Semgrep candidates resolved for the requested scan.');
  const { id, reportDir } = createReportDir(args.mode);
  const head = git(['rev-parse', 'HEAD']);
  const receiptPath = path.join(reportDir, 'receipt.json');
  const receipt = {
    id,
    mode: args.mode,
    status: 'started',
    head,
    startedAt: new Date().toISOString(),
    sourceFileCount: sourceFiles.length,
    sourceSnapshotSha256: snapshotFiles(sourceFiles),
    semgrepCandidateCount: semgrepCandidateFiles.length,
    tools,
    revisions,
  };
  writeJson(receiptPath, receipt);

  try {
    progress(`Semgrep: ${sourceFiles.length} files inventoried; scanning ${semgrepCandidateFiles.length} rule-relevant candidates.`);
    const semgrep = await runSemgrep({ reportDir, targets: semgrepTargets });
    progress('Gitleaks: scanning the requested Git history.');
    const gitleaks = runGitleaks({ reportDir, logOpts });
    progress('Gitleaks: scanning ignored local environment files with redacted output.');
    const localEnvironment = runGitleaksFilesystem({ reportDir });
    progress('Gitleaks: scanning the current working tree with redacted output.');
    const workingTree = runGitleaksWorkingTree({ reportDir });
    progress(args.mode === 'inputs' ? 'Dependency audit skipped for the input-only scan.' : 'npm audit: checking all lockfiles.');
    const audits = args.mode === 'inputs' ? [] : ['root', 'client', 'functions']
      .map((workspace) => ({ workspace, ...runAudit(workspace, reportDir) }));
    const blockingAuditCount = audits.reduce((sum, audit) => sum + audit.blocking, 0);
    const gatePassed = !semgrep.findings.length && !gitleaks.findings.length
      && !localEnvironment.findings.length && !workingTree.findings.length && !blockingAuditCount;
    const completed = {
      ...receipt,
      status: 'completed',
      gatePassed,
      completedAt: new Date().toISOString(),
      semgrepFindingCount: semgrep.findings.length,
      gitleaksFindingCount: gitleaks.findings.length,
      localEnvironmentFileCount: localEnvironment.files.length,
      localEnvironmentFindingCount: localEnvironment.findings.length,
      workingTreeInventoryCount: workingTree.inventory.length,
      workingTreeFindingCount: workingTree.findings.length,
      gitleaksExpectedCommitCount: gitleaks.expectedCommitCount,
      gitleaksReportedCommitCount: gitleaks.reportedCommitCount,
      blockingAuditCount,
      reports: {
        semgrep: normalize(path.relative(REPO_ROOT, semgrep.reportPath)),
        semgrepSarif: normalize(path.relative(REPO_ROOT, semgrep.sarifPath)),
        gitleaks: normalize(path.relative(REPO_ROOT, gitleaks.reportPath)),
        localEnvironment: normalize(path.relative(REPO_ROOT, localEnvironment.reportPath)),
        workingTree: normalize(path.relative(REPO_ROOT, workingTree.reportPath)),
        audits: audits.map((audit) => normalize(path.relative(REPO_ROOT, audit.reportPath))),
      },
    };
    writeJson(receiptPath, completed);
    if (!gatePassed) {
      fail(`Security gate found ${semgrep.findings.length} Semgrep findings, ${gitleaks.findings.length} Git-history leaks, ${localEnvironment.findings.length} local-environment leaks, ${workingTree.findings.length} working-tree leaks, and ${blockingAuditCount} moderate-or-higher dependency advisories. Reports: ${reportDir}`);
    }
    return completed;
  } catch (error) {
    const current = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    if (current.status !== 'completed') {
      writeJson(receiptPath, { ...current, status: 'failed', failedAt: new Date().toISOString(), error: error.message });
    }
    throw error;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await execute(args);
  process.stdout.write(`${JSON.stringify({ ok: true, ...result }, null, 2)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`Local security scan failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  batchesOf,
  changedTargets,
  collectSourceFiles,
  fullScanTargets,
  gitleaksReportedCommitCount,
  localEnvironmentFiles,
  mergeSarif,
  parseArgs,
  semgrepConfigs,
  snapshotFiles,
};
