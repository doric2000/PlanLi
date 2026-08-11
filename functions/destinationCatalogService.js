const { HttpsError } = require('firebase-functions/v2/https');
const { normalize } = require('./destinationIdentityService');

function prefixes(...values) {
  const output = new Set();
  values.forEach((value) => normalize(value).split(' ').forEach((word) => {
    for (let size = 2; size <= Math.min(16, word.length); size += 1) output.add(word.slice(0, size));
  }));
  return [...output].slice(0, 80);
}

function catalogId(countryId, cityId) {
  return `${countryId}_${cityId}`;
}

function catalogData({ countryId, cityId, city, country, timestamp }) {
  const names = city?.identity?.names || { he: city?.name || cityId, en: city?.name || cityId };
  const countryNames = country?.names || { he: country?.name || countryId, en: country?.name || countryId };
  return {
    countryId, cityId, status: city?.status || 'active', names, countryNames,
    search: { prefixes: prefixes(names.he, names.en, countryNames.he, countryNames.en) },
    recommendationCount: Math.max(0, Number(city?.stats?.recommendationCount || 0)),
    destinationImage: city?.destinationImage || null,
    updatedAt: timestamp,
  };
}

async function syncDestinationCatalog({ admin, countryId, cityId, city }) {
  const db = admin.firestore();
  const country = (await db.doc(`countries/${countryId}`).get()).data() || {};
  const ref = db.doc(`destinationCatalog/${catalogId(countryId, cityId)}`);
  const timestamp = admin.firestore.FieldValue.serverTimestamp();
  if (!city || city.status !== 'active') {
    await ref.delete();
    return null;
  }
  const data = catalogData({ countryId, cityId, city, country, timestamp });
  await ref.set(data, { merge: true });
  return data;
}

function cleanLimit(value) {
  const limit = Number(value || 20);
  if (!Number.isInteger(limit) || limit < 1 || limit > 30) throw new HttpsError('invalid-argument', 'limit is invalid.');
  return limit;
}

async function searchDestinations({ admin, data }) {
  const limit = cleanLimit(data?.limit);
  const sort = data?.sort || 'popular';
  if (!['popular', 'name'].includes(sort)) throw new HttpsError('invalid-argument', 'sort is invalid.');
  const countryId = typeof data?.countryId === 'string' && data.countryId.trim() ? data.countryId.trim() : null;
  const queryText = normalize(data?.query);
  const prefix = queryText.split(' ').at(-1);
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
  const snapshot = await query.limit(limit + 1).get();
  const page = snapshot.docs.slice(0, limit);
  return {
    items: page.map((entry) => entry.data()),
    nextCursor: snapshot.size > limit ? page.at(-1)?.id || null : null,
  };
}

module.exports = { catalogData, catalogId, searchDestinations, syncDestinationCatalog };
