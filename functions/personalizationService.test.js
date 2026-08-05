const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AFFINITY_HALF_LIFE_MS,
  applyPersonalizationSignal,
  cleanDestinations,
  cleanFilters,
  decayFactor,
  interleaveDiscovery,
  matchesFilters,
  normalizePersonalization,
  rankPersonalizedResults,
  resetPersonalizationActivity,
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
	needsScope: 'recommendation',
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

test('text search keeps strict relevance order and does not inject discovery slots', () => {
  const scored = Array.from({ length: 6 }, (_, index) => ({
    item: { id: `rec-${index}` },
    rankingScore: 100 - index,
    textScore: 10 - index,
    qualityScore: index === 5 ? 100 : 0,
  }));

  const result = rankPersonalizedResults(scored, 6, { hasQuery: true });
  assert.deepEqual(result.map((entry) => entry.item.id), [
    'rec-0', 'rec-1', 'rec-2', 'rec-3', 'rec-4', 'rec-5',
  ]);
});

test('manual filters stay hard constraints and reject malformed values', () => {
  assert.deepEqual(cleanFilters({
    categoryIds: ['food'], tags: ['restaurant'], budgetLevels: ['balanced'],
  }), {
    categoryIds: ['food'],
    subcategoryIds: ['restaurant'],
    audienceIds: [],
    vibeIds: [],
    needIds: [],
    budgetLevels: ['balanced'],
    environments: [],
  });
  assert.throws(() => cleanFilters({ tags: [42] }), /subcategoryIds must be a string/);
  assert.throws(() => cleanFilters({ budgetLevels: ['unknown'] }), /budgetLevels is invalid/);
});

test('route filters use OR within each group and AND between groups', () => {
  const filters = cleanFilters({
    categoryIds: ['nature', 'food'],
    transportModeIds: ['car', 'walking'],
    difficultyIds: ['easy', 'moderate'],
    durationDays: { min: 2, max: 5 },
    distanceKm: { min: 10, max: 100 },
  }, { route: true });
  const route = {
    categoryIds: ['nature'], subcategoryIds: ['hiking'], difficulty: 'moderate',
    transportModes: ['walking'], dayCount: 3, distanceKm: 25, pace: 'balanced',
    facets: {
      interests: ['hiking'], audiences: [], vibes: [], travelerStyles: [], needs: [],
      budgetLevel: 'balanced', seasons: [], environments: ['outdoor'],
    },
  };
  assert.equal(matchesFilters(route, filters, { route: true }), true);
  assert.equal(matchesFilters({ ...route, transportModes: ['boat'] }, filters, { route: true }), false);
  assert.equal(matchesFilters({ ...route, dayCount: 8 }, filters, { route: true }), false);
});

test('verified practical needs are hard constraints and missing metadata never matches', () => {
  const filters = cleanFilters({ needIds: ['kosher', 'vegan'] });
  const base = { categoryId: 'food', tags: [], facets: { interests: ['food'], needs: [] } };
  assert.equal(matchesFilters(base, filters), false);
	assert.equal(matchesFilters({
		...base,
		facets: { ...base.facets, needs: ['vegan'], needsScope: 'recommendation' },
	}, filters), true);
});

test('global destination selection allows five OR choices while context remains hard', () => {
  const five = Array.from({ length: 5 }, (_, index) => ({ countryId: `country-${index}`, cityId: '' }));
  assert.deepEqual(cleanDestinations({ destinations: five }).destinations, five);
  assert.throws(() => cleanDestinations({ destinations: [...five, { countryId: 'country-6' }] }), /destinations/);
  assert.deepEqual(cleanDestinations({
    destinations: five,
    context: { countryId: 'context-country', cityId: 'context-city' },
  }), {
    destinations: [{ countryId: 'context-country', cityId: 'context-city' }],
    context: { countryId: 'context-country', cityId: 'context-city' },
  });
});

test('reset clears learned activity while preserving declared preferences and seed metadata', async () => {
  const existingProfile = {
    interests: ['food'], budget: 'balanced', travelParties: ['couple'],
  };
  let writtenPatch;
  const firestore = () => ({
    doc: (path) => {
      assert.equal(path, 'users/user-1');
      return {
        get: async () => ({
          exists: true,
          data: () => ({
            smartProfile: existingProfile,
            personalization: {
              historySeedVersion: 'travel-taxonomy-v3',
              facetScores: { interests: { food: 9 } },
              destinations: [{ countryId: 'country-a', score: 5 }],
            },
          }),
        }),
        set: async (patch, options) => {
          writtenPatch = patch;
          assert.deepEqual(options, { merge: true });
        },
      };
    },
  });
  firestore.FieldValue = { serverTimestamp: () => 'server-timestamp' };

  const result = await resetPersonalizationActivity({
    admin: { firestore },
    auth: { uid: 'user-1' },
  });

  assert.deepEqual(result, { reset: true });
  assert.equal(writtenPatch.smartProfile, undefined);
  assert.deepEqual(writtenPatch.personalization.facetScores, {
    interests: {}, audiences: {}, vibes: {}, travelerStyles: {}, needs: {},
  });
  assert.deepEqual(writtenPatch.personalization.destinations, []);
  assert.deepEqual(writtenPatch.personalization.recentOpens, []);
  assert.equal(writtenPatch.personalization.historySeedVersion, 'travel-taxonomy-v3');
});
