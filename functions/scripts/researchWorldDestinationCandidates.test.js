const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { research } = require('./researchWorldDestinationCandidates');

function workspace(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'planli-research-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function response(rows) {
  return { ok: true, json: async () => ({ results: { bindings: rows } }) };
}

const item = (id) => ({ item: { value: `http://www.wikidata.org/entity/${id}` } });

test('concurrent research runs share complete snapshots and the winning ID order', async (t) => {
  const directory = workspace(t);
  let indexes = 0;
  const queries = [];
  const fetchImpl = async (url) => {
    const query = new URL(url).searchParams.get('query');
    if (!query.includes('VALUES')) {
      indexes += 1;
      return response([item(indexes === 1 ? 'Q1' : 'Q2')]);
    }
    queries.push(query);
    return response([item('Q1')]);
  };
  const results = await Promise.all([
    research({ directory, fetchImpl }), research({ directory, fetchImpl }),
  ]);
  assert.equal(indexes, 2);
  assert.ok(results.every((result) => result.entityCount === 1 && !result.errors.length));
  assert.ok(queries.length > 0);
  assert.ok(queries.every((query) => query.includes('wd:Q1') && !query.includes('wd:Q2')));
  assert.deepEqual(fs.readdirSync(directory).sort(), ['entities-0000.json', 'wikivoyage-ids.json']);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, 'entities-0000.json'))).rows, [item('Q1')]);
  const before = fs.readFileSync(path.join(directory, 'entities-0000.json'), 'utf8');
  await research({ directory, fetchImpl: () => { throw new Error('Completed cache must not refetch'); } });
  assert.equal(fs.readFileSync(path.join(directory, 'entities-0000.json'), 'utf8'), before);
});

test('a failed batch leaves no completed snapshot and is retried on resume', async (t) => {
  const directory = workspace(t);
  const first = await research({ directory, fetchImpl: async (url) => {
    if (new URL(url).searchParams.get('query').includes('VALUES')) throw new Error('Temporary outage');
    return response([item('Q1')]);
  } });
  assert.equal(first.errors.length, 1);
  assert.deepEqual(fs.readdirSync(directory), ['wikivoyage-ids.json']);
  let requests = 0;
  const resumed = await research({ directory, fetchImpl: async () => {
    requests += 1;
    return response([item('Q1')]);
  } });
  assert.equal(requests, 1);
  assert.deepEqual(resumed.errors, []);
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'entities-0000.json'))).rows.length, 1);
});

test('malformed existing snapshots fail visibly without overwriting the evidence', async (t) => {
  const directory = workspace(t);
  fs.writeFileSync(path.join(directory, 'wikivoyage-ids.json'), JSON.stringify([item('Q1')]));
  const file = path.join(directory, 'entities-0000.json');
  fs.writeFileSync(file, '{partial');
  await assert.rejects(research({ directory, fetchImpl: () => {
    throw new Error('Corrupt cache must not be silently replaced');
  } }), SyntaxError);
  assert.equal(fs.readFileSync(file, 'utf8'), '{partial');
});
