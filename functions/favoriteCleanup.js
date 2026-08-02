const FAVORITE_DELETE_BATCH_SIZE = 400;
const FAVORITE_TYPES = Object.freeze({
  recommendation: 'recommendations',
  route: 'routes',
  city: 'cities',
});

function assertNonEmptyString(value, name) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${name} must be a non-empty string.`);
  }
  // Firestore document IDs may legally contain leading or trailing spaces.
  // Validate with trim(), but preserve the exact identifier for lookups.
  return value;
}

function buildDeletedFavoriteQuery(
  firestore,
  { type, itemId, countryId },
  limit = FAVORITE_DELETE_BATCH_SIZE
) {
  const normalizedType = assertNonEmptyString(type, 'type');
  const normalizedItemId = assertNonEmptyString(itemId, 'itemId');
  if (!Object.values(FAVORITE_TYPES).includes(normalizedType)) {
    throw new TypeError(`Unsupported favorite type: ${normalizedType}`);
  }

  let query = firestore
    .collectionGroup('favorites')
    .where('type', '==', normalizedType)
    .where('id', '==', normalizedItemId);

  if (normalizedType === FAVORITE_TYPES.city) {
    query = query.where(
      'countryId',
      '==',
      assertNonEmptyString(countryId, 'countryId')
    );
  }

  return query.limit(limit);
}

async function deleteFavoritesForItem({
  firestore,
  type,
  itemId,
  countryId,
  batchSize = FAVORITE_DELETE_BATCH_SIZE,
}) {
  if (!firestore?.collectionGroup || !firestore?.batch) {
    throw new TypeError('A Firestore Admin instance is required.');
  }
  if (
    !Number.isInteger(batchSize) ||
    batchSize < 1 ||
    batchSize > FAVORITE_DELETE_BATCH_SIZE
  ) {
    throw new RangeError(
      `batchSize must be between 1 and ${FAVORITE_DELETE_BATCH_SIZE}.`
    );
  }

  let deleted = 0;
  let batches = 0;

  while (true) {
    // Re-running the same bounded query after each committed deletion avoids
    // retaining an unbounded result set for popular content.
    // eslint-disable-next-line no-await-in-loop
    const snapshot = await buildDeletedFavoriteQuery(
      firestore,
      { type, itemId, countryId },
      batchSize
    ).get();
    if (snapshot.empty) break;

    const batch = firestore.batch();
    snapshot.docs.forEach((favoriteDoc) => batch.delete(favoriteDoc.ref));
    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
    deleted += snapshot.size;
    batches += 1;
  }

  console.log('Deleted favorites for removed content.', {
    type,
    itemId,
    countryId: countryId || null,
    deleted,
    batches,
  });
  return { deleted, batches };
}

module.exports = {
  FAVORITE_DELETE_BATCH_SIZE,
  FAVORITE_TYPES,
  buildDeletedFavoriteQuery,
  deleteFavoritesForItem,
};
