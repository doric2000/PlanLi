const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  migratedSmartProfile,
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
});

test('rollback always requires apply', () => {
  const options = parseArgs(['--rollback', './snapshot.jsonl']);
  assert.equal(options.apply, false);
  assert.equal(options.rollback, './snapshot.jsonl');
});
