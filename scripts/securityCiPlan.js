'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const WEEKLY = '43 3 * * 1';
const SOURCE = /\.[cm]?[jt]sx?$/i;
const isSource = (file) => SOURCE.test(file)
  && !/(?:^|\/)(?:__tests__|node_modules)\//i.test(file)
  && !/\.test\.[cm]?[jt]sx?$/i.test(file)
  && /^(?:client\/|functions\/|scripts\/|server\/|shared\/)/.test(file);
const isSemgrepSource = (file) => isSource(file)
  && /^(?:functions\/|client\/src\/|client\/index\.js$|scripts\/)/.test(file);
const scannerConfig = (file) => /^(?:\.semgrep\/|\.github\/workflows\/security\.yml$|scripts\/securityCiPlan(?:\.test)?\.js$)/.test(file);

function createSecurityPlan({ event, schedule, files = [], base = '', head = '' }) {
  const full = event === 'workflow_dispatch' || (event === 'schedule' && schedule === WEEKLY)
    || (event === 'push' && /^0+$/.test(base));
  if (!['pull_request', 'push', 'schedule', 'workflow_dispatch'].includes(event)) {
    throw new Error(`Unsupported security event: ${event}`);
  }
  const regular = event === 'pull_request' || event === 'push';
  const audits = ['.', 'client', 'functions'].filter((workspace) => full || event === 'schedule'
    || (event === 'pull_request' && files.some((file) => (
      file === `${workspace === '.' ? '' : `${workspace}/`}package.json`
      || file === `${workspace === '.' ? '' : `${workspace}/`}package-lock.json`
      || /^scripts\/verifyDependencyAudit(?:\.test)?\.js$/.test(file)
    ))));
  const allSemgrep = full || files.some(scannerConfig);
  return {
    codeql: full || (regular && files.some((file) => isSource(file) || scannerConfig(file)
      || /(^|\/)package(?:-lock)?\.json$/.test(file) || /^\.github\/codeql\//.test(file))),
    semgrep: full || (event === 'pull_request' && files.some((file) => isSemgrepSource(file) || scannerConfig(file))),
    secrets: full || regular,
    dependencyReview: event === 'pull_request' && files.some((file) =>
      /(^|\/)package(?:-lock)?\.json$/.test(file) || /^\.github\/workflows\//.test(file)),
    dependencyAudit: audits.length > 0,
    audits,
    semgrepFiles: allSemgrep ? ['functions', 'client/src', 'client/index.js', 'scripts'] : files.filter(isSemgrepSource),
    secretLogOptions: full ? '--all -m' : (regular ? `${base}..${head} -m` : ''),
    full,
  };
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function planFromEvent(event, payload) {
  let base = '';
  let head = '';
  let files = [];
  if (event === 'pull_request') {
    base = payload.pull_request?.base?.sha;
    head = payload.pull_request?.head?.sha;
  } else if (event === 'push') {
    base = payload.before;
    head = payload.after;
  }
  if (event === 'pull_request' || event === 'push') {
    if (![base, head].every((value) => /^[a-f0-9]{40}$/.test(value || ''))) throw new Error('Missing exact Git revisions');
    if (!/^0+$/.test(base)) {
      if (event === 'pull_request') base = git(['merge-base', base, head]);
      files = git(['diff', '--name-only', '--diff-filter=ACMR', `${base}..${head}`]).split(/\r?\n/).filter(Boolean);
      // Deleted source still matters to whole-program analysis.
      const deleted = git(['diff', '--name-only', '--diff-filter=D', `${base}..${head}`]).split(/\r?\n/).filter(Boolean);
      const plan = createSecurityPlan({ event, files: [...files, ...deleted], base, head });
      plan.semgrepFiles = plan.semgrepFiles.filter((file) => fs.existsSync(file));
      if (!plan.semgrepFiles.length) plan.semgrep = false;
      return plan;
    }
  }
  return createSecurityPlan({ event, schedule: payload.schedule, files, base, head });
}

function main() {
  const action = process.argv[2] || 'plan';
  const planPath = path.resolve('.security-plan.json');
  if (action === 'plan') {
    const plan = planFromEvent(process.env.GITHUB_EVENT_NAME, JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')));
    fs.writeFileSync(planPath, JSON.stringify(plan));
    for (const key of ['codeql', 'semgrep', 'secrets', 'dependencyReview', 'dependencyAudit']) {
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${plan[key]}\n`);
    }
    console.log(JSON.stringify({ ...plan, semgrepFiles: plan.semgrepFiles.length }));
    return;
  }
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  if (action === 'secrets') {
    if (!plan.secrets || !plan.secretLogOptions) throw new Error('No secret scan range');
    execFileSync('./gitleaks', ['git', '--redact=100', '--report-format', 'sarif', '--report-path', 'gitleaks.sarif',
      '--exit-code', '1', '--timeout', '600', '--no-banner', '--no-color', '--log-opts', plan.secretLogOptions, '.'], { stdio: 'inherit' });
  } else if (action === 'semgrep') {
    if (!plan.semgrep || !plan.semgrepFiles.length) throw new Error('Empty Semgrep target inventory');
    execFileSync('semgrep', ['scan', '--metrics', 'off', '--disable-version-check', '--x-rule-validation=core-only',
      '--jobs', '2', '--timeout', '30', '--max-memory', '2048', '--exclude', '*.test.*', '--exclude', '__tests__',
      '--exclude', 'node_modules', '--json-output', 'semgrep.json', '--sarif-output', 'semgrep.sarif', '--error',
      '--config', '.semgrep/planli-security.yml', '--', ...plan.semgrepFiles], { stdio: 'inherit' });
  } else if (action === 'audit') {
    for (const workspace of plan.audits) {
      if (workspace === '.') execFileSync('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit'], { stdio: 'inherit' });
      execFileSync(process.execPath, ['scripts/verifyDependencyAudit.js', '--workspace', workspace], { stdio: 'inherit' });
    }
  } else throw new Error(`Unknown security action: ${action}`);
}

if (require.main === module) main();
module.exports = { createSecurityPlan, planFromEvent, WEEKLY };
