/* Public CC0 identity data only. No Firebase or Google requests/writes. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { CURATED_CANDIDATES } = require('../data/canonicalDestinationCandidates');
const policies = require('../data/sriLankaDestinationPolicies');
const sriLankaCandidates = require('../data/sriLankaDestinationCandidates');
const { discoveryRegionForCountry } = require('../discoveryRegions');

// Direct, intentionally conservative P31 allowlist. Countries, districts,
// languages, buildings, attractions and ancient sites are not new destinations.
const SETTLEMENT_TYPES = new Set(['Q515', 'Q1549591', 'Q3957', 'Q1093829',
  'Q486972', 'Q747074', 'Q484170', 'Q15127012', 'Q42744322', 'Q7930989', 'Q3184121', 'Q532']);
const EXCLUDED_TYPES = new Set(['Q6256', 'Q3624078', 'Q1288568', 'Q839954', 'Q428995', 'Q9335']);
const REGION_TARGETS = Object.freeze({ europe: 1000, east_southeast_asia: 430,
  south_central_asia: 350, latin_america: 420, north_america: 300,
  africa: 300, oceania: 160, israel: 40 });
const fold = (value) => String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9\u05d0-\u05ea]/g, '');

function aggregateSnapshots(directory) {
  const entities = new Map();
  const files = fs.readdirSync(directory).filter((file) => /^entities-\d+\.json$/.test(file)).sort();
  const hash = crypto.createHash('sha256');
  for (const file of files) {
    const contents = fs.readFileSync(path.join(directory, file));
    hash.update(contents);
    for (const row of JSON.parse(contents).rows) {
      const id = row.item.value.split('/').pop();
      const entry = entities.get(id) || { id, en: row.en.value, he: row.he.value,
        countries: new Set(), coordinates: new Set(), types: new Set(), links: Number(row.links.value) };
      entry.countries.add(row.countryCode.value);
      entry.coordinates.add(row.coord.value);
      entry.types.add(row.type.value.split('/').pop());
      entities.set(id, entry);
    }
  }
  return { entities: [...entities.values()], snapshotSha256: hash.digest('hex'), batches: files.length };
}

function geographicCandidate(entity) {
  if (entity.countries.size !== 1 || entity.coordinates.size !== 1 ||
      !/[\u05d0-\u05ea]/.test(entity.he) || entity.en === entity.id ||
      [...entity.types].some((type) => EXCLUDED_TYPES.has(type))) return null;
  const countryCode = [...entity.countries][0];
  // Geopolitical exceptions still use PlanLi's provider/border policy at runtime.
  if (countryCode === 'PS') return null;
  const researchRegion = discoveryRegionForCountry(countryCode);
  if (!researchRegion) return null;
  const point = /^Point\(([-\d.]+) ([-\d.]+)\)$/.exec([...entity.coordinates][0]);
  if (!point) return null;
  const center = { lat: Number(point[2]), lng: Number(point[1]) };
  if (!Number.isFinite(center.lat) || !Number.isFinite(center.lng) ||
      Math.abs(center.lat) > 90 || Math.abs(center.lng) > 180) return null;
  const kind = entity.types.has('Q46169') ? 'natural_feature'
    : entity.types.has('Q23442') || entity.types.has('Q28575') ? 'island'
      : [...entity.types].some((type) => SETTLEMENT_TYPES.has(type)) ? 'city_hub' : null;
  if (!kind) return null;
  return { id: `${countryCode.toLowerCase()}-wd-${entity.id.toLowerCase()}`, countryCode,
    names: { he: entity.he, en: entity.en }, aliases: [entity.en, entity.he], kind,
    groupingPolicy: 'self', center, providerQuery: `${entity.en}, ${countryCode}`,
    researchRegion, researchSources: [
      { title: 'Wikidata — CC0 identity', url: `https://www.wikidata.org/wiki/${entity.id}` },
      { title: 'Wikivoyage destination guide', url: `https://www.wikidata.org/wiki/Special:GoToLinkedPage/enwikivoyage/${entity.id}` },
    ], research: { wikidataId: entity.id, geographicTypes: [...entity.types].sort(),
      sourceVerified: true, providerVerified: false, sitelinks: entity.links }, status: 'candidate' };
}

function buildCatalog(entities) {
  const candidates = entities.map(geographicCandidate).filter(Boolean);
  const retained = CURATED_CANDIDATES.map((entry) => ({ ...entry,
    researchRegion: discoveryRegionForCountry(entry.countryCode) }));
  const park = policies.find((entry) => entry.id === 'lk-udawalawe-national-park');
  // Retain the reviewed identity; provider geometry is still verified by enrichment.
  retained.push({ ...park, providerQuery: 'Udawalawe National Park, LK',
    researchRegion: 'south_central_asia', status: 'candidate' });
  retained.push(...sriLankaCandidates);
  const counts = {}, countryCounts = {}, keys = new Set();
  const add = (entry) => {
    counts[entry.researchRegion] = (counts[entry.researchRegion] || 0) + 1;
    countryCounts[entry.countryCode] = (countryCounts[entry.countryCode] || 0) + 1;
    [entry.names.en, entry.names.he, ...(entry.aliases || [])].forEach((name) => keys.add(`${entry.countryCode}:${fold(name)}`));
  };
  retained.forEach(add);
  for (const [region, target] of Object.entries(REGION_TARGETS)) {
    const pool = candidates.filter((entry) => entry.researchRegion === region);
    while ((counts[region] || 0) < target) {
      // Sitelinks are a coverage signal, not measured Israeli traveler popularity.
      pool.sort((a, b) => b.research.sitelinks / Math.sqrt(1 + (countryCounts[b.countryCode] || 0)) -
        a.research.sitelinks / Math.sqrt(1 + (countryCounts[a.countryCode] || 0)) || a.id.localeCompare(b.id));
      const entry = pool.shift();
      if (!entry) throw new Error(`Insufficient verified source identities for ${region}.`);
      if ([entry.names.en, entry.names.he].some((name) => keys.has(`${entry.countryCode}:${fold(name)}`))) continue;
      retained.push(entry); add(entry);
    }
  }
  return retained;
}

function run(directory, output) {
  const snapshot = aggregateSnapshots(directory);
  const entries = buildCatalog(snapshot.entities);
  fs.writeFileSync(output, `[\n${entries.map((entry) => JSON.stringify(entry)).join(',\n')}\n]\n`);
  const report = { count: entries.length, retainedIds: CURATED_CANDIDATES.length,
    sourceVerified: entries.filter((entry) => entry.research?.sourceVerified).length,
    countryCount: new Set(entries.map((entry) => entry.countryCode)).size,
    regionalCounts: REGION_TARGETS, snapshotSha256: snapshot.snapshotSha256, batches: snapshot.batches };
  console.log(JSON.stringify(report));
  return report;
}
if (require.main === module) {
  const [directory, output] = process.argv.slice(2);
  if (!directory || !output) throw new Error('Provide the research snapshot directory and output JSON path.');
  run(directory, output);
}
module.exports = { aggregateSnapshots, geographicCandidate, buildCatalog, REGION_TARGETS, run };
