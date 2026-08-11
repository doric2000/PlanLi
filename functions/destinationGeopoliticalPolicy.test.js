const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveDestinationCountryPolicy } = require('./destinationGeopoliticalPolicy');

test('independent policy registry assigns Ariel without using coordinates', () => {
  assert.deepEqual(
    resolveDestinationCountryPolicy({ names: { he: 'אריאל', en: 'Ariel' } }),
    { countryCode: 'IL', resolutionSource: 'independent-policy-registry' }
  );
});

test('Palestinian cities and Gaza are never overridden by the registry', () => {
  assert.equal(resolveDestinationCountryPolicy({ names: { en: 'Gaza' } }), null);
  assert.equal(resolveDestinationCountryPolicy({ names: { en: 'Ramallah' } }), null);
});
