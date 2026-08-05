const test = require('node:test');
const assert = require('node:assert/strict');

const { inspectValue } = require('./auditLiveState');

test('live audit rejects rating fields at every object depth', () => {
  const report = {
    forbiddenFields: [],
    usReferences: [],
    euReferenceCount: 0,
  };

  inspectValue({
    rating: 4.8,
    preview: { metrics: { rating: 0 } },
    entries: [{ rating: 3 }],
  }, 'recommendations/one', '', report);

  assert.deepEqual(
    report.forbiddenFields.map((entry) => entry.field),
    ['rating', 'preview.metrics.rating', 'entries[0].rating']
  );
});
