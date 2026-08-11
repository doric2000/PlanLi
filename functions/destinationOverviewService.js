const { HttpsError } = require('firebase-functions/v2/https');

const WEATHER_CACHE_MS = 30 * 60 * 1000;
const CURRENCY_CACHE_MS = 24 * 60 * 60 * 1000;
const PROVIDER_TIMEOUT_MS = 5000;
const CACHE_COLLECTION = 'system/runtime/destinationOverviewCache';

function assertDocumentId(value, fieldName) {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.length > 180 || normalized.includes('/')) {
    throw new HttpsError('invalid-argument', `${fieldName} is invalid.`);
  }
  return normalized;
}

function normalizeCoordinates(value) {
  const lat = Number(value?.lat ?? value?.latitude);
  const lng = Number(value?.lng ?? value?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function dateMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toIsoString(value) {
  const millis = dateMillis(value);
  return millis ? new Date(millis).toISOString() : null;
}

function roundDistance(value) {
  const number = Number(
    typeof value === 'string'
      ? value.replace(/[^0-9.-]/g, '')
      : value
  );
  return Number.isFinite(number) && number >= 0
    ? Math.round(number * 10) / 10
    : null;
}

function normalizeClosestAirport(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const name = value.trim();
    return name ? { name } : null;
  }
  if (typeof value !== 'object') return null;

  const name = String(value.name || value.airportName || '').trim();
  const iataCode = String(
    value.iataCode || value.iata || value.code || ''
  ).trim().toUpperCase();
  if (!name && !iataCode) return null;

  const distanceKm = roundDistance(
    value.distanceKm ?? value.distance ?? value.kilometers
  );
  return {
    ...(name ? { name } : {}),
    ...(iataCode ? { iataCode } : {}),
    ...(distanceKm !== null ? { distanceKm } : {}),
    ...(value.source ? { source: String(value.source) } : {}),
    ...(value.sourceUpdatedAt
      ? { sourceUpdatedAt: toIsoString(value.sourceUpdatedAt) }
      : {}),
  };
}

function normalizeLanguages(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.map((entry) => {
    if (typeof entry === 'string') return { code: entry, labelHe: entry };
    if (!entry || typeof entry !== 'object') return null;
    const code = String(entry.code || '').trim().toLowerCase();
    const labelHe = String(entry.labelHe || entry.label || entry.native || code).trim();
    if (!code && !labelHe) return null;
    return {
      ...(code ? { code } : {}),
      ...(labelHe ? { labelHe } : {}),
    };
  }).filter((entry) => {
    if (!entry) return false;
    const key = entry.code || entry.labelHe;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeCallingCodes(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => {
    const digits = String(entry || '').replace(/[^0-9]/g, '');
    return digits ? `+${digits}` : null;
  }).filter(Boolean))];
}

function currencySymbol(currencyCode) {
  if (!currencyCode) return null;
  try {
    return new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: currencyCode,
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(0).find((part) => part.type === 'currency')?.value || null;
  } catch {
    return null;
  }
}

async function fetchJson(url, fetchImpl = global.fetch, timeoutMs = PROVIDER_TIMEOUT_MS) {
  if (typeof fetchImpl !== 'function') throw new Error('Fetch is unavailable.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}.`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWeatherFact({ coordinates, apiKey, fetchImpl = global.fetch }) {
  if (!coordinates || !apiKey) return null;
  const url = new URL('https://api.openweathermap.org/data/2.5/weather');
  url.searchParams.set('lat', String(coordinates.lat));
  url.searchParams.set('lon', String(coordinates.lng));
  url.searchParams.set('units', 'metric');
  url.searchParams.set('lang', 'he');
  url.searchParams.set('appid', apiKey);
  const payload = await fetchJson(url, fetchImpl);
  const temperatureC = Number(payload?.main?.temp);
  if (!Number.isFinite(temperatureC)) return null;
  const condition = payload?.weather?.[0] || {};
  return {
    temperatureC: Math.round(temperatureC),
    description: String(condition.description || '').trim() || null,
    conditionCode: String(condition.main || '').trim().toLowerCase() || null,
    iconCode: String(condition.icon || '').trim() || null,
    observedAt: Number.isFinite(Number(payload.dt))
      ? new Date(Number(payload.dt) * 1000).toISOString()
      : new Date().toISOString(),
    source: 'OpenWeather',
  };
}

async function fetchCurrencyFact({ currencyCode, fetchImpl = global.fetch }) {
  const code = String(currencyCode || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return null;
  if (code === 'ILS') {
    return {
      code,
      symbol: currencySymbol(code),
      ilsRate: 1,
      asOf: new Date().toISOString().slice(0, 10),
      source: 'Local currency',
    };
  }

  const payload = await fetchJson(
    'https://open.er-api.com/v6/latest/ILS',
    fetchImpl
  );
  const rate = Number(payload?.rates?.[code]);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return {
    code,
    symbol: currencySymbol(code),
    ilsRate: Math.round(rate * 10000) / 10000,
    asOf: payload.time_last_update_utc
      ? new Date(payload.time_last_update_utc).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10),
    source: 'ExchangeRate-API',
  };
}

function cacheExpiryMillis(cacheData) {
  return dateMillis(cacheData?.expiresAt);
}

async function readThroughCache({
  admin,
  cacheId,
  ttlMs,
  loader,
  nowMs = Date.now(),
}) {
  const ref = admin.firestore().doc(CACHE_COLLECTION).collection('destinationOverviewCacheItems').doc(cacheId);
  let snapshot = null;
  try {
    snapshot = await ref.get();
  } catch (error) {
    console.warn('destination_cache_read_failed', { cacheId, error: error?.message });
  }
  const cached = snapshot?.exists ? snapshot.data() : null;
  if (cached?.value && cacheExpiryMillis(cached) > nowMs) {
    return cached.value;
  }

  try {
    const value = await loader();
    if (!value) return cached?.value || null;
    const Timestamp = admin.firestore.Timestamp;
    const expiresAt = Timestamp?.fromMillis
      ? Timestamp.fromMillis(nowMs + ttlMs)
      : new Date(nowMs + ttlMs);
    const updatedAt = Timestamp?.fromMillis
      ? Timestamp.fromMillis(nowMs)
      : new Date(nowMs);
    await ref.set({ value, expiresAt, updatedAt }, { merge: true });
    return value;
  } catch (error) {
    console.warn('destination_provider_failed', { cacheId, error: error?.message });
    return cached?.value || null;
  }
}

function storedWeather(cityData) {
  const legacy = cityData?.widgets?.weather;
  const temperatureC = Number(String(legacy?.temp || '').replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(temperatureC) && !legacy?.status) return null;
  return {
    ...(Number.isFinite(temperatureC) ? { temperatureC } : {}),
    description: String(legacy?.status || '').trim() || null,
    conditionCode: null,
    iconCode: null,
    observedAt: null,
    source: 'Stored destination data',
  };
}

async function getDestinationOverview({
  admin,
  data,
  weatherApiKey,
  fetchImpl = global.fetch,
  nowMs = Date.now(),
}) {
  const countryId = assertDocumentId(data?.countryId, 'countryId');
  const cityId = assertDocumentId(data?.cityId, 'cityId');
  const db = admin.firestore();
  const [countrySnapshot, citySnapshot] = await Promise.all([
    db.doc(`countries/${countryId}`).get(),
    db.doc(`countries/${countryId}/cities/${cityId}`).get(),
  ]);
  if (!citySnapshot.exists || !countrySnapshot.exists) {
    throw new HttpsError('not-found', 'Destination was not found.');
  }

  const city = citySnapshot.data() || {};
  const country = countrySnapshot.data() || {};
  if (city.status && city.status !== 'active') {
    throw new HttpsError('not-found', 'Destination was not found.');
  }
  const coordinates = normalizeCoordinates(city.identity?.coordinates || city.coordinates);
  const currencyCode = String(country.currencyCode || '').trim().toUpperCase();
  const facts = country.travelFacts || {};

  const [fetchedWeather, currency] = await Promise.all([
    weatherApiKey && coordinates
      ? readThroughCache({
          admin,
          cacheId: `weather_${countryId}_${cityId}`,
          ttlMs: WEATHER_CACHE_MS,
          nowMs,
          loader: () => fetchWeatherFact({
            coordinates,
            apiKey: weatherApiKey,
            fetchImpl,
          }),
        })
      : Promise.resolve(storedWeather(city)),
    currencyCode
      ? readThroughCache({
          admin,
          cacheId: `currency_ILS_${currencyCode}`,
          ttlMs: CURRENCY_CACHE_MS,
          nowMs,
          loader: () => fetchCurrencyFact({ currencyCode, fetchImpl }),
        })
      : Promise.resolve(null),
  ]);
  const weather = fetchedWeather || storedWeather(city);

  const closestAirport = normalizeClosestAirport(
    city.travelFacts?.closestAirport ||
      city.closestAirport ||
      city.widgets?.airport
  );
  const languages = normalizeLanguages(facts.languages);
  const callingCodes = normalizeCallingCodes(facts.callingCodes);
  const destinationImage = city.destinationImage || null;
  const legacyImageUrl = destinationImage
    ? null
    : (city.externalImageUrl || city.imageUrl || null);

  return {
    destination: {
      cityId,
      countryId,
      name: String(city.identity?.names?.he || city.name || '').trim(),
      names: city.identity?.names || null,
      identity: city.identity || null,
      countryName: String(country.names?.he || country.name || '').trim(),
      countryCode: String(country.code || '').trim().toUpperCase() || null,
      description: null,
      destinationImage,
      heroImageUrl: legacyImageUrl,
      thumbnailUrl: legacyImageUrl,
      travelers: 0,
    },
    quickFacts: {
      weather: weather || null,
      closestAirport,
      currency: currency || null,
    },
    essentialFacts: { languages, callingCodes },
    sources: {
      ...(weather ? {
        weather: {
          name: weather.source,
          updatedAt: weather.observedAt || null,
          url: 'https://openweathermap.org/',
        },
      } : {}),
      ...(closestAirport ? {
        closestAirport: {
          name: closestAirport.source || 'OurAirports',
          updatedAt: closestAirport.sourceUpdatedAt || null,
          url: 'https://ourairports.com/data/',
        },
      } : {}),
      ...(currency ? {
        currency: {
          name: currency.source,
          updatedAt: currency.asOf || null,
          url: currency.source === 'ExchangeRate-API'
            ? 'https://www.exchangerate-api.com/'
            : null,
        },
      } : {}),
      ...((languages.length || callingCodes.length) ? {
        country: {
          name: facts.source || 'countries-list',
          updatedAt: toIsoString(facts.updatedAt),
          url: 'https://www.npmjs.com/package/countries-list',
        },
      } : {}),
    },
  };
}

module.exports = {
  CACHE_COLLECTION,
  CURRENCY_CACHE_MS,
  WEATHER_CACHE_MS,
  assertDocumentId,
  cacheExpiryMillis,
  currencySymbol,
  fetchCurrencyFact,
  fetchWeatherFact,
  getDestinationOverview,
  normalizeCallingCodes,
  normalizeClosestAirport,
  normalizeCoordinates,
  normalizeLanguages,
  readThroughCache,
};
