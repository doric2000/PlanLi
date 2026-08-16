const test = require('node:test');
const assert = require('node:assert/strict');

const {
  closestScheduledAirport,
  haversineDistanceKm,
  parseOurAirportsCsv,
  downloadAirports,
  resetAirportDownloadCacheForTests,
} = require('./airportFacts');

const csv = [
  'id,ident,type,name,latitude_deg,longitude_deg,elevation_ft,continent,iso_country,iso_region,municipality,scheduled_service,icao_code,iata_code,gps_code,local_code,home_link,wikipedia_link,keywords',
  '1,LGMK,medium_airport,"Mykonos Airport, Greece",37.4351005554,25.3481006622,405,EU,GR,GR-L,"Mykonos",yes,LGMK,JMK,LGMK,,,,',
  '2,LGXX,small_airport,Small field,37.44,25.35,0,EU,GR,GR-L,Mykonos,yes,LGXX,SML,LGXX,,,,',
  '3,LGYY,large_airport,No scheduled service,37.5,25.4,0,EU,GR,GR-L,Mykonos,no,LGYY,NSS,LGYY,,,,',
  '4,LGZZ,large_airport,Missing IATA,37.6,25.5,0,EU,GR,GR-L,Mykonos,yes,LGZZ,,LGZZ,,,,',
].join('\n');

test('OurAirports parser keeps only scheduled medium/large airports with IATA', () => {
  const airports = parseOurAirportsCsv(csv);
  assert.equal(airports.length, 1);
  assert.deepEqual(airports[0], {
    ident: 'LGMK',
    type: 'medium_airport',
    name: 'Mykonos Airport, Greece',
    iataCode: 'JMK',
    coordinates: { lat: 37.4351005554, lng: 25.3481006622 },
  });
});

test('haversine distance and closest-airport selection are deterministic', () => {
  const city = { lat: 37.4467, lng: 25.3289 };
  const airports = parseOurAirportsCsv(csv);
  const distanceKm = haversineDistanceKm(city, airports[0].coordinates);
  assert.ok(distanceKm > 1 && distanceKm < 3);
  const closest = closestScheduledAirport(city, airports, { maxDistanceKm: 10 });
  assert.equal(closest.iataCode, 'JMK');
  assert.equal(
    closestScheduledAirport(city, airports, { maxDistanceKm: 1 }),
    null
  );
});

test('invalid coordinates do not produce an airport', () => {
  const airports = parseOurAirportsCsv(csv);
  assert.equal(closestScheduledAirport({}, airports), null);
  assert.equal(haversineDistanceKm({}, airports[0].coordinates), Infinity);
});

test('airport downloads share a warm bounded cache', async () => {
  resetAirportDownloadCacheForTests();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return {
      ok: true,
      headers: { get: () => 'Mon, 01 Jan 2024 00:00:00 GMT' },
      text: async () => csv,
    };
  };
  const first = await downloadAirports({ fetchImpl, url: 'https://example.test/airports.csv' });
  const second = await downloadAirports({ fetchImpl, url: 'https://example.test/airports.csv' });
  assert.equal(calls, 1);
  assert.equal(first, second);
});

test('airport download aborts after its configured timeout', async () => {
  resetAirportDownloadCacheForTests();
  const fetchImpl = (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });
  await assert.rejects(
    downloadAirports({ fetchImpl, url: 'https://example.test/slow.csv', timeoutMs: 5, useCache: false }),
    (error) => error.name === 'AbortError'
  );
});
