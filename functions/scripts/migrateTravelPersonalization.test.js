const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  migratedSmartProfile,
  migratedRecommendation,
  parseArgs,
} = require('./migrateTravelPersonalization');

test('travel personalization migration is dry-run unless apply is explicit', () => {
  const defaults = parseArgs([]);
  assert.equal(defaults.apply, false);
  assert.equal(defaults.resume, false);
  assert.equal(defaults.rollback, null);

  const explicit = parseArgs(['--apply', '--resume', '--limit', '25', '--state-dir', './tmp-state']);
  assert.equal(explicit.apply, true);
  assert.equal(explicit.resume, true);
  assert.equal(explicit.limit, 25);
  assert.equal(explicit.stateDir, path.resolve('./tmp-state'));
});

test('legacy labels map to stable IDs without marking the user complete', () => {
  const profile = migratedSmartProfile({
    interests: ['food', 'nature', 'museums'],
    travelStyle: 'budget',
    tripType: 'זוג',
    constraints: ['shabbatObserver'],
  });

  assert.equal(profile.setupRequired, false);
  assert.equal(profile.completedAt, null);
  assert.ok(profile.interests.includes('food'));
  assert.ok(profile.interests.includes('nature_scenery'));
  assert.ok(profile.needs.includes('shabbat_friendly'));
  assert.equal(Object.prototype.hasOwnProperty.call(profile, 'pace'), false);
});

test('recommendation migration replaces display tags with IDs and separates factual facets', () => {
  const recommendation = migratedRecommendation({
    categoryId: 'food',
    tags: ['מסעדה', 'כשר', 'חב״ד'],
    budget: '$$',
    facets: {},
  });

  assert.deepEqual(recommendation.tags, ['restaurant', 'chabad_services']);
  assert.equal(recommendation.categoryId, 'food');
  assert.equal(recommendation.category, 'אוכל ובילויים');
  assert.equal(recommendation.budget, 'balanced');
  assert.ok(recommendation.facets.needs.includes('kosher'));
  assert.ok(!recommendation.facets.needs.includes('shabbat_friendly'));

  const alias = migratedRecommendation({
    categoryId: 'nature', tags: ['נקודות תצפית'], budget: '', facets: {},
  });
  assert.deepEqual(alias.tags, ['viewpoint']);
});

test('rollback always requires apply', () => {
  const options = parseArgs(['--rollback', './snapshot.jsonl']);
  assert.equal(options.apply, false);
  assert.equal(options.rollback, './snapshot.jsonl');
});

test('migration clears an invalid completion marker instead of preserving a false completed state', () => {
  const profile = migratedSmartProfile({
    completedAt: { seconds: 1 }, interests: ['food'], budget: 'balanced', travelParties: [],
  });
  assert.equal(profile.completedAt, null);
  assert.equal(profile.setupRequired, false);
});
