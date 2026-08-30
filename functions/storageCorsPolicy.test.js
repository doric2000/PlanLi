const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

function readConfig(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', name), 'utf8'));
}

test('production Storage CORS excludes development and wildcard origins', () => {
  const entries = readConfig('storage.cors.json');
  const origins = entries.flatMap((entry) => entry.origin || []);
  assert.deepEqual(origins.sort(), [
    'https://planli-f0b12.firebaseapp.com',
    'https://planli-f0b12.web.app',
  ]);
  assert.equal(origins.some((origin) => /localhost|127\.0\.0\.1|\*/.test(origin)), false);
  assert.equal(entries.every((entry) => (entry.method || []).includes('DELETE')), true);
});

test('staging Storage CORS contains local development origins only', () => {
  const entries = readConfig('storage.cors.staging.json');
  const origins = entries.flatMap((entry) => entry.origin || []);
  assert.ok(origins.length > 0);
  assert.equal(origins.every((origin) => /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)), true);
});
