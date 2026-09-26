'use strict';

const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { submissionOnlyChange } = require('./nativeReleaseInputs');

function platforms(value = 'all') {
  if (value === 'all') return ['android', 'ios'];
  if (['android', 'ios'].includes(value)) return [value];
  throw new Error('Platform must be all, android or ios.');
}

function storeDestination(eas, profile = 'production') {
  const android = eas.submit?.[profile]?.android;
  if (!android?.track) throw new Error(`Submission profile ${profile} has no explicit Android track.`);
  if (profile === 'production' && android.track !== 'production') {
    throw new Error('The production submission profile must target the Google Play production track.');
  }
  if (profile !== 'production' && android.track === 'production') {
    throw new Error('A testing submission profile cannot target Google Play production.');
  }
  return android.track;
}

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function preparationKey(baseline) {
  return hash(JSON.stringify({ layout: baseline.dependencyLayout || 'junction',
    crlf: baseline.metadataCrlfSha1, lf: baseline.metadataLfSha1 || {} }));
}

function deploymentDigest(root, revision) {
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  const rows = git(['ls-tree', '-rz', revision, '--', 'client', 'shared', 'config', 'patches', 'package.json', 'package-lock.json'])
    .split('\0').filter(Boolean);
  const entries = [];
  for (const row of rows) {
    const [meta, file] = row.split('\t');
    if (/\.md$|(?:^|\/)(?:__tests__|\.maestro)\/|\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file)
      || /^config\/eas-.*-native-baseline\.json$/.test(file)) continue;
    let blob = meta.split(' ')[2];
    if (file === 'client/eas.json') {
      const { submit, ...buildConfiguration } = JSON.parse(git(['show', `${revision}:${file}`]));
      blob = hash(JSON.stringify(buildConfiguration));
    } else if (file === 'package.json') {
      const { scripts, ...dependencies } = JSON.parse(git(['show', `${revision}:${file}`]));
      blob = hash(JSON.stringify(dependencies));
    }
    entries.push([file, blob]);
  }
  if (!entries.some(([file]) => file === 'client/app.json')) throw new Error('Deployment source has no client app configuration.');
  return hash(JSON.stringify(entries));
}

function submissionOnlySince(root, base, head = 'HEAD') {
  try {
    const read = ref => execFileSync('git', ['show', `${ref}:client/eas.json`], { cwd: root, encoding: 'utf8', windowsHide: true });
    const current = head === null ? require('node:fs').readFileSync(require('node:path').join(root, 'client/eas.json'), 'utf8') : read(head);
    return submissionOnlyChange(read(base), current);
  } catch { return false; }
}

module.exports = { platforms, storeDestination, preparationKey, deploymentDigest, submissionOnlySince };
