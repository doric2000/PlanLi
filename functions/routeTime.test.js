const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeRouteTime } = require('./routeTime');

test('route time accepts a one-digit hour and normalizes it', () => {
  assert.equal(normalizeRouteTime('8:30'), '08:30');
  assert.equal(normalizeRouteTime('08:30'), '08:30');
  assert.equal(normalizeRouteTime(''), '');
  assert.equal(normalizeRouteTime('24:00'), null);
});
