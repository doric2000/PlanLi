const test = require('node:test');
const assert = require('node:assert/strict');

const {
  REPAIRS,
  SOURCE,
  TARGET,
  buildPlan,
  classifyRecommendation,
  parseArguments,
} = require('./repairHoiAnRecommendationDestinations');

function document(data, exists = true) {
  return { exists, data: () => data };
}

function destination(expected, name) {
  return document({
    status: 'active',
    canonicalPolicy: { registryId: expected.registryId },
    googleCache: { names: { he: name } },
    stats: { recommendationCount: 3 },
  });
}

function recommendation(repair, destinationRef = SOURCE) {
  return document({
    status: 'active',
    destination: { countryId: destinationRef.countryId, cityId: destinationRef.cityId },
    place: { placeId: repair.placeId },
  });
}

test('Hoi An repair is dry-run by default and requires explicit production confirmation', () => {
  assert.deepEqual(parseArguments([]), {
    apply: false,
    projectId: 'planli-f0b12',
    confirmProject: '',
    requestedBy: '',
  });
  assert.equal(parseArguments(['--apply']).apply, true);
});

test('repair plan selects only exact known recommendations still assigned to Da Nang', () => {
  const plan = buildPlan({
    sourceDocument: destination(SOURCE, 'דה נאנג'),
    targetDocument: destination(TARGET, 'הוי אן'),
    recommendationDocuments: [
      recommendation(REPAIRS[0]),
      recommendation(REPAIRS[1], TARGET),
    ],
  });
  assert.deepEqual(plan.changedRecommendationIds, [REPAIRS[0].recommendationId]);
});

test('repair refuses a changed Place ID or an unrelated destination', () => {
  assert.throws(() => classifyRecommendation(document({
    status: 'active',
    destination: SOURCE,
    place: { placeId: 'unexpected' },
  }), REPAIRS[0]), /Place ID changed/);
  assert.throws(() => classifyRecommendation(document({
    status: 'active',
    destination: { countryId: 'VN', cityId: 'another-city' },
    place: { placeId: REPAIRS[0].placeId },
  }), REPAIRS[0]), /destination changed unexpectedly/);
});

test('repair plan is idempotent after both recommendations reach Hoi An', () => {
  const plan = buildPlan({
    sourceDocument: destination(SOURCE, 'דה נאנג'),
    targetDocument: destination(TARGET, 'הוי אן'),
    recommendationDocuments: REPAIRS.map((repair) => recommendation(repair, TARGET)),
  });
  assert.deepEqual(plan.changedRecommendationIds, []);
});
