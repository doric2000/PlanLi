const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getHebrewCountryName,
  resolveIsraelPolicy,
  resolveLocalCountry,
  validateCountryGeography,
} = require('./countryGeography');

test('Natural Earth geography has supported ISO codes and policy areas', () => {
  assert.equal(validateCountryGeography(), true);
  assert.equal(getHebrewCountryName('IL'), 'ישראל');
});

test('Israel policy includes Ariel, East Jerusalem and the Golan Heights', () => {
  const cases = [
    { lat: 32.1045, lng: 35.1741 },
    { lat: 31.788, lng: 35.235 },
    { lat: 33.005, lng: 35.77 },
  ];
  cases.forEach((coordinates) => {
    const result = resolveIsraelPolicy(coordinates);
    assert.equal(result?.countryCode, 'IL');
    assert.equal(result?.resolutionSource, 'israel-policy');
  });
});

test('Israel policy excludes Gaza and neighboring countries', () => {
  const cases = [
    { lat: 31.5, lng: 34.45 },
    { lat: 32.0, lng: 36.0 },
    { lat: 33.5, lng: 36.3 },
    { lat: 33.8, lng: 35.8 },
  ];
  cases.forEach((coordinates) => {
    assert.equal(resolveIsraelPolicy(coordinates), null);
  });
});

test('local boundaries resolve ordinary countries without network access', () => {
  assert.equal(
    resolveLocalCountry({ lat: 48.8566, lng: 2.3522 }).countryCode,
    'FR'
  );
  assert.equal(
    resolveLocalCountry({ lat: -33.8688, lng: 151.2093 }).countryCode,
    'AU'
  );
});

test('offshore locations deterministically resolve to the nearest country', () => {
  const result = resolveLocalCountry({ lat: 36.0, lng: 14.0 });
  assert.match(result.countryCode, /^[A-Z]{2}$/);
  assert.equal(result.resolutionSource, 'nearest-country');
  assert.ok(Number.isFinite(result.distanceKm));
});

test('Antarctica remains a valid local country result', () => {
  const result = resolveLocalCountry({ lat: -80, lng: 0 });
  assert.equal(result.countryCode, 'AQ');
  assert.equal(result.resolutionSource, 'local-boundary');
});
