const { HttpsError } = require('firebase-functions/v2/https');
const { hasUsableDestinationCache } = require('./destinationCacheService');

const COMBINING_MARKS = /[\u0300-\u036f\u0591-\u05C7]/g;
const NON_ALPHANUMERIC = /[^a-z0-9\u05D0-\u05EA]+/gi;
const HEBREW_FINAL_LETTERS = Object.freeze({ ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' });
const MAX_CATALOG_PREFIXES = 160;
const MAX_PREFIX_LENGTH = 16;

function foldDestinationSearchText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/[ךםןףץ]/g, (letter) => HEBREW_FINAL_LETTERS[letter] || letter);
}

function normalizeDestinationSearchText(value) {
  return foldDestinationSearchText(value)
    .replace(NON_ALPHANUMERIC, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function compactDestinationSearchText(value) {
  return normalizeDestinationSearchText(value).replace(/\s+/g, '');
}

function destinationSearchForms(value) {
  const folded = foldDestinationSearchText(value);
  const normalized = normalizeDestinationSearchText(folded);
  return Array.from(new Set([
    compactDestinationSearchText(normalized),
    ...folded.split(/\s+/).map((chunk) => chunk.replace(NON_ALPHANUMERIC, '')),
    ...normalized.split(' '),
  ].filter(Boolean)));
}

function prefixes(...values) {
  const output = new Set();
  values.forEach((value) => destinationSearchForms(value).forEach((form) => {
    for (let size = 2; size <= Math.min(MAX_PREFIX_LENGTH, form.length); size += 1) {
      output.add(form.slice(0, size));
    }
  }));
  return [...output].slice(0, MAX_CATALOG_PREFIXES);
}

function catalogId(countryId, cityId) {
  return `${countryId}_${cityId}`;
}

function catalogData({ countryId, cityId, city, country, timestamp }) {
  const names = city?.googleCache?.names || city?.identity?.names || { he: city?.name || cityId, en: city?.name || cityId };
  const countryNames = country?.names || { he: country?.name || countryId, en: country?.name || countryId };
  return {
    countryId,
    cityId,
    status: city?.status === 'active' && country?.status === 'active' ? 'active' : 'inactive',
    names,
    countryNames,
    search: { prefixes: prefixes(names.he, names.en, countryNames.he, countryNames.en) },
    recommendationCount: Math.max(0, Number(city?.stats?.recommendationCount || 0)),
    destinationImage: city?.destinationImage || null,
    cacheExpiresAt: city?.googleCache?.expiresAt || null,
    updatedAt: timestamp,
  };
}

async function syncDestinationCatalog({ admin, countryId, cityId, city }) {
  const db = admin.firestore();
  const country = (await db.doc(`countries/${countryId}`).get()).data() || {};
  const ref = db.doc(`destinationCatalog/${catalogId(countryId, cityId)}`);
  const timestamp = admin.firestore.FieldValue.serverTimestamp();
  if (!city || city.status !== 'active' || country.status !== 'active' || !hasUsableDestinationCache(city)) {
    await ref.delete();
    return null;
  }
  const data = catalogData({ countryId, cityId, city, country, timestamp });
  await ref.set(data);
  return data;
}

async function syncCountryDestinationCatalog({ admin, countryId, country, limit = 100 }) {
  const db = admin.firestore();
  let cursor = null;
  let processed = 0;
  do {
    let query = db.collection(`countries/${countryId}/destinations`)
      .orderBy('__name__')
      .limit(limit);
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    if (snapshot.empty) break;
    const batch = db.batch();
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    snapshot.docs.forEach((cityDocument) => {
      const ref = db.doc(`destinationCatalog/${catalogId(countryId, cityDocument.id)}`);
      const city = cityDocument.data();
      if (!country || country.status !== 'active' || city.status !== 'active' || !hasUsableDestinationCache(city)) {
        batch.delete(ref);
      } else {
        batch.set(ref, catalogData({
          countryId,
          cityId: cityDocument.id,
          city,
          country,
          timestamp,
        }));
      }
    });
    await batch.commit();
    processed += snapshot.size;
    cursor = snapshot.docs.at(-1);
    if (snapshot.size < limit) break;
  } while (cursor);
  return { processed };
}

function filterCatalogByActiveCountries(documents, activeCountryIds, nowMs = Date.now()) {
  return documents.filter((document) => {
    const data = document.data() || {};
    const expiry = data.cacheExpiresAt;
    const expiryMs = typeof expiry?.toMillis === 'function'
      ? expiry.toMillis()
      : expiry instanceof Date ? expiry.getTime() : Date.parse(expiry) || 0;
    return activeCountryIds.has(data.countryId) && expiryMs > nowMs;
  });
}

function cleanLimit(value) {
  const limit = Number(value || 20);
  if (!Number.isInteger(limit) || limit < 1 || limit > 30) throw new HttpsError('invalid-argument', 'limit is invalid.');
  return limit;
}

async function getCatalogSnapshot(query) {
  try {
    return await query.get();
  } catch (error) {
    if (error?.code === 9 || error?.code === 'failed-precondition') {
      throw new HttpsError(
        'unavailable',
        'Destination search is being prepared. Please try again shortly.'
      );
    }
    throw error;
  }
}

async function searchDestinations({ admin, data }) {
  const limit = cleanLimit(data?.limit);
  const sort = data?.sort || 'popular';
  if (!['popular', 'name'].includes(sort)) throw new HttpsError('invalid-argument', 'sort is invalid.');
  const countryId = typeof data?.countryId === 'string' && data.countryId.trim() ? data.countryId.trim() : null;
  const queryText = compactDestinationSearchText(data?.query);
  const prefix = queryText.slice(0, MAX_PREFIX_LENGTH);
  let query = admin.firestore().collection('destinationCatalog').where('status', '==', 'active');
  if (countryId) query = query.where('countryId', '==', countryId);
  if (prefix?.length >= 2) query = query.where('search.prefixes', 'array-contains', prefix);
  const effectiveSort = prefix?.length >= 2 ? 'popular' : sort;
  query = effectiveSort === 'popular'
    ? query.orderBy('recommendationCount', 'desc').orderBy('__name__', 'asc')
    : query.orderBy('names.he', 'asc').orderBy('__name__', 'asc');
  const cursor = typeof data?.cursor === 'string' ? data.cursor : '';
  if (cursor) {
    const cursorSnapshot = await admin.firestore().doc(`destinationCatalog/${cursor}`).get();
    if (cursorSnapshot.exists) query = query.startAfter(cursorSnapshot);
  }
  const page = [];
  let rawCursor = null;
  let hasMoreRaw = true;
  while (page.length < limit + 1 && hasMoreRaw) {
    let batchQuery = query.limit(limit + 1);
    if (rawCursor) batchQuery = batchQuery.startAfter(rawCursor);
    const snapshot = await getCatalogSnapshot(batchQuery);
    if (snapshot.empty) break;
    rawCursor = snapshot.docs.at(-1);
    hasMoreRaw = snapshot.size === limit + 1;
    const countryIds = Array.from(new Set(snapshot.docs.map((entry) => entry.data()?.countryId).filter(Boolean)));
    const countrySnapshots = countryIds.length
      ? await admin.firestore().getAll(...countryIds.map((id) => admin.firestore().doc(`countries/${id}`)))
      : [];
    const activeCountryIds = new Set(
      countrySnapshots.filter((entry) => entry.exists && entry.data()?.status === 'active')
        .map((entry) => entry.id)
    );
    page.push(...filterCatalogByActiveCountries(snapshot.docs, activeCountryIds));
  }
  const items = page.slice(0, limit);
  return {
    items: items.map((entry) => entry.data()),
    nextCursor: page.length > limit ? items.at(-1)?.id || null : null,
  };
}

module.exports = {
  catalogData,
  catalogId,
  compactDestinationSearchText,
  destinationSearchForms,
  filterCatalogByActiveCountries,
  getCatalogSnapshot,
  searchDestinations,
  syncCountryDestinationCatalog,
  syncDestinationCatalog,
};
