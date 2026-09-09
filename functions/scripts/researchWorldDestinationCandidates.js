/* eslint-disable no-console */
// Public-source research only. This script never initializes Firebase or writes
// live records. Source snapshots are resumable and remain outside version control.
const fs = require('node:fs');
const path = require('node:path');
const USER_AGENT = 'PlanLi/1.0 (https://github.com/doric2000/PlanLi; destination research)';
const ENDPOINT = 'https://query.wikidata.org/sparql';

async function queryWikidata(query, fetchImpl = global.fetch) {
  const response = await fetchImpl(`${ENDPOINT}?format=json&query=${encodeURIComponent(query)}`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/sparql-results+json' },
    signal: AbortSignal.timeout(55_000),
  });
  if (!response.ok) throw new Error(`Wikidata query failed (${response.status}).`);
  const data = await response.json();
  if (!Array.isArray(data?.results?.bindings)) throw new Error('Invalid Wikidata result.');
  return data.results.bindings;
}

async function research({ directory, fetchImpl = global.fetch } = {}) {
  if (!directory) throw new Error('An explicit output directory is required.');
  fs.mkdirSync(directory, { recursive: true });
  const idsPath = path.join(directory, 'wikivoyage-ids.json');
  let ids;
  if (fs.existsSync(idsPath)) {
    const raw = JSON.parse(fs.readFileSync(idsPath, 'utf8'));
    ids = (raw.results?.bindings || raw).map((row) => row.item.value.split('/').pop());
  } else {
    const rows = await queryWikidata('SELECT DISTINCT ?item WHERE { ?a schema:about ?item; schema:isPartOf <https://en.wikivoyage.org/> }', fetchImpl);
    fs.writeFileSync(idsPath, JSON.stringify(rows));
    ids = rows.map((row) => row.item.value.split('/').pop());
  }
  ids = [...new Set(ids)].filter((id) => /^Q\d+$/.test(id));
  const chunks = Array.from({ length: Math.ceil(ids.length / 200) }, (_, i) => ids.slice(i * 200, (i + 1) * 200));
  let cursor = 0;
  const errors = [];
  async function worker() {
    while (cursor < chunks.length) {
      const index = cursor++;
      const file = path.join(directory, `entities-${String(index).padStart(4, '0')}.json`);
      if (fs.existsSync(file)) continue;
      const values = chunks[index].map((id) => `wd:${id}`).join(' ');
      const query = `SELECT DISTINCT ?item ?en ?he ?countryCode ?coord ?type ?links WHERE {
        VALUES ?item { ${values} }
        ?item wdt:P17/wdt:P297 ?countryCode; wdt:P625 ?coord; wdt:P31 ?type; wikibase:sitelinks ?links.
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". ?item rdfs:label ?en. }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "he". ?item rdfs:label ?he. }
      }`;
      try {
        const rows = await queryWikidata(query, fetchImpl);
        fs.writeFileSync(file, JSON.stringify({ fetchedAt: new Date().toISOString(), query, rows }));
        if (index % 10 === 0) console.log(`Research ${index + 1}/${chunks.length}`);
      } catch (error) {
        errors.push({ index, message: error.message });
        console.log(`Research batch ${index} incomplete: ${error.message}`);
        if (errors.length >= 3) { cursor = chunks.length; return; }
      }
    }
  }
  await Promise.all([worker(), worker()]);
  const result = { entityCount: ids.length, batches: chunks.length, errors };
  console.log(JSON.stringify(result));
  return result;
}

if (require.main === module) {
  const index = process.argv.indexOf('--output');
  research({ directory: index < 0 ? '' : process.argv[index + 1] }).catch((error) => {
    console.error(error.message); process.exitCode = 1;
  });
}
module.exports = { queryWikidata, research };
