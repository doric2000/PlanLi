const assert = require('node:assert/strict');
const test = require('node:test');

const { sanitizeEnvironmentText } = require('./sanitizeLocalEnvironment');

test('removes only deprecated unused public variables without exposing values', () => {
  const result = sanitizeEnvironmentText([
    'EXPO_PUBLIC_FIREBASE_PROJECT_ID=staging-project',
    'EXPO_PUBLIC_GOOGLE_MAPS_KEY=sensitive-value',
    'EXPO_PUBLIC_WEATHER_API_KEY=another-sensitive-value',
    'EXPO_PUBLIC_MAPTILER_KEY=public-token',
    '',
  ].join('\r\n'));
  assert.deepEqual(result.removed, [
    'EXPO_PUBLIC_GOOGLE_MAPS_KEY',
    'EXPO_PUBLIC_WEATHER_API_KEY',
  ]);
  assert.equal(result.output, [
    'EXPO_PUBLIC_FIREBASE_PROJECT_ID=staging-project',
    'EXPO_PUBLIC_MAPTILER_KEY=public-token',
    '',
  ].join('\r\n'));
});

test('preserves comments, blank lines, similarly named variables, and final newline state', () => {
  const source = '# local\nEXPO_PUBLIC_GOOGLE_MAPS_KEY_SUFFIX=keep\n\n';
  assert.deepEqual(sanitizeEnvironmentText(source), { output: source, removed: [] });
});
