const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'planli-eas-test-'));
  t.after(() => {
    const resolved = fs.realpathSync(root);
    if (!resolved.startsWith(fs.realpathSync(os.tmpdir()) + path.sep) || !path.basename(resolved).startsWith('planli-eas-test-')) throw new Error('Unsafe test cleanup path');
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  for (const file of ['client/app.json', 'client/eas.json', 'config/eas-ios-native-baseline.json']) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.copyFileSync(path.join(__dirname, '../..', file), path.join(root, file));
  }
  fs.writeFileSync(path.join(root, 'README.md'), '# Test release\n');
  const head = 'a'.repeat(40);
  const group = '11111111-2222-4333-8444-555555555555';
  const calls = [];
  const native = { status: 'exact', fingerprint: 'b'.repeat(40) };
  const updates = [{ id: 'candidate-id', branch: 'staging', gitCommitHash: head, runtimeVersion: '1.3.0', group, platform: 'ios' }];
  const dependencies = {
    prepareSource: () => ({ repoRoot: root, sourceRoot: root, commit: head }),
    runPreflight: () => ({ head, deployedCommit: 'c'.repeat(40) }),
    verifySource: () => {},
    verifyLocalNative: () => { calls.push(['native-local']); return native; },
    verifyPreviewNative: () => { calls.push(['native-preview']); return native; },
    verifyArtifact: async () => { calls.push(['artifact']); return { sha256: 'digest', updateId: 'update', bytes: 1 }; },
    createEasRunner: () => args => {
      calls.push(args);
      if (args[0] === '--version') return 'eas-cli/22.6.0';
      if (args[0] === 'whoami') return 'doric2000';
      if (args[0] === 'update:view') return JSON.stringify(updates);
      if (args[0] === 'update') return `Update group ID ${group}`;
      throw new Error(`Unexpected command: ${args[0]}`);
    },
  };
  return { root, head, group, calls, dependencies };
}
module.exports = { fixture };
