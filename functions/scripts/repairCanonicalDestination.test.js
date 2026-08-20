const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseArguments,
  pointInsideViewport,
  referencePlan,
  updatedRoute,
} = require('./repairCanonicalDestination');

const viewport = {
  southwest: { lat: 40.38, lng: 19.4 },
  northeast: { lat: 40.55, lng: 19.6 },
};

function document(path, data) {
  return { id: path.split('/').at(-1), ref: { path }, data: () => data };
}

test('canonical repair defaults to dry-run and requires explicit apply', () => {
  assert.deepEqual(parseArguments([
    '--country', 'AL', '--source-city', 'old', '--target-place-id', 'new',
  ]), { apply: false, countryId: 'AL', sourceCityId: 'old', targetPlaceId: 'new' });
  assert.equal(parseArguments(['--apply']).apply, true);
});

test('coordinate containment supports ordinary and antimeridian viewports', () => {
  assert.equal(pointInsideViewport({ lat: 40.4146, lng: 19.4812 }, viewport), true);
  assert.equal(pointInsideViewport({ lat: 41, lng: 19.48 }, viewport), false);
  assert.equal(pointInsideViewport({ lat: 0, lng: 179 }, {
    southwest: { lat: -1, lng: 170 }, northeast: { lat: 1, lng: -170 },
  }), true);
});

test('repair plan rejects unexpected coordinates and guards source retirement', () => {
  const good = document('recommendations/good', {
    destination: { countryId: 'AL' }, place: { coordinates: { lat: 40.4146, lng: 19.4812 } },
  });
  const bad = document('recommendations/bad', {
    destination: { countryId: 'AL' }, place: { coordinates: { lat: 41, lng: 19.48 } },
  });
  const plan = referencePlan({
    recommendations: [good, bad], stops: [], routes: [], trips: [],
    favorites: [document('users/u/favorites/f', {})], viewport,
  });
  assert.deepEqual(plan.validRecommendations.map((entry) => entry.id), ['good']);
  assert.deepEqual(plan.invalidRecommendations.map((entry) => entry.id), ['bad']);
  assert.equal(plan.canRetireSource, false);
});

test('route aggregate replacement is idempotent and deduplicated', () => {
  const route = {
    destinations: [
      { countryId: 'AL', cityId: 'old', cityName: 'Vlorë' },
      { countryId: 'AL', cityId: 'new', cityName: 'ולורה' },
    ],
    destinationKeys: ['AL:*', 'AL:old', 'AL:new'],
  };
  const target = { countryId: 'AL', cityId: 'new', countryName: 'אלבניה', cityName: 'ולורה' };
  const result = updatedRoute(route, 'AL', 'old', target);
  assert.deepEqual(result.destinationKeys, ['AL:*', 'AL:new']);
  assert.deepEqual(result.destinations, [target]);
});
