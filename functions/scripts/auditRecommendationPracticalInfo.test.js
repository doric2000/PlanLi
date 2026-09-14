const test = require('node:test');
const assert = require('node:assert/strict');

const {
  auditRecommendationPracticalInfo,
  inspectRecommendation,
  parseArgs,
} = require('./auditRecommendationPracticalInfo');

function document(id, data) {
  return { ref: { path: `recommendations/${id}` }, data: () => data };
}

test('historical practical-info audit is permanently read-only', () => {
  assert.deepEqual(parseArgs([]), { project: null, limit: Number.POSITIVE_INFINITY });
  assert.deepEqual(parseArgs(['--project', 'demo-planli', '--limit', '25']), { project: 'demo-planli', limit: 25 });
  assert.throws(() => parseArgs(['--apply']), /read-only/);
});

test('historical inference requires explicit evidence and respects category relevance', () => {
  assert.deepEqual(inspectRecommendation(document('food', {
    categoryId: 'food',
    description: 'המקום כשר ויש שירותים נגישים.',
    facets: { needs: [], practicalFacts: [] },
  })).proposals, [
    { kind: 'need', id: 'kosher', evidenceFields: ['description'] },
    { kind: 'fact', id: 'accessible_restroom', evidenceFields: ['description'] },
  ]);
  assert.deepEqual(inspectRecommendation(document('nature', {
    categoryId: 'nature', description: 'המקום כשר.',
  })).proposals, []);
  assert.deepEqual(inspectRecommendation(document('negated', {
    categoryId: 'food', description: 'המקום לא כשר ואין חניה.',
  })).proposals, []);
  assert.deepEqual(inspectRecommendation(document('existing', {
    categoryId: 'nature', description: 'חובה רכב והדרך משובשת.',
    facets: { practicalFacts: ['vehicle_required'] },
  })).proposals, [
    { kind: 'fact', id: 'rough_road', evidenceFields: ['description'] },
  ]);
});

test('audit reports candidates without exposing text or calling a write API', async () => {
  const docs = [
    document('one', { categoryId: 'stay', title: 'מלון עם יש מעלית' }),
    document('two', { categoryId: 'food', description: 'טעים ונעים.' }),
  ];
  const query = {
    orderBy: () => query,
    limit: () => query,
    startAfter: () => query,
    get: async () => ({ docs, empty: false }),
  };
  const writes = [];
  const messages = [];
  const summary = await auditRecommendationPracticalInfo({
    firestore: {
      collection: () => query,
      batch: () => { writes.push('batch'); },
    },
    limit: 2,
    log: { info: (message, details) => messages.push({ message, details }) },
  });
  assert.deepEqual(summary, { mode: 'dry-run', scanned: 2, candidates: 1, proposedValues: 1 });
  assert.equal(writes.length, 0);
  assert.equal(messages[0].details.path, 'recommendations/one');
  assert.equal(Object.hasOwn(messages[0].details, 'title'), false);
});
