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

test('Gaza remains separate while Ramallah is left to the coordinate policy gate', () => {
  assert.deepEqual(
    resolveDestinationCountryPolicy({ names: { en: 'Gaza' } }),
    { countryCode: 'PS', resolutionSource: 'independent-policy-registry' }
  );
  assert.equal(resolveDestinationCountryPolicy({ names: { en: 'Ramallah' } }), null);
});
