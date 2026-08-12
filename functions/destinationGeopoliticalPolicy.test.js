const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveDestinationCountryPolicy } = require('./destinationGeopoliticalPolicy');

test('independent policy registry assigns Ariel without using coordinates', () => {
  assert.deepEqual(
    resolveDestinationCountryPolicy({ names: { he: 'אריאל', en: 'Ariel' } }),
    { countryCode: 'IL', resolutionSource: 'independent-policy-registry' }
  );
  assert.deepEqual(
    resolveDestinationCountryPolicy({ placeId: 'ChIJ6_6XBwsnHRURrbo12csDrug' }),
    { countryCode: 'IL', resolutionSource: 'independent-policy-registry' }
  );
});

test('Palestinian cities and Gaza are explicitly kept separate from Israel', () => {
  assert.deepEqual(
    resolveDestinationCountryPolicy({ names: { en: 'Gaza' } }),
    { countryCode: 'PS', resolutionSource: 'independent-policy-registry' }
  );
  assert.deepEqual(
    resolveDestinationCountryPolicy({ names: { en: 'Ramallah' } }),
    { countryCode: 'PS', resolutionSource: 'independent-policy-registry' }
  );
});
