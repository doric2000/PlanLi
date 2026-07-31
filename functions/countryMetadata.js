const { countries, continents } = require('countries-list');

const REST_COUNTRIES_BASE_URL =
  'https://api.restcountries.com/countries/v5';
const DEFAULT_TIMEOUT_MS = 4000;
const DEFAULT_CONCURRENCY = 3;

function normalizeCountryCode(value) {
  const code = String(value || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) {
    throw new Error(`Invalid ISO alpha-2 country code: ${value || '(missing)'}`);
  }
  return code;
}

function chooseCurrency(currencyCodes, currentCurrencyCode) {
  const normalized = [...new Set(
    (Array.isArray(currencyCodes) ? currencyCodes : [])
      .map((value) => String(value || '').trim().toUpperCase())
      .filter((value) => /^[A-Z]{3}$/.test(value))
  )];
  if (normalized.length === 0) return null;

  const current = String(currentCurrencyCode || '').trim().toUpperCase();
  return normalized.includes(current) ? current : normalized[0];
}

function parseRestCountriesMetadata(
  payload,
  expectedCountryCode,
  currentCurrencyCode
) {
  const expected = normalizeCountryCode(expectedCountryCode);
  const objects = Array.isArray(payload?.data?.objects)
    ? payload.data.objects
    : [];
  const country = objects.find(
    (entry) =>
      String(entry?.codes?.alpha_2 || '').trim().toUpperCase() === expected
  );
  if (!country) {
    throw new Error(`REST Countries did not return ${expected}.`);
  }

  const region = String(country.region || '').trim();
  if (!Array.isArray(country.currencies)) {
    throw new Error(`REST Countries returned incomplete metadata for ${expected}.`);
  }
  const currencyCode = chooseCurrency(
    country.currencies?.map((currency) => currency?.code),
    currentCurrencyCode
  );
  if (!region) {
    throw new Error(`REST Countries returned incomplete metadata for ${expected}.`);
  }

  return { region, currencyCode };
}

function getLocalCountryMetadata(countryCode, currentCurrencyCode) {
  const code = normalizeCountryCode(countryCode);
  const country = countries[code];
  if (!country) {
    throw new Error(`Local country metadata does not contain ${code}.`);
  }

  const region = continents[country.continent];
  if (!Array.isArray(country.currency)) {
    throw new Error(`Local country metadata is incomplete for ${code}.`);
  }
  const currencyCode = chooseCurrency(
    country.currency,
    currentCurrencyCode
  );
  if (!region) {
    throw new Error(`Local country metadata is incomplete for ${code}.`);
  }

  return { region, currencyCode };
}

async function fetchRestCountriesMetadata({
  countryCode,
  currentCurrencyCode,
  apiKey,
  fetchImpl = global.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const code = normalizeCountryCode(countryCode);
  if (!apiKey) throw new Error('REST_COUNTRIES_KEY is not configured.');
  if (typeof fetchImpl !== 'function') {
    throw new Error('Fetch is unavailable.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = new URL(
      `${REST_COUNTRIES_BASE_URL}/codes.alpha_2/${encodeURIComponent(code)}`
    );
    url.searchParams.set(
      'response_fields',
      'codes.alpha_2,region,currencies'
    );
    const response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`REST Countries request failed with HTTP ${response.status}.`);
    }
    return parseRestCountriesMetadata(
      await response.json(),
      code,
      currentCurrencyCode
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveCountryMetadata(options) {
  try {
    const metadata = await fetchRestCountriesMetadata(options);
    return { ...metadata, source: 'rest-countries-v5' };
  } catch (apiError) {
    const metadata = getLocalCountryMetadata(
      options.countryCode,
      options.currentCurrencyCode
    );
    return {
      ...metadata,
      source: 'countries-list',
      apiError: apiError?.message || String(apiError),
    };
  }
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(1, limit), items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        // eslint-disable-next-line no-await-in-loop
        results[index] = await worker(items[index], index);
      }
    }
  );
  await Promise.all(workers);
  return results;
}

async function syncCountryMetadata({
  admin,
  apiKey,
  countryCode = null,
  apply = true,
  fetchImpl = global.fetch,
  concurrency = DEFAULT_CONCURRENCY,
}) {
  const db = admin.firestore();
  const snapshot = await db.collection('countries').get();
  const requestedCode = countryCode
    ? normalizeCountryCode(countryCode)
    : null;
  const countryDocs = snapshot.docs.filter((countryDoc) => {
    const code = String(countryDoc.data()?.code || '').toUpperCase();
    return /^[A-Z]{2}$/.test(code) && (!requestedCode || code === requestedCode);
  });
  if (requestedCode && countryDocs.length === 0) {
    throw new Error(`No country document has code ${requestedCode}.`);
  }

  const results = await mapWithConcurrency(
    countryDocs,
    concurrency,
    async (countryDoc) => {
      const before = countryDoc.data() || {};
      const code = normalizeCountryCode(before.code);
      const attemptedAt = new Date().toISOString();
      try {
        const metadata = await resolveCountryMetadata({
          countryCode: code,
          currentCurrencyCode: before.currencyCode,
          apiKey,
          fetchImpl,
        });
        const changes = {};
        if (metadata.region !== before.region) changes.region = metadata.region;
        if (metadata.currencyCode !== before.currencyCode) {
          changes.currencyCode = metadata.currencyCode;
        }

        if (apply) {
          if (Object.keys(changes).length > 0) {
            const batch = db.batch();
            batch.update(countryDoc.ref, changes);
            await batch.commit();
          }
        }

        return {
          code,
          countryPath: countryDoc.ref.path,
          changes,
          source: metadata.source,
          apiError: metadata.apiError || null,
          attemptedAt,
        };
      } catch (error) {
        return {
          code,
          countryPath: countryDoc.ref.path,
          changes: {},
          error: error?.message || String(error),
          attemptedAt,
        };
      }
    }
  );

  return {
    apply,
    requestedCode,
    processed: results.length,
    changed: results.filter(
      (result) => Object.keys(result.changes || {}).length > 0
    ).length,
    failed: results.filter((result) => result.error).length,
    results,
  };
}

module.exports = {
  DEFAULT_CONCURRENCY,
  DEFAULT_TIMEOUT_MS,
  chooseCurrency,
  fetchRestCountriesMetadata,
  getLocalCountryMetadata,
  normalizeCountryCode,
  parseRestCountriesMetadata,
  resolveCountryMetadata,
  syncCountryMetadata,
};
