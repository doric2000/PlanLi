const test = require('node:test');
const assert = require('node:assert/strict');

const {
  completedMappings,
  parseArguments,
  repairedPersonalization,
} = require('./repairMergedDestinationPersonalization');

test('merged personalization repair is dry-run by default and production apply is explicit', () => {
  assert.deepEqual(parseArguments([]), {
    apply: false,
    projectId: 'planli-f0b12',
    confirmProject: '',
    requestedBy: '',
  });
  assert.equal(parseArguments(['--apply']).apply, true);
});

test('completed reassignment mappings collapse chains to their final canonical target', () => {
  const document = (data) => ({ data: () => data });
  const mappings = completedMappings([
    document({ status: 'complete', source: { countryId: 'A', cityId: 'one' }, target: { countryId: 'A', cityId: 'two' } }),
    document({ status: 'complete', source: { countryId: 'A', cityId: 'two' }, target: { countryId: 'A', cityId: 'three' } }),
    document({ status: 'failed', source: { countryId: 'A', cityId: 'bad' }, target: { countryId: 'A', cityId: 'three' } }),
  ]);
  assert.deepEqual(mappings[0], {
    source: { countryId: 'A', cityId: 'one' },
    target: { countryId: 'A', cityId: 'three' },
  });
  assert.equal(mappings.length, 2);
});

test('repair moves stale destination affinity while preserving unrelated profile data', () => {
  const repaired = repairedPersonalization({
    behaviorEnabled: true,
    destinations: [
      { countryId: 'NI', cityId: 'rivas', score: 6, negativeScore: 1 },
      { countryId: 'GR', cityId: 'corfu', score: 4, negativeScore: 0 },
    ],
  }, [{
    source: { countryId: 'NI', cityId: 'rivas' },
    target: { countryId: 'NI', cityId: 'ometepe' },
  }], 100);
  assert.equal(repaired.behaviorEnabled, true);
  assert.deepEqual(repaired.destinations, [
    { countryId: 'NI', cityId: 'ometepe', score: 6, negativeScore: 1, updatedAtMs: 100 },
    { countryId: 'GR', cityId: 'corfu', score: 4, negativeScore: 0 },
  ]);
});
