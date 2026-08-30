#!/usr/bin/env node

const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const TEST_FILE_RE = /\.test\.[cm]?[jt]sx?$/i;
const CLIENT_CODE_RE = /\.[cm]?[jt]sx?$/i;
const FUNCTIONS_CODE_RE = /\.[cm]?js$/i;
const MAX_FOCUSED_CLIENT_TESTS = 4;
const PACKAGE_FILE_RE = /(^|\/)package(?:-lock)?\.json$/;
const TAXONOMY_PATHS = new Set([
  'shared/travelTaxonomy.json',
  'scripts/syncTravelTaxonomy.js',
  'docs/travel-taxonomy-map.md',
]);
const RULE_PATHS = new Set([
  'firebase.json',
  'firestore.rules',
  'functions/rules.test.js',
  'storage.rules',
  'storage.us-readonly.rules',
]);
const VALIDATION_TOOLING_PATHS = new Set([
  'package.json',
  'scripts/validationPlan.js',
  'scripts/validationPlan.test.js',
  '.github/workflows/pr-validation.yml',
  '.github/workflows/release-readiness.yml',
]);
const SECURITY_TOOLING_PATHS = new Set([
  '.gitignore',
  '.gitleaks.toml',
  'docs/security-scanning.md',
  'scripts/securityLocalScan.js',
  'scripts/securityLocalScan.test.js',
]);
const LEGAL_POLICY_PATHS = new Set([
  'config/legal-policy.json',
  'client/src/constants/legalPolicy.generated.js',
  'functions/legalPolicy.generated.js',
  'scripts/syncLegalPolicy.js',
  'scripts/syncLegalPolicy.test.js',
  'storage.rules',
]);
const NATIVE_INPUTS = [
  /^client\/(?:app\.json|app\.config\.js|eas\.json|index\.js|metro\.config\.js)$/,
  /^client\/assets\//,
  /^client\/package(?:-lock)?\.json$/,
];
const ADMIN_INPUTS = [
  /^client\/src\/features\/admin\//,
  /^client\/src\/services\/AdminService\.js$/,
  /^client\/src\/styles\/admin\.js$/,
  /^client\/scripts\/(?:exportAdminWeb|verifyAdminExport)\.js$/,
  /^client\/(?:index\.js|metro\.config\.js)$/,
  /^client\/assets\//,
  /^client\/package(?:-lock)?\.json$/,
];
const CLIENT_SHARED_RISK = [
  /^client\/index\.js$/,
  /^client\/src\/config\//,
  /^client\/src\/navigation\//,
  /^client\/src\/features\/auth\/AuthContext\.js$/,
];
const EXPLICIT_FUNCTION_TESTS = new Map([
  ['functions/index.js', [
    'functions/notificationWiring.test.js',
  ]],
]);

function normalizePath(value) {
  return String(value || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/+/g, '/');
}

function unique(values) {
  return [...new Set(values.map(normalizePath).filter(Boolean))].sort();
}

function matchesAny(file, patterns) {
  return patterns.some((pattern) => pattern.test(file));
}

function isClientPresentationOnly(file) {
  return file.startsWith('client/assets/')
    || file.startsWith('client/src/styles/')
    || /(?:Style|Styles|Presentation)\.js$/i.test(file);
}

function hasUnsupportedDynamicRelativeLoad(source) {
  const withoutLiteralLoads = source
    .replace(/require(?:\.resolve)?\(\s*['"][^'"]+['"]\s*\)/g, '')
    .replace(/import\(\s*['"][^'"]+['"]\s*\)/g, '');
  return /require(?:\.resolve)?\s*\(/.test(withoutLiteralLoads)
    || /import\s*\(/.test(withoutLiteralLoads);
}

function extractLiteralSpecifiers(source) {
  const specifiers = [];
  const patterns = [
    /require(?:\.resolve)?\(\s*['"]([^'"]+)['"]\s*\)/g,
    /(?:import|export)\s+(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g,
    /import\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source))) specifiers.push(match[1]);
  }
  return [...new Set(specifiers)].sort();
}

function listFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...listFiles(absolute));
    else result.push(absolute);
  }
  return result;
}

function resolveRelativeModule(fromFile, specifier, repoRoot = REPO_ROOT) {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.web.js`,
    `${base}.native.js`,
    `${base}.json`,
    path.join(base, 'index.js'),
  ];
  const resolved = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  if (!resolved) return null;
  return normalizePath(path.relative(repoRoot, resolved));
}

function buildClientDependencyGraph(repoRoot = REPO_ROOT) {
  const clientRoot = path.join(repoRoot, 'client');
  const graph = new Map();
  for (const absolute of listFiles(clientRoot).filter((file) => CLIENT_CODE_RE.test(file))) {
    const relative = normalizePath(path.relative(repoRoot, absolute));
    const source = fs.readFileSync(absolute, 'utf8');
    const dependencies = extractLiteralSpecifiers(source)
      .map((specifier) => resolveRelativeModule(absolute, specifier, repoRoot))
      .filter(Boolean);
    graph.set(relative, new Set(dependencies));
  }
  return graph;
}

function buildFunctionsDependencyGraph(repoRoot = REPO_ROOT) {
  const functionsRoot = path.join(repoRoot, 'functions');
  const graph = new Map();
  const unsupported = new Set();
  for (const absolute of listFiles(functionsRoot).filter((file) => FUNCTIONS_CODE_RE.test(file))) {
    const relative = normalizePath(path.relative(repoRoot, absolute));
    const source = fs.readFileSync(absolute, 'utf8');
    if (hasUnsupportedDynamicRelativeLoad(source)) unsupported.add(relative);
    const dependencies = extractLiteralSpecifiers(source)
      .map((specifier) => resolveRelativeModule(absolute, specifier, repoRoot))
      .filter(Boolean);
    graph.set(relative, new Set(dependencies));
  }
  return { graph, unsupported };
}

function transitiveDependencies(graph, start) {
  const visited = new Set();
  const pending = [...(graph.get(start) || [])];
  while (pending.length) {
    const current = pending.pop();
    if (visited.has(current)) continue;
    visited.add(current);
    for (const dependency of graph.get(current) || []) pending.push(dependency);
  }
  return visited;
}

function selectDependentTests(graph, changedFiles) {
  const changed = new Set(changedFiles.map(normalizePath));
  const selected = [];
  for (const file of graph.keys()) {
    if (!TEST_FILE_RE.test(file)) continue;
    if (changed.has(file)) {
      selected.push(file);
      continue;
    }
    const dependencies = transitiveDependencies(graph, file);
    if ([...changed].some((changedFile) => dependencies.has(changedFile))) selected.push(file);
  }
  return unique(selected);
}

function sameNameTest(file, repoRoot = REPO_ROOT) {
  if (!FUNCTIONS_CODE_RE.test(file) || TEST_FILE_RE.test(file)) return null;
  const candidate = file.replace(/\.([cm]?js)$/i, '.test.$1');
  return fs.existsSync(path.join(repoRoot, candidate)) ? candidate : null;
}

function classifyChanges(files) {
  const changedFiles = unique(files);
  const clientFiles = changedFiles.filter((file) => file.startsWith('client/'));
  const functionsFiles = changedFiles.filter((file) => file.startsWith('functions/'));
  const clientRuntimeFiles = clientFiles.filter((file) => !/\.md$/i.test(file));
  const functionsRuntimeFiles = functionsFiles.filter((file) =>
    !/\.md$/i.test(file) && file !== 'functions/rules.test.js'
  );
  const taxonomy = changedFiles.some((file) => TAXONOMY_PATHS.has(file));
  const rules = changedFiles.some((file) => RULE_PATHS.has(file));
  const indexes = changedFiles.includes('firestore.indexes.json');
  const clientDependency = clientFiles.some((file) => PACKAGE_FILE_RE.test(file));
  const functionsDependency = functionsFiles.some((file) => PACKAGE_FILE_RE.test(file));
  const clientLockfile = clientFiles.includes('client/package-lock.json');
  const functionsLockfile = functionsFiles.includes('functions/package-lock.json');
  const validationTooling = changedFiles.some((file) => VALIDATION_TOOLING_PATHS.has(file));
  const securityTooling = changedFiles.some((file) => (
    SECURITY_TOOLING_PATHS.has(file) || file.startsWith('.semgrep/')
  ));
  const legalPolicy = changedFiles.some((file) => LEGAL_POLICY_PATHS.has(file));

  return {
    changedFiles,
    tooling: validationTooling || securityTooling || legalPolicy,
    validationTooling,
    securityTooling,
    legalPolicy,
    client: clientRuntimeFiles.length > 0 || taxonomy,
    functions: functionsRuntimeFiles.length > 0 || taxonomy || indexes,
    rules,
    indexes,
    taxonomy,
    adminExport: clientFiles.some((file) => matchesAny(file, ADMIN_INPUTS)),
    nativeExport: clientFiles.some((file) => matchesAny(file, NATIVE_INPUTS)),
    clientAudit: clientDependency,
    functionsAudit: functionsDependency,
    clientFull: clientLockfile,
    functionsFull: functionsLockfile,
  };
}

function createPlan(files, repoRoot = REPO_ROOT) {
  const plan = {
    ...classifyChanges(files),
    clientTests: [],
    clientSources: [],
    functionsTests: [],
    warnings: [],
    fallbackReasons: [],
  };

  const clientFiles = plan.changedFiles.filter((file) => file.startsWith('client/'));
  plan.clientTests = clientFiles.filter((file) => TEST_FILE_RE.test(file));
  plan.clientSources = clientFiles.filter((file) => CLIENT_CODE_RE.test(file) && !TEST_FILE_RE.test(file));
  if (plan.taxonomy) {
    plan.clientTests.push(
      'client/__tests__/travelTaxonomy.test.js',
      'client/__tests__/travelTaxonomy.recommendationCatalog.test.js'
    );
  }
  plan.clientTests = unique(plan.clientTests.filter((file) => fs.existsSync(path.join(repoRoot, file))));

  if (!plan.functions) return plan;

  const functionsRuntimeFiles = plan.changedFiles.filter((file) =>
    file.startsWith('functions/') && FUNCTIONS_CODE_RE.test(file) && !TEST_FILE_RE.test(file)
  );
  const { graph, unsupported } = buildFunctionsDependencyGraph(repoRoot);
  const directTests = functionsRuntimeFiles
    .map((file) => sameNameTest(file, repoRoot))
    .filter(Boolean);
  const explicitTests = functionsRuntimeFiles.flatMap((file) => EXPLICIT_FUNCTION_TESTS.get(file) || []);
  const uncoveredRuntimeFiles = functionsRuntimeFiles.filter((file) =>
    !sameNameTest(file, repoRoot) && !EXPLICIT_FUNCTION_TESTS.has(file)
  );
  plan.functionsTests.push(
    ...selectDependentTests(graph, uncoveredRuntimeFiles),
    ...plan.changedFiles.filter((file) =>
      file.startsWith('functions/') && TEST_FILE_RE.test(file) && file !== 'functions/rules.test.js'
    ),
    ...directTests,
    ...explicitTests
  );
  if (plan.indexes) plan.functionsTests.push('functions/firestoreIndexes.test.js');
  if (plan.taxonomy) {
    plan.functionsTests.push(
      'functions/travelTaxonomyParity.test.js',
      'functions/recommendationCatalog.test.js'
    );
  }
  plan.functionsTests = unique(plan.functionsTests.filter((file) => fs.existsSync(path.join(repoRoot, file))));

  for (const file of functionsRuntimeFiles) {
    const explicit = EXPLICIT_FUNCTION_TESTS.get(file) || [];
    const covered = plan.functionsTests.some((testFile) => {
      const dependencies = transitiveDependencies(graph, testFile);
      return dependencies.has(file)
        || sameNameTest(file, repoRoot) === testFile
        || explicit.includes(testFile);
    });
    const unresolved = !fs.existsSync(path.join(repoRoot, file));
    if (covered && !unsupported.has(file)) continue;
    if (file.startsWith('functions/scripts/')) {
      const scriptTests = [...graph.keys()].filter((candidate) =>
        candidate.startsWith('functions/scripts/') && TEST_FILE_RE.test(candidate)
      );
      plan.functionsTests.push(...scriptTests);
      plan.fallbackReasons.push(`${file}: script test group`);
    } else {
      plan.functionsFull = true;
      plan.fallbackReasons.push(`${file}: full Functions fallback`);
    }
    if (unsupported.has(file)) plan.warnings.push(`${file} contains a dynamic module load`);
    if (unresolved) plan.warnings.push(`${file} is deleted or cannot be resolved`);
  }
  plan.functionsTests = unique(plan.functionsTests);

  return plan;
}

function gitLines(args, repoRoot = REPO_ROOT) {
  try {
    const output = execFileSync('git', ['-c', 'core.safecrlf=false', ...args], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    return output.split(/\r?\n/).map(normalizePath).filter(Boolean);
  } catch (error) {
    const detail = error.stderr ? String(error.stderr).trim() : error.message;
    throw new Error(`git ${args.join(' ')} failed: ${detail}`);
  }
}

function changedFilesFromGit({ base = 'main', head = 'HEAD', includeWorktree = true } = {}, repoRoot = REPO_ROOT) {
  const files = gitLines(['diff', '--name-only', '--diff-filter=ACMRD', `${base}...${head}`], repoRoot);
  if (includeWorktree) {
    files.push(...gitLines(['diff', '--name-only', '--diff-filter=ACMRD'], repoRoot));
    files.push(...gitLines(['diff', '--cached', '--name-only', '--diff-filter=ACMRD'], repoRoot));
    files.push(...gitLines(['ls-files', '--others', '--exclude-standard'], repoRoot));
  }
  return unique(files);
}

function parseArgs(argv) {
  const options = {
    command: 'run',
    base: 'main',
    head: 'HEAD',
    scope: 'all',
    includeWorktree: !process.env.CI,
    planOnly: false,
    githubOutput: null,
    help: false,
  };
  const args = [...argv];
  if (args[0] === 'plan' || args[0] === 'run') options.command = args.shift();
  while (args.length) {
    const arg = args.shift();
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--base') options.base = args.shift();
    else if (arg === '--head') {
      options.head = args.shift();
      options.includeWorktree = false;
    } else if (arg === '--scope') options.scope = args.shift();
    else if (arg === '--include-worktree') options.includeWorktree = true;
    else if (arg === '--no-worktree') options.includeWorktree = false;
    else if (arg === '--plan-only') options.planOnly = true;
    else if (arg === '--github-output') options.githubOutput = args.shift();
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.base || !options.head || !options.scope || options.githubOutput === undefined) {
    throw new Error('An option is missing its required value');
  }
  const scopes = new Set(['all', 'tooling', 'client', 'functions', 'rules', 'taxonomy']);
  if (!scopes.has(options.scope)) throw new Error(`Unsupported scope: ${options.scope}`);
  return options;
}

function usage() {
  return [
    'Usage: node scripts/validationPlan.js [plan|run] [options]',
    '  --base <ref> --head <ref>       select an exact Git diff',
    '  --scope <all|tooling|client|functions|rules|taxonomy>',
    '  --include-worktree | --no-worktree | --plan-only',
    '  --github-output <path>           write GitHub Actions outputs',
  ].join('\n');
}

function writeGithubOutput(plan, destination) {
  const values = {
    tooling: plan.tooling,
    client: plan.client,
    functions: plan.functions,
    rules: plan.rules,
    taxonomy: plan.taxonomy,
    admin_export: plan.adminExport,
    native_export: plan.nativeExport,
    client_audit: plan.clientAudit,
    functions_audit: plan.functionsAudit,
  };
  const lines = Object.entries(values).map(([key, value]) => `${key}=${Boolean(value)}`).join('\n');
  fs.appendFileSync(destination, `${lines}\n`);
}

function printablePlan(plan) {
  return {
    changedFiles: plan.changedFiles,
    checks: {
      tooling: plan.tooling,
      validationTooling: plan.validationTooling,
      securityTooling: plan.securityTooling,
      legalPolicy: plan.legalPolicy,
      client: plan.client,
      functions: plan.functions,
      rules: plan.rules,
      taxonomy: plan.taxonomy,
      adminExport: plan.adminExport,
      nativeExport: plan.nativeExport,
      clientAudit: plan.clientAudit,
      functionsAudit: plan.functionsAudit,
    },
    selection: {
      clientFull: plan.clientFull,
      clientTests: plan.clientTests,
      functionsFull: plan.functionsFull,
      functionsTests: plan.functionsTests,
    },
    fallbackReasons: plan.fallbackReasons,
    warnings: plan.warnings,
  };
}

function compactPlan(plan) {
  const checks = ['tooling', 'client', 'functions', 'rules', 'taxonomy']
    .filter((check) => plan[check]);
  const toolingChecks = [
    plan.validationTooling && 'planner',
    plan.securityTooling && 'security',
    plan.legalPolicy && 'legal',
  ].filter(Boolean);
  return [
    `checks=${checks.length ? checks.join(',') : 'none'}`,
    `toolingChecks=${toolingChecks.length ? toolingChecks.join(',') : 'none'}`,
    `clientTests=${plan.clientFull ? 'full' : plan.clientTests.length}`,
    `functionsTests=${plan.functionsFull ? 'full' : plan.functionsTests.length}`,
    `exports=${[plan.adminExport && 'admin', plan.nativeExport && 'ios'].filter(Boolean).join(',') || 'none'}`,
    `audits=${[plan.clientAudit && 'client', plan.functionsAudit && 'functions'].filter(Boolean).join(',') || 'none'}`,
  ].join(' ');
}

function tailLines(value, count = 120) {
  return String(value || '').split(/\r?\n/).slice(-count).join('\n');
}

function runCommand(label, command, args, cwd, repoRoot = REPO_ROOT) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0' },
    maxBuffer: 32 * 1024 * 1024,
    shell: process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(command),
  });
  const executionError = result.error ? `${result.error.message}\n` : '';
  const output = `${result.stdout || ''}${result.stderr || ''}${executionError}`;
  const logDirectory = path.join(repoRoot, '.codex_tmp', 'validation');
  fs.mkdirSync(logDirectory, { recursive: true });
  const logPath = path.join(logDirectory, `${label.replace(/[^a-z0-9_-]+/gi, '-')}.log`);
  fs.writeFileSync(logPath, output);
  if (result.status !== 0) {
    process.stderr.write(`${tailLines(output)}\n`);
    throw new Error(`${label} failed; full log: ${normalizePath(path.relative(repoRoot, logPath))}`);
  }
  console.log(`PASS ${label} (log: ${normalizePath(path.relative(repoRoot, logPath))})`);
  return output;
}

function jestExecutable(clientRoot) {
  return require.resolve('jest/bin/jest', { paths: [clientRoot] });
}

function selectClientTestsWithJest(plan, repoRoot = REPO_ROOT) {
  const clientRoot = path.join(repoRoot, 'client');
  const graph = buildClientDependencyGraph(repoRoot);
  const selected = new Set(plan.clientTests);
  if (!plan.clientSources.length || plan.clientFull) {
    return unique([...selected].map((file) => path.resolve(repoRoot, file)));
  }
  const sources = plan.clientSources.filter((file) => fs.existsSync(path.join(repoRoot, file)));
  const tests = [...graph.keys()].filter((file) => TEST_FILE_RE.test(file));
  for (const source of sources) {
    const sourceBase = path.basename(source).replace(/\.[^.]+$/, '').toLowerCase();
    const sameName = tests.find((testFile) =>
      path.basename(testFile).replace(/\.test\.[^.]+$/, '').toLowerCase() === sourceBase
    );
    if (sameName) selected.add(sameName);
  }
  const isCovered = (source) => [...selected].some((testFile) =>
    testFile === source || transitiveDependencies(graph, testFile).has(source)
  );
  const unresolved = sources.filter((source) => !isClientPresentationOnly(source) && !isCovered(source));
  if (unresolved.length) {
    const absoluteSources = unresolved.map((file) => path.resolve(repoRoot, file));
    const result = spawnSync(process.execPath, [
      jestExecutable(clientRoot),
      '--listTests',
      '--findRelatedTests',
      ...absoluteSources,
    ], { cwd: clientRoot, encoding: 'utf8', env: { ...process.env, FORCE_COLOR: '0' } });
    if (result.status !== 0) throw new Error(`Jest related-test selection failed: ${tailLines(result.stderr, 40)}`);
    const related = [];
    for (const line of result.stdout.split(/\r?\n/)) {
      const candidate = line.trim();
      if (TEST_FILE_RE.test(candidate) && fs.existsSync(candidate)) {
        related.push(normalizePath(path.relative(repoRoot, candidate)));
      }
    }
    if (related.length === 0) {
      console.log(`NO RELATED Jest test for ${unresolved.length} uncovered source file(s); add focused tests or runtime evidence`);
    } else if (related.length <= MAX_FOCUSED_CLIENT_TESTS) {
      for (const testFile of related) selected.add(testFile);
    } else {
      console.log(`SKIP ${related.length} broad Jest candidates for ${unresolved.length} uncovered source file(s); add focused tests or runtime evidence`);
    }
  }
  return unique([...selected].map((file) => path.resolve(repoRoot, file)));
}

function runClient(plan, repoRoot = REPO_ROOT) {
  if (!plan.client) return;
  const clientRoot = path.join(repoRoot, 'client');
  const jest = jestExecutable(clientRoot);
  if (plan.clientFull) {
    runCommand('client-full-tests', process.execPath,
      [jest, '--ci', '--runInBand', '--silent'], clientRoot, repoRoot);
  } else {
    const tests = selectClientTestsWithJest(plan, repoRoot);
    if (tests.length) {
      runCommand(`client-related-tests-${tests.length}`, process.execPath,
        [jest, '--ci', '--runInBand', '--silent', '--runTestsByPath', ...tests], clientRoot, repoRoot);
    } else if (plan.clientSources.length) {
      const risky = plan.clientSources.some((file) => matchesAny(file, CLIENT_SHARED_RISK));
      if (risky) {
        runCommand('client-shared-fallback-tests', process.execPath,
          [jest, '--ci', '--runInBand', '--silent'], clientRoot, repoRoot);
      } else {
        console.log('SKIP client tests: no related automated test; targeted runtime evidence is required');
      }
    }
  }
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  if (plan.adminExport) {
    runCommand('admin-web-export', npmCommand, ['run', 'export:admin-web'], clientRoot, repoRoot);
    runCommand('admin-web-verify', npmCommand, ['run', 'verify:admin-web'], clientRoot, repoRoot);
  }
  if (plan.nativeExport) {
    runCommand('ios-release-config', npmCommand, ['run', 'verify:ios-release-config'], clientRoot, repoRoot);
    runCommand('ios-export', npxCommand,
      ['expo', 'export', '--platform', 'ios', '--output-dir', '.expo-validation/changed-ios'], clientRoot, repoRoot);
  }
  if (plan.clientAudit) {
    runCommand('client-production-audit', npmCommand,
      ['audit', '--omit=dev', '--audit-level=critical'], clientRoot, repoRoot);
  }
}

function runFunctions(plan, repoRoot = REPO_ROOT) {
  if (!plan.functions) return;
  const functionsRoot = path.join(repoRoot, 'functions');
  if (plan.functionsFull) {
    runCommand('functions-full-tests', process.execPath,
      ['--test', '--test-reporter=spec'], functionsRoot, repoRoot);
  } else if (plan.functionsTests.length) {
    const tests = plan.functionsTests.map((file) => path.resolve(repoRoot, file));
    runCommand(`functions-related-tests-${tests.length}`, process.execPath,
      ['--test', '--test-reporter=spec', ...tests], functionsRoot, repoRoot);
  } else {
    console.log('SKIP Functions tests: no executable Functions change requires a test');
  }
  if (plan.functionsAudit) {
    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    runCommand('functions-production-audit', npmCommand,
      ['audit', '--omit=dev', '--audit-level=high'], functionsRoot, repoRoot);
  }
}

function runRules(plan, repoRoot = REPO_ROOT) {
  if (!plan.rules) return;
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  runCommand('firebase-rules-emulator', npmCommand,
    ['run', 'test:rules:emulator'], path.join(repoRoot, 'functions'), repoRoot);
}

function runTaxonomy(plan, repoRoot = REPO_ROOT) {
  if (!plan.taxonomy) return;
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  runCommand('travel-taxonomy-parity', npmCommand,
    ['run', 'test:travel-taxonomy'], repoRoot, repoRoot);
}

function shouldRunSecurityPreflight(env = process.env) {
  return String(env.GITHUB_ACTIONS || '').toLowerCase() !== 'true';
}

function runTooling(plan, repoRoot = REPO_ROOT) {
  if (!plan.tooling) return;
  if (plan.validationTooling) {
    runCommand('validation-planner-tests', process.execPath,
      ['--test', '--test-reporter=spec', 'scripts/validationPlan.test.js'], repoRoot, repoRoot);
  }
  if (plan.securityTooling) {
    runCommand('security-local-scanner-tests', process.execPath,
      ['--test', '--test-reporter=spec', 'scripts/securityLocalScan.test.js'], repoRoot, repoRoot);
    if (shouldRunSecurityPreflight()) {
      runCommand('security-local-preflight', process.execPath,
        ['scripts/securityLocalScan.js', 'preflight'], repoRoot, repoRoot);
    } else {
      console.log('SKIP security-local-preflight: GitHub Security analysis installs and runs the pinned scanners');
    }
  }
  if (plan.legalPolicy) {
    runCommand('legal-policy-tests', process.execPath,
      ['--test', '--test-reporter=spec', 'scripts/syncLegalPolicy.test.js'], repoRoot, repoRoot);
    runCommand('legal-policy-drift', process.execPath,
      ['scripts/syncLegalPolicy.js', '--check'], repoRoot, repoRoot);
  }
}

function runPlan(plan, scope, repoRoot = REPO_ROOT) {
  if (scope === 'all' || scope === 'tooling') runTooling(plan, repoRoot);
  if (scope === 'all' || scope === 'taxonomy') runTaxonomy(plan, repoRoot);
  if (scope === 'all' || scope === 'client') runClient(plan, repoRoot);
  if (scope === 'all' || scope === 'functions') runFunctions(plan, repoRoot);
  if (scope === 'all' || scope === 'rules') runRules(plan, repoRoot);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  const files = changedFilesFromGit(options, REPO_ROOT);
  const plan = createPlan(files, REPO_ROOT);
  if (options.githubOutput) writeGithubOutput(plan, options.githubOutput);
  if ((options.command === 'plan' || options.planOnly) && !options.githubOutput) {
    console.log(JSON.stringify(printablePlan(plan), null, 2));
  } else {
    console.log(`validation-plan: ${compactPlan(plan)}`);
  }
  if (options.command === 'run' && !options.planOnly) runPlan(plan, options.scope, REPO_ROOT);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`validation-plan: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  buildFunctionsDependencyGraph,
  buildClientDependencyGraph,
  changedFilesFromGit,
  classifyChanges,
  createPlan,
  extractLiteralSpecifiers,
  hasUnsupportedDynamicRelativeLoad,
  normalizePath,
  parseArgs,
  selectClientTestsWithJest,
  selectDependentTests,
  shouldRunSecurityPreflight,
  transitiveDependencies,
  unique,
};
