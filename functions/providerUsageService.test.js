const test = require('node:test');
const assert = require('node:assert/strict');
const { reserveProviderUsage } = require('./providerUsageService');
const { billingMonth, classifyProviderRequest, COLLECTION } = require('./providerUsagePolicy');
const now = Date.parse('2026-09-30T14:00:00Z');
const projectId = 'demo-planli-provider-usage';
const url = 'https://places.googleapis.com/v1/places:autocomplete';
const options = { method: 'POST' };

function record(sku, limit = 10, extra = {}) {
  return { schemaVersion: 1, projectId, period: '2026-09', sku, approvalSha256: 'a'.repeat(64), limit, baselineUsed: 0, reserved: 0, ...extra };
}
function database(records) {
  const data = new Map(records.map((r) => [`${COLLECTION}/${r.period}_${r.sku}`, structuredClone(r)]));
  let queue = Promise.resolve();
  return { data, doc: (path) => ({ path }), runTransaction(work) {
    const next = queue.then(async () => {
      const updates = [];
      const result = await work({ getAll: async (...refs) => refs.map((ref) => ({ data: () => structuredClone(data.get(ref.path)) })),
        update: (ref, patch) => updates.push([ref.path, patch]) });
      for (const [path, patch] of updates) data.set(path, { ...data.get(path), ...patch });
      return result;
    });
    queue = next.catch(() => {});
    return next;
  } };
}

test('billing months follow Pacific midnight across DST and year boundaries', () => {
  assert.equal(billingMonth('2026-10-01T06:59:59Z').period, '2026-09');
  assert.equal(billingMonth('2026-10-01T07:00:00Z').period, '2026-10');
  assert.equal(billingMonth('2026-03-20').startsAt, '2026-03-01T08:00:00.000Z');
  assert.equal(billingMonth('2026-03-20').resetsAt, '2026-04-01T07:00:00.000Z');
  assert.equal(billingMonth('2026-11-20').startsAt, '2026-11-01T07:00:00.000Z');
  assert.equal(billingMonth('2026-11-20').resetsAt, '2026-12-01T08:00:00.000Z');
  assert.equal(billingMonth('2026-12-20').resetsAt, '2027-01-01T08:00:00.000Z');
});

test('classification covers both possible session SKUs without trusting a discount', () => {
  const details = 'https://places.googleapis.com/v1/places/example';
  const opts = (mask) => ({ headers: { 'X-Goog-FieldMask': mask } });
  assert.deepEqual(classifyProviderRequest(details, opts('id,location,addressDescriptor')), ['detailsEssentials']);
  assert.deepEqual(classifyProviderRequest(details, opts('displayName,containingPlaces')), ['detailsPro']);
  assert.deepEqual(classifyProviderRequest(`${details}?sessionToken=reused`, opts('displayName')), ['detailsPro', 'detailsAtmosphere']);
  assert.throws(() => classifyProviderRequest(details, opts('reviews')), /Unreviewed/);
  assert.throws(() => classifyProviderRequest('https://places.googleapis.com.attacker.test/v1/places/x', opts('id')), /Unreviewed/);
  assert.throws(() => classifyProviderRequest('https://places.googleapis.com/v1/places:searchText', { method: 'POST' }), /Unreviewed/);
});

test('200 synthetic users cannot exceed remaining monthly capacity', async () => {
  const db = database([record('autocomplete', 100, { baselineUsed: 83 })]);
  const logs = [];
  const results = await Promise.allSettled(Array.from({ length: 200 }, () => reserveProviderUsage({
    url, options, projectId, now, db, log: (...args) => logs.push(args),
  })));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 17);
  assert.equal(results.filter((r) => r.reason?.details.reason === 'provider_monthly_limit_reached').length, 183);
  const value = [...db.data.values()][0];
  assert.equal(value.reserved, 17);
  assert.equal(value.baselineUsed, 83);
  assert.equal(logs.filter(([, data]) => data.event === 'threshold_95').length, 1);
  assert(!JSON.stringify(logs).includes('example'));
});

test('multi-SKU admission is atomic and uncertain requests are never refunded', async () => {
  const db = database([record('detailsPro', 9), record('detailsAtmosphere', 0)]);
  await assert.rejects(reserveProviderUsage({ url: 'https://places.googleapis.com/v1/places/x?sessionToken=abc',
    options: { headers: { 'X-Goog-FieldMask': 'displayName' } }, projectId, now, db, log: () => {} }),
  (e) => e.details.reason === 'provider_monthly_limit_reached' && e.details.retryable === false);
  assert.equal([...db.data.values()][0].reserved, 0);
});

test('missing month, corrupt record, unknown request or database failure all fail closed', async () => {
  for (const db of [database([]), database([record('autocomplete', 10851)]),
    database([record('autocomplete', 10, { reserved: -1 })]), { runTransaction: async () => { throw new Error('secret'); } }]) {
    const logs = [];
    await assert.rejects(reserveProviderUsage({ url, options, projectId, now, db, log: (...args) => logs.push(args) }),
      (e) => e.details.reason === 'provider_budget_unavailable' && e.details.retryable === false && !e.message.includes('secret'));
    assert.equal(logs[0][1].event, 'unavailable');
  }
  await assert.rejects(reserveProviderUsage({ url: 'https://unknown.test', projectId, now, db: database([]), log: () => {} }),
    (e) => e.details.reason === 'provider_budget_unavailable');
});

test('80 and 95 percent events are emitted only on threshold crossings', async () => {
  const db = database([record('autocomplete', 20, { baselineUsed: 15 })]);
  const events = [];
  for (let i = 0; i < 5; i++) await reserveProviderUsage({ url, options, projectId, now, db, log: (_, data) => events.push(data.event) });
  assert.deepEqual(events, ['threshold_80', 'threshold_95']);
});

test('a historical baseline above a threshold emits it once on first admission', async () => {
  const db = database([record('autocomplete', 100, { baselineUsed: 96 })]);
  const events = [];
  for (let i = 0; i < 2; i++) await reserveProviderUsage({ url, options, projectId, now, db, log: (_, data) => events.push(data.event) });
  assert.deepEqual(events, ['threshold_80', 'threshold_95']);
});

test('month rollover never sends a request with an old reservation', async () => {
  const db = database([record('autocomplete', 10)]);
  for (const time of ['2026-10-01T06:59:01Z', '2026-10-01T07:00:01Z']) {
    await assert.rejects(reserveProviderUsage({ url, options, projectId, now: Date.parse(time), db, log: () => {} }),
      (e) => e.details.reason === 'provider_budget_unavailable');
  }
  let reads = 0;
  await assert.rejects(reserveProviderUsage({ url, options, projectId, db, log: () => {},
    clock: () => Date.parse(++reads < 3 ? '2026-10-01T06:58:00Z' : '2026-10-01T07:00:01Z') }),
  (e) => e.details.reason === 'provider_budget_unavailable');
  assert.equal([...db.data.values()][0].reserved, 1); // Never refund uncertain admission.
});
