const test = require('node:test');
const assert = require('node:assert/strict');

const {
  fetchCurrencyFact,
  fetchWeatherFact,
  getDestinationOverview,
  normalizeClosestAirport,
  normalizeCoordinates,
  readThroughCache,
} = require('./destinationOverviewService');

function createAdmin(seed = {}) {
  const documents = new Map(Object.entries(seed));
  const makeSnapshot = (path) => ({
    exists: documents.has(path),
    data: () => documents.get(path),
  });
  const makeRef = (path) => ({
    path,
    get: async () => makeSnapshot(path),
    set: async (value, options) => {
      const previous = options?.merge ? documents.get(path) || {} : {};
      documents.set(path, { ...previous, ...value });
    },
    collection: (name) => ({ doc: (id) => makeRef(`${path}/${name}/${id}`) }),
  });
  const db = {
    doc: makeRef,
    collection: (path) => ({ doc: (id) => makeRef(`${path}/${id}`) }),
  };
  const firestore = () => db;
  firestore.Timestamp = {
    fromMillis: (value) => ({ toMillis: () => value }),
  };
  return { documents, firestore };
}

test('coordinates and legacy airport values normalize safely', () => {
  assert.deepEqual(normalizeCoordinates({ latitude: 1, longitude: 2 }), {
    lat: 1,
    lng: 2,
  });
  assert.equal(normalizeCoordinates({ lat: 200, lng: 2 }), null);
  assert.deepEqual(normalizeClosestAirport({
    airportName: 'Mykonos Airport',
    iata: 'jmk',
    distance: '2.34 km',
  }), {
    name: 'Mykonos Airport',
    iataCode: 'JMK',
    distanceKm: 2.3,
  });
});

test('weather and currency providers are converted to public facts', async () => {
  const weather = await fetchWeatherFact({
    coordinates: { lat: 37.44, lng: 25.33 },
    apiKey: 'secret',
    fetchImpl: async (url) => {
      assert.match(String(url), /lang=he/);
      return {
        ok: true,
        json: async () => ({
          main: { temp: 23.7 },
          weather: [{ description: 'בהיר', main: 'Clear', icon: '01d' }],
          dt: 1_700_000_000,
        }),
      };
    },
  });
  assert.equal(weather.temperatureC, 24);
  assert.equal(weather.conditionCode, 'clear');
  assert.equal(weather.source, 'OpenWeather');

  const currency = await fetchCurrencyFact({
    currencyCode: 'EUR',
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        rates: { EUR: 0.25123 },
        time_last_update_utc: 'Wed, 05 Aug 2026 00:00:01 +0000',
      }),
    }),
  });
  assert.equal(currency.code, 'EUR');
  assert.equal(currency.ilsRate, 0.2512);
  assert.equal(currency.asOf, '2026-08-05');
});

test('cache uses fresh values and falls back to stale values on provider failure', async () => {
  const nowMs = 10_000;
  const admin = createAdmin({
    'system/runtime/destinationOverviewCache/fresh': {
      value: { answer: 'fresh' },
      expiresAt: { toMillis: () => nowMs + 1_000 },
    },
    'system/runtime/destinationOverviewCache/stale': {
      value: { answer: 'stale' },
      expiresAt: { toMillis: () => nowMs - 1 },
    },
  });
  let calls = 0;
  const fresh = await readThroughCache({
    admin,
    cacheId: 'fresh',
    ttlMs: 100,
    nowMs,
    loader: async () => {
      calls += 1;
      return { answer: 'provider' };
    },
  });
  assert.deepEqual(fresh, { answer: 'fresh' });
  assert.equal(calls, 0);

  const stale = await readThroughCache({
    admin,
    cacheId: 'stale',
    ttlMs: 100,
    nowMs,
    loader: async () => {
      throw new Error('offline');
    },
  });
  assert.deepEqual(stale, { answer: 'stale' });
});

test('destination overview exposes only supported automatic facts', async () => {
  const admin = createAdmin({
    'countries/gr': {
      name: 'יוון',
      code: 'GR',
      status: 'active',
      currencyCode: 'EUR',
      travelFacts: {
        languages: [{ code: 'el', labelHe: 'יוונית' }],
        callingCodes: ['+30'],
        source: 'countries-list',
      },
    },
    'countries/gr/destinations/mykonos': {
      name: 'מיקונוס',
      status: 'active',
      canonicalPolicy: {
        approved: true,
        registryId: 'gr-mykonos',
        kind: 'island',
        groupingPolicy: 'self',
        registryVersion: 3,
        approvalRevision: 1,
        registryAttestation: {
          approved: true, registryId: 'gr-mykonos', registryVersion: 3,
          approvalRevision: 1, countryId: 'gr',
        },
      },
      travelers: 128,
      coordinates: { lat: 37.44, lng: 25.33 },
      travelFacts: {
        closestAirport: {
          name: 'Mykonos Airport',
          iataCode: 'JMK',
          distanceKm: 2.1,
          source: 'OurAirports',
          sourceUpdatedAt: '2026-08-04T00:00:00.000Z',
        },
      },
      essentialInfo: { hotel: 'Must not leak', driver: 'Must not leak' },
      widgets: { sim: { provider: 'Must not leak' } },
    },
  });
  const fetchImpl = async (url) => {
    if (String(url).includes('openweathermap')) {
      return {
        ok: true,
        json: async () => ({
          main: { temp: 24 },
          weather: [{ description: 'בהיר', main: 'Clear' }],
          dt: 1_775_000_000,
        }),
      };
    }
    return {
      ok: true,
      json: async () => ({ rates: { EUR: 0.25 } }),
    };
  };
  const result = await getDestinationOverview({
    admin,
    data: { countryId: 'gr', cityId: 'mykonos' },
    weatherApiKey: 'secret',
    fetchImpl,
    nowMs: Date.parse('2026-08-05T12:00:00.000Z'),
  });
  assert.equal(result.destination.name, 'מיקונוס');
  assert.equal(result.quickFacts.weather.temperatureC, 24);
  assert.equal(result.quickFacts.closestAirport.iataCode, 'JMK');
  assert.equal(result.quickFacts.currency.code, 'EUR');
  assert.deepEqual(result.essentialFacts.callingCodes, ['+30']);
  assert.equal(JSON.stringify(result).includes('Must not leak'), false);
});
