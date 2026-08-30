const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const firebaseConfig = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'firebase.json'),
  'utf8',
));

function contentSecurityPolicyFor(source) {
  const rule = firebaseConfig.hosting.headers.find((candidate) => candidate.source === source);
  assert.ok(rule, `Missing Hosting header rule for ${source}`);
  const header = rule.headers.find(({ key }) => key.toLowerCase() === 'content-security-policy');
  assert.ok(header, `Missing Content-Security-Policy for ${source}`);
  return header.value;
}

function parseDirectives(policy) {
  return new Map(policy.split(';').map((rawDirective) => {
    const [name, ...sources] = rawDirective.trim().split(/\s+/).filter(Boolean);
    return [name, sources];
  }).filter(([name]) => name));
}

test('admin Hosting CSP permits only the reCAPTCHA resources required by App Check', () => {
  const directives = parseDirectives(contentSecurityPolicyFor('**'));

  assert.deepEqual(directives.get('default-src'), ["'self'"]);
  assert.deepEqual(directives.get('base-uri'), ["'self'"]);
  assert.deepEqual(directives.get('object-src'), ["'none'"]);
  assert.deepEqual(directives.get('form-action'), ["'self'"]);
  assert.deepEqual(directives.get('frame-ancestors'), ["'none'"]);
  assert.deepEqual(directives.get('script-src'), [
    "'self'",
    'https://www.google.com/recaptcha/',
    'https://www.gstatic.com/recaptcha/',
  ]);
  assert.deepEqual(directives.get('frame-src'), [
    'https://*.firebaseapp.com',
    'https://accounts.google.com',
    'https://www.google.com/recaptcha/',
    'https://recaptcha.google.com/recaptcha/',
  ]);
  assert.deepEqual(directives.get('connect-src'), [
    "'self'",
    'https://*.googleapis.com',
    'https://*.firebaseio.com',
    'wss://*.firebaseio.com',
    'https://*.cloudfunctions.net',
    'https://securetoken.googleapis.com',
    'https://identitytoolkit.googleapis.com',
    'https://www.google.com/recaptcha/',
  ]);
});

test('account deletion page retains its isolated deny-by-default CSP', () => {
  const directives = parseDirectives(contentSecurityPolicyFor('/account-deletion{,/**}'));

  assert.deepEqual(directives.get('default-src'), ["'none'"]);
  assert.deepEqual(directives.get('base-uri'), ["'none'"]);
  assert.deepEqual(directives.get('form-action'), ["'none'"]);
  assert.deepEqual(directives.get('frame-ancestors'), ["'none'"]);
  assert.deepEqual(directives.get('object-src'), ["'none'"]);
});
