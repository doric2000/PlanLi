const OUR_AIRPORTS_URL =
  'https://davidmegginson.github.io/ourairports-data/airports.csv';
const MAX_AIRPORT_DISTANCE_KM = 300;
const ALLOWED_AIRPORT_TYPES = new Set(['large_airport', 'medium_airport']);

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < String(text || '').length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows;
}

function parseOurAirportsCsv(text) {
  const rows = parseCsvRows(text);
  const headers = rows.shift() || [];
  const headerIndexes = Object.fromEntries(
    headers.map((header, index) => [header, index])
  );
  const required = [
    'ident',
    'type',
    'name',
    'latitude_deg',
    'longitude_deg',
    'scheduled_service',
    'iata_code',
  ];
  if (required.some((header) => headerIndexes[header] === undefined)) {
    throw new Error('OurAirports CSV is missing required columns.');
  }

  return rows.map((row) => {
    const type = row[headerIndexes.type];
    const iataCode = String(row[headerIndexes.iata_code] || '').trim().toUpperCase();
    const latitude = Number(row[headerIndexes.latitude_deg]);
    const longitude = Number(row[headerIndexes.longitude_deg]);
    if (!ALLOWED_AIRPORT_TYPES.has(type)) return null;
    if (row[headerIndexes.scheduled_service] !== 'yes') return null;
    if (!/^[A-Z0-9]{3}$/.test(iataCode)) return null;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return {
      ident: String(row[headerIndexes.ident] || '').trim(),
      type,
      name: String(row[headerIndexes.name] || '').trim(),
      iataCode,
      coordinates: { lat: latitude, lng: longitude },
    };
  }).filter(Boolean);
}

function radians(value) {
  return value * (Math.PI / 180);
}

function haversineDistanceKm(a, b) {
  const lat1 = Number(a?.lat ?? a?.latitude);
  const lng1 = Number(a?.lng ?? a?.longitude);
  const lat2 = Number(b?.lat ?? b?.latitude);
  const lng2 = Number(b?.lng ?? b?.longitude);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return Infinity;
  const latitudeDelta = radians(lat2 - lat1);
  const longitudeDelta = radians(lng2 - lng1);
  const value = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(lat1)) * Math.cos(radians(lat2)) *
    Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function closestScheduledAirport(cityCoordinates, airports, options = {}) {
  const maxDistanceKm = Number(
    options.maxDistanceKm ?? MAX_AIRPORT_DISTANCE_KM
  );
  let closest = null;
  for (const airport of airports || []) {
    const distanceKm = haversineDistanceKm(
      cityCoordinates,
      airport.coordinates
    );
    if (!Number.isFinite(distanceKm) || distanceKm > maxDistanceKm) continue;
    if (!closest || distanceKm < closest.distanceKm) {
      closest = { ...airport, distanceKm };
    }
  }
  return closest;
}

async function downloadAirports({
  fetchImpl = global.fetch,
  url = OUR_AIRPORTS_URL,
}) {
  if (typeof fetchImpl !== 'function') throw new Error('Fetch is unavailable.');
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`OurAirports download failed with HTTP ${response.status}.`);
  }
  const sourceUpdatedAt = response.headers?.get?.('last-modified') ||
    new Date().toISOString();
  return {
    airports: parseOurAirportsCsv(await response.text()),
    sourceUpdatedAt: new Date(sourceUpdatedAt).toISOString(),
  };
}

function normalizedCityCoordinates(value) {
  const lat = Number(value?.lat ?? value?.latitude);
  const lng = Number(value?.lng ?? value?.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function comparableAirport(value) {
  if (!value) return null;
  return {
    name: value.name || null,
    iataCode: value.iataCode || null,
    distanceKm: Number.isFinite(Number(value.distanceKm))
      ? Math.round(Number(value.distanceKm) * 10) / 10
      : null,
    sourceUpdatedAt: value.sourceUpdatedAt || null,
  };
}

async function commitInBatches(db, operations, batchSize = 450) {
  for (let index = 0; index < operations.length; index += batchSize) {
    const batch = db.batch();
    operations.slice(index, index + batchSize).forEach(({ ref, value }) => {
      batch.update(ref, { 'travelFacts.closestAirport': value });
    });
    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
  }
}

async function syncAirportFacts({
  admin,
  apply = false,
  fetchImpl = global.fetch,
  countryId = null,
  maxDistanceKm = MAX_AIRPORT_DISTANCE_KM,
}) {
  const db = admin.firestore();
  const { airports, sourceUpdatedAt } = await downloadAirports({ fetchImpl });
  const countrySnapshot = await db.collection('countries').get();
  const countries = countrySnapshot.docs.filter((document) =>
    !countryId || document.id === countryId
  );
  const operations = [];
  const results = [];

  for (const country of countries) {
    // eslint-disable-next-line no-await-in-loop
    const citySnapshot = await country.ref.collection('cities').get();
    for (const city of citySnapshot.docs) {
      const data = city.data() || {};
      if (data.status && data.status !== 'active') continue;
      const coordinates = normalizedCityCoordinates(data.coordinates);
      if (!coordinates) {
        results.push({ path: city.ref.path, status: 'skipped-no-coordinates' });
        continue;
      }
      const match = closestScheduledAirport(coordinates, airports, {
        maxDistanceKm,
      });
      const value = match ? {
        name: match.name,
        iataCode: match.iataCode,
        distanceKm: Math.round(match.distanceKm * 10) / 10,
        source: 'OurAirports',
        sourceUpdatedAt,
      } : null;
      const previous = data.travelFacts?.closestAirport || data.closestAirport;
      const changed = JSON.stringify(comparableAirport(previous)) !==
        JSON.stringify(comparableAirport(value));
      if (changed) operations.push({ ref: city.ref, value });
      results.push({
        path: city.ref.path,
        status: changed ? 'changed' : 'unchanged',
        closestAirport: value,
      });
    }
  }

  if (apply && operations.length) await commitInBatches(db, operations);
  return {
    apply,
    airports: airports.length,
    processed: results.length,
    changed: operations.length,
    sourceUpdatedAt,
    results,
  };
}

module.exports = {
  ALLOWED_AIRPORT_TYPES,
  MAX_AIRPORT_DISTANCE_KM,
  OUR_AIRPORTS_URL,
  closestScheduledAirport,
  downloadAirports,
  haversineDistanceKm,
  parseCsvRows,
  parseOurAirportsCsv,
  syncAirportFacts,
};
