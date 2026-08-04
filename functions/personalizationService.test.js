const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AFFINITY_HALF_LIFE_MS,
  applyPersonalizationSignal,
  cleanFilters,
  decayFactor,
  interleaveDiscovery,
  normalizePersonalization,
  scoreRecommendation,
} = require('./personalizationService');

const NOW = 2_000_000_000_000;
const profile = {
  interests: ['food'],
  budget: 'balanced',
  travelParties: ['couple'],
  vibe: ['romantic'],
  needs: ['vegetarian'],
};
const item = {
  id: 'rec-a',
  createdAt: { toMillis: () => NOW },
  destination: { countryId: 'country-a', cityId: 'city-a' },
  stats: { likeCount: 100 },
  facets: {
    interests: ['food'],
    audiences: ['couple'],
    vibes: ['romantic'],
    needs: ['vegetarian'],
    budgetLevel: 'balanced',
  },
};

test('ranking weights add to 100 for a full declared, activity, and quality match', () => {
  const scored = scoreRecommendation(item, profile, {
    facetScores: { interests: { food: 20 } },
    destinations: [{ countryId: 'country-a', cityId: 'city-a', score: 20 }],
  }, { nowMs: NOW, maxLikes: 100 });

  assert.equal(scored.explicitScore, 55);
  assert.equal(scored.behaviorScore, 25);
  assert.equal(scored.qualityScore, 20);
  assert.equal(scored.score, 100);
  assert.deepEqual(scored.reasons, ['interest:food']);
});

test('missing ordinary facets are neutral while unknown practical needs add no boost', () => {
  const scored = scoreRecommendation({
    ...item,
    facets: {},
    stats: { likeCount: 0 },
  }, profile, {}, { nowMs: NOW, maxLikes: 100 });

  assert.equal(scored.explicitScore, 25);
});

test('affinity uses a lazy 90-day half-life and undo never drops below zero', () => {
  assert.equal(decayFactor(AFFINITY_HALF_LIFE_MS), 0.5);
  const decayed = normalizePersonalization({
    facetScores: { interests: { food: 10 } },
    updatedAtMs: NOW - AFFINITY_HALF_LIFE_MS,
  }, NOW);
  assert.equal(decayed.facetScores.interests.food, 5);

  const undone = applyPersonalizationSignal({
    existing: decayed,
    target: { type: 'recommendation', id: item.id, path: `recommendations/${item.id}` },
    targetData: item,
    delta: -50,
    action: 'unlike',
    nowMs: NOW,
  });
  assert.equal(undone.personalization.facetScores.interests.food, undefined);
});

test('recommendation opens are counted at most once per 24 hours', () => {
  const target = { type: 'recommendation', id: item.id, path: `recommendations/${item.id}` };
  const first = applyPersonalizationSignal({
    existing: {}, target, targetData: item, delta: 1, action: 'open', nowMs: NOW,
  });
  const duplicate = applyPersonalizationSignal({
    existing: first.personalization, target, targetData: item, delta: 1, action: 'open', nowMs: NOW + 1_000,
  });
  const nextDay = applyPersonalizationSignal({
    existing: duplicate.personalization, target, targetData: item, delta: 1, action: 'open', nowMs: NOW + 24 * 60 * 60 * 1000,
  });

  assert.equal(first.changed, true);
  assert.equal(duplicate.changed, false);
  assert.equal(nextDay.changed, true);
});

test('every fifth result is the best eligible discovery candidate with deterministic ties', () => {
  const scored = Array.from({ length: 10 }, (_, index) => ({
    item: { id: `rec-${String(index).padStart(2, '0')}`, createdAt: index },
    score: 100 - index,
    qualityScore: index === 9 ? 100 : index,
  }));
  const result = interleaveDiscovery(scored, 10);

  assert.equal(result[4].item.id, 'rec-09');
  assert.equal(new Set(result.map((entry) => entry.item.id)).size, 10);
});

test('manual filters stay hard constraints and reject malformed values', () => {
  assert.deepEqual(cleanFilters({
    categoryIds: ['food'], tags: ['restaurant'], budgetLevels: ['balanced'],
  }), {
    categoryIds: ['food'], tags: ['restaurant'], budgetLevels: ['balanced'],
  });
  assert.throws(() => cleanFilters({ tags: [42] }), /filters are invalid/);
  assert.throws(() => cleanFilters({ budgetLevels: ['unknown'] }), /Budget filters/);
});
