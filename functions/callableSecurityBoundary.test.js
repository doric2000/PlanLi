const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('legacy non-idempotent moderateContent is not a callable or client API', () => {
  const functionsIndex = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
  const adminClient = fs.readFileSync(
    path.join(__dirname, '..', 'client', 'src', 'services', 'AdminService.js'),
    'utf8'
  );

  assert.doesNotMatch(functionsIndex, /exports\.moderateContent\s*=/);
  assert.doesNotMatch(adminClient, /call\(['"]moderateContent['"]/);
  assert.match(functionsIndex, /exports\.resolveModerationCase\s*=/);
});

test('guest-session App Check enforcement follows the staged rollout switch', () => {
  const functionsIndex = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
  const issuerBlock = functionsIndex.match(
    /exports\.issueGuestSession\s*=\s*callable\(([\s\S]*?)\n\);/
  )?.[1] || '';

  assert.match(functionsIndex, /const ENFORCE_APP_CHECK = process\.env\.PLANLI_ENFORCE_APP_CHECK === 'true';/);
  assert.match(issuerBlock, /enforceAppCheck:\s*ENFORCE_APP_CHECK/);
  assert.doesNotMatch(issuerBlock, /enforceAppCheck:\s*true/);
  assert.match(issuerBlock, /consumeAppCheckToken:\s*true/);
});
