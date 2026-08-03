/* eslint-disable no-await-in-loop, no-console */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const { buildFavoritePreview, favoriteKeyForPath } = require('../socialService');
const { initializeAdmin } = require('./localCredentials');

const STATE_DIR = path.join(__dirname, '..', '.database-canonical-migration');

function valueAfter(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : null;
}

function parseArgs(argv) {
  return {
    apply: argv.includes('--apply'),
    cleanup: argv.includes('--cleanup'),
    cleanupOnly: argv.includes('--cleanup-only'),
    resume: argv.includes('--resume'),
    rollback: valueAfter(argv, '--rollback'),
    stateDir: path.resolve(valueAfter(argv, '--state-dir') || STATE_DIR),
  };
}

function initialize() {
  initializeAdmin(admin);
  return admin.firestore();
}

function stableId(prefix, seed) {
  return `${prefix}_${crypto.createHash('sha256').update(`${prefix}:${seed}`).digest('base64url').slice(0, 20)}`;
}

function safeId(value, fallback) {
  const text = String(value || '').trim();
  return text && !text.includes('/') && text.length <= 180 ? text : fallback;
}

function legacyDestinationKey(countryId, cityId) {
  return `${String(countryId || '').trim()}/${String(cityId || '').trim()}`;
}

function mappedCity(cityMap, countryId, cityId) {
  return cityMap.get(`${countryId}/${cityId}`) ||
    cityMap.get(legacyDestinationKey(countryId, cityId));
}

function canonicalAsset(asset) {
  if (!asset || typeof asset !== 'object') return null;
  if (asset.assetId && asset.large?.url && asset.feed?.url && asset.thumb?.url) return asset;
  return null;
}

function compact(value) {
  if (Array.isArray(value)) return value.map(compact);
  if (!value || typeof value !== 'object') return value;
  if (
    value instanceof Date ||
    value instanceof admin.firestore.Timestamp ||
    value instanceof admin.firestore.GeoPoint ||
    value instanceof admin.firestore.DocumentReference
  ) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, compact(entry)])
  );
}

function encode(value) {
  if (value instanceof admin.firestore.Timestamp) {
    return { __type: 'timestamp', seconds: value.seconds, nanoseconds: value.nanoseconds };
  }
  if (value instanceof admin.firestore.GeoPoint) {
    return { __type: 'geopoint', latitude: value.latitude, longitude: value.longitude };
  }
  if (value instanceof admin.firestore.DocumentReference) {
    return { __type: 'reference', path: value.path };
  }
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, encode(entry)]));
  }
  return value;
}

function decode(db, value) {
  if (Array.isArray(value)) return value.map((entry) => decode(db, entry));
  if (value?.__type === 'timestamp') {
    return new admin.firestore.Timestamp(value.seconds, value.nanoseconds);
  }
  if (value?.__type === 'geopoint') {
    return new admin.firestore.GeoPoint(value.latitude, value.longitude);
  }
  if (value?.__type === 'reference') return db.doc(value.path);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, decode(db, entry)]));
  }
  return value;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  try {
    fs.renameSync(temporary, filePath);
  } catch (error) {
    if (!['EEXIST', 'EPERM'].includes(error.code)) throw error;
    fs.copyFileSync(temporary, filePath);
    fs.unlinkSync(temporary);
  }
}

async function snapshotsForQuery(query) {
  const snapshot = await query.get();
  return snapshot.docs;
}

async function collectSource(db) {
  const [users, publicProfiles, recommendations, routes, trips, countries] = await Promise.all([
    snapshotsForQuery(db.collection('users')),
    snapshotsForQuery(db.collection('publicProfiles')),
    snapshotsForQuery(db.collection('recommendations')),
    snapshotsForQuery(db.collection('routes')),
    snapshotsForQuery(db.collection('trips')),
    snapshotsForQuery(db.collection('countries')),
  ]);
  const cities = [];
  for (const country of countries) {
    cities.push(...await snapshotsForQuery(country.ref.collection('cities')));
  }
  const favorites = [];
  const notifications = [];
  for (const user of users) {
    favorites.push(...await snapshotsForQuery(user.ref.collection('favorites')));
    notifications.push(...await snapshotsForQuery(user.ref.collection('notifications')));
  }
  const comments = [];
  const likes = [];
  for (const content of [...recommendations, ...routes, ...trips]) {
    comments.push(...await snapshotsForQuery(content.ref.collection('comments')));
    likes.push(...await snapshotsForQuery(content.ref.collection('likes')));
  }
  return {
    users,
    publicProfiles,
    recommendations,
    routes,
    trips,
    countries,
    cities,
    favorites,
    notifications,
    comments,
    likes,
  };
}

function operation(type, pathValue, data, group) {
  return { id: `${type}:${pathValue}`, type, path: pathValue, data, group };
}

async function buildPlan(db, source) {
  const issues = [];
  const operations = [];
  const publicById = new Map(source.publicProfiles.map((entry) => [entry.id, entry.data()]));
  const countryMap = new Map();
  const cityMap = new Map();
  const countryDataById = new Map();
  const cityDataByPath = new Map();
  const canonicalContent = new Map();

  for (const countrySnapshot of source.countries) {
    const data = countrySnapshot.data() || {};
    const countryId = countrySnapshot.id.startsWith('cty_')
      ? countrySnapshot.id
      : stableId('cty', data.code || countrySnapshot.id);
    const next = compact({
      name: data.name || countrySnapshot.id,
      code: data.code || null,
      region: data.region || null,
      currencyCode: data.currencyCode ?? null,
      status: 'active',
      updatedAt: data.updatedAt || data.createdAt || admin.firestore.Timestamp.now(),
    });
    countryMap.set(countrySnapshot.id, countryId);
    countryMap.set(String(countrySnapshot.id).trim(), countryId);
    countryDataById.set(countryId, next);
    operations.push(operation('set', `countries/${countryId}`, next, 'destinations'));
  }

  for (const citySnapshot of source.cities) {
    const oldCountryId = citySnapshot.ref.parent.parent.id;
    const countryId = countryMap.get(oldCountryId) || countryMap.get(String(oldCountryId).trim());
    if (!countryId) {
      issues.push(`City ${citySnapshot.ref.path} has no mapped country.`);
      continue;
    }
    const data = citySnapshot.data() || {};
    const cityId = citySnapshot.id.startsWith('city_') && oldCountryId.startsWith('cty_')
      ? citySnapshot.id
      : stableId('city', `${oldCountryId}/${citySnapshot.id}`);
    const googlePlaceIds = Array.from(new Set([
      ...(Array.isArray(data.providerIds?.googlePlaceIds) ? data.providerIds.googlePlaceIds : []),
      data.googlePlaceId,
    ].filter(Boolean)));
    const next = compact({
      name: data.name || citySnapshot.id,
      description: data.description || '',
      providerIds: { googlePlaceIds },
      rating: Number(data.rating || 0),
      travelers: Number(data.travelers || 0),
      imageUrl: data.imageUrl || null,
      coordinates: data.coordinates || null,
      closestAirport: data.closestAirport || null,
      countryName: countryDataById.get(countryId)?.name || '',
      status: 'active',
      stats: { recommendationCount: 0 },
      updatedAt: data.updatedAt || data.createdAt || admin.firestore.Timestamp.now(),
    });
    cityMap.set(`${oldCountryId}/${citySnapshot.id}`, { countryId, cityId });
    cityMap.set(legacyDestinationKey(oldCountryId, citySnapshot.id), { countryId, cityId });
    cityDataByPath.set(`countries/${countryId}/cities/${cityId}`, next);
    operations.push(operation('set', `countries/${countryId}/cities/${cityId}`, next, 'destinations'));
  }

  const commentsByParent = new Map();
  source.comments.forEach((entry) => {
    const parent = entry.ref.parent.parent.path;
    if (!commentsByParent.has(parent)) commentsByParent.set(parent, []);
    commentsByParent.get(parent).push(entry);
  });
  const likesByParent = new Map();
  source.likes.forEach((entry) => {
    const parent = entry.ref.parent.parent.path;
    if (!likesByParent.has(parent)) likesByParent.set(parent, []);
    likesByParent.get(parent).push(entry);
  });

  for (const snapshot of source.recommendations) {
    const data = snapshot.data() || {};
    const legacyDestination = data.destination || {
      countryId: data.countryId,
      cityId: data.cityId,
    };
    const mapped = mappedCity(
      cityMap,
      legacyDestination.countryId,
      legacyDestination.cityId
    );
    if (!mapped) issues.push(`Recommendation ${snapshot.id} has an unmapped destination.`);
    const media = (Array.isArray(data.media) ? data.media : []).map(canonicalAsset).filter(Boolean);
    if ((data.images?.length || data.imageAssets?.length) && media.length === 0) {
      issues.push(`Recommendation ${snapshot.id} still needs canonical media migration.`);
    }
    const comments = commentsByParent.get(snapshot.ref.path) || [];
    const likedBy = Array.from(new Set([
      ...(Array.isArray(data.likedBy) ? data.likedBy.filter(Boolean) : []),
      ...(likesByParent.get(snapshot.ref.path) || []).map((entry) =>
        entry.data()?.userId || entry.id
      ).filter(Boolean),
    ]));
    const destination = mapped ? {
      countryId: mapped.countryId,
      cityId: mapped.cityId,
      countryName: countryDataById.get(mapped.countryId)?.name || data.country || '',
      cityName: cityDataByPath.get(`countries/${mapped.countryId}/cities/${mapped.cityId}`)?.name || data.location || '',
    } : null;
    const place = compact({
      ...(data.place || {}),
      ...(!data.place?.coordinates && data.coords ? { coordinates: data.coords } : {}),
    });
    const next = compact({
      ownerId: data.ownerId || data.userId,
      title: data.title || '',
      description: data.description || '',
      status: 'active',
      destination,
      media,
      stats: { likeCount: likedBy.length, commentCount: comments.length },
      category: data.category || '',
      categoryId: data.categoryId || '',
      tags: Array.isArray(data.tags) ? data.tags : [],
      budget: data.budget || '',
      rating: Number(data.rating || 0),
      place,
      createdAt: data.createdAt || admin.firestore.Timestamp.now(),
      updatedAt: data.updatedAt || data.createdAt || admin.firestore.Timestamp.now(),
    });
    operations.push(operation('set', snapshot.ref.path, next, 'recommendations'));
    canonicalContent.set(snapshot.ref.path, next);
    for (const uid of likedBy) {
      operations.push(operation('set', `${snapshot.ref.path}/likes/${uid}`, {
        userId: uid,
        userPreview: {
          displayName: publicById.get(uid)?.displayName || 'Traveler',
          photoURL: publicById.get(uid)?.photoURL || null,
        },
        createdAt: data.createdAt || admin.firestore.Timestamp.now(),
      }, 'interactions'));
    }
    for (const comment of comments) {
      const commentData = comment.data() || {};
      const authorId = commentData.authorId || commentData.userId;
      operations.push(operation('set', comment.ref.path, {
        authorId,
        authorPreview: {
          displayName: publicById.get(authorId)?.displayName || 'Traveler',
          photoURL: publicById.get(authorId)?.photoURL || null,
        },
        text: String(commentData.text || '').trim(),
        createdAt: commentData.createdAt || admin.firestore.Timestamp.now(),
        updatedAt: commentData.updatedAt || commentData.createdAt || admin.firestore.Timestamp.now(),
      }, 'interactions'));
    }
  }

  for (const snapshot of source.routes) {
    const data = snapshot.data() || {};
    const rawDays = Array.isArray(data.tripDaysData) ? data.tripDaysData : [];
    const days = rawDays.map((day, dayIndex) => ({
      id: `day_${String(dayIndex + 1).padStart(3, '0')}`,
      position: dayIndex,
      description: String(day?.description || '').trim(),
      media: canonicalAsset(day?.media),
      stops: (Array.isArray(day?.stops) ? day.stops : []).map((stop, stopIndex) => ({
        id: safeId(stop?.id, `stop_${String(stopIndex + 1).padStart(3, '0')}`),
        position: stopIndex,
        title: String(stop?.title || stop?.location || stop?.place?.name || `Stop ${stopIndex + 1}`).trim(),
        description: String(stop?.description || '').trim(),
        location: String(stop?.location || '').trim(),
        country: String(stop?.country || '').trim(),
        place: stop?.place || null,
        media: canonicalAsset(stop?.media),
      })),
    }));
    const likedBy = Array.from(new Set([
      ...(Array.isArray(data.likedBy) ? data.likedBy.filter(Boolean) : []),
      ...(likesByParent.get(snapshot.ref.path) || []).map((entry) =>
        entry.data()?.userId || entry.id
      ).filter(Boolean),
    ]));
    const comments = commentsByParent.get(snapshot.ref.path) || [];
    const mediaById = new Map();
    (Array.isArray(data.media) ? data.media : []).map(canonicalAsset).filter(Boolean)
      .forEach((asset) => mediaById.set(asset.assetId, asset));
    days.forEach((day) => {
      if (day.media) mediaById.set(day.media.assetId, day.media);
      day.stops.forEach((stop) => {
        if (stop.media) mediaById.set(stop.media.assetId, stop.media);
      });
    });
    if (rawDays.some((day) => day.image || day.imageAsset) && mediaById.size === 0) {
      issues.push(`Route ${snapshot.id} still needs canonical media migration.`);
    }
    const next = {
      ownerId: data.ownerId || data.userId,
      title: data.title || data.Title || '',
      description: data.description || data.desc || '',
      status: 'active',
      dayCount: days.length || Number(data.days || 0),
      distanceKm: Number(data.distanceKm ?? data.distance ?? 0),
      tags: {
        difficulty: data.tags?.difficulty || data.difficultyTag || '',
        travelStyle: data.tags?.travelStyle || data.travelStyleTag || '',
        roadTrip: data.tags?.roadTrip || data.roadTripTags || [],
        experience: data.tags?.experience || data.experienceTags || [],
      },
      summaryPlaces: Array.isArray(data.summaryPlaces) ? data.summaryPlaces : (data.places || []),
      media: Array.from(mediaById.values()),
      stats: { likeCount: likedBy.length, commentCount: comments.length },
      createdAt: data.createdAt || admin.firestore.Timestamp.now(),
      updatedAt: data.updatedAt || data.createdAt || admin.firestore.Timestamp.now(),
    };
    operations.push(operation('set', snapshot.ref.path, next, 'routes'));
    canonicalContent.set(snapshot.ref.path, next);
    days.forEach((day) => {
      const dayPath = `${snapshot.ref.path}/days/${day.id}`;
      operations.push(operation('set', dayPath, {
        position: day.position,
        description: day.description,
        media: day.media,
        stopCount: day.stops.length,
      }, 'routes'));
      day.stops.forEach((stop) => operations.push(operation('set', `${dayPath}/stops/${stop.id}`, {
        position: stop.position,
        title: stop.title,
        description: stop.description,
        location: stop.location,
        country: stop.country,
        place: stop.place,
        media: stop.media,
      }, 'routes')));
    });
    for (const uid of likedBy) {
      operations.push(operation('set', `${snapshot.ref.path}/likes/${uid}`, {
        userId: uid,
        userPreview: {
          displayName: publicById.get(uid)?.displayName || 'Traveler',
          photoURL: publicById.get(uid)?.photoURL || null,
        },
        createdAt: data.createdAt || admin.firestore.Timestamp.now(),
      }, 'interactions'));
    }
    for (const comment of comments) {
      const commentData = comment.data() || {};
      const authorId = commentData.authorId || commentData.userId;
      operations.push(operation('set', comment.ref.path, {
        authorId,
        authorPreview: {
          displayName: publicById.get(authorId)?.displayName || 'Traveler',
          photoURL: publicById.get(authorId)?.photoURL || null,
        },
        text: String(commentData.text || '').trim(),
        createdAt: commentData.createdAt || admin.firestore.Timestamp.now(),
        updatedAt: commentData.updatedAt || commentData.createdAt || admin.firestore.Timestamp.now(),
      }, 'interactions'));
    }
  }

  for (const userSnapshot of source.users) {
    const data = userSnapshot.data() || {};
    const photoMedia = canonicalAsset(data.photoMedia);
    if (data.photoURL && !photoMedia && data.photoMeta) {
      issues.push(`User ${userSnapshot.id} still needs canonical media migration.`);
    }
    const user = compact({
      uid: userSnapshot.id,
      email: data.email || '',
      displayName: data.displayName || 'Traveler',
      photoURL: photoMedia?.feed?.url || data.photoURL || null,
      photoMedia,
      smartProfile: data.smartProfile || null,
      isExpert: Boolean(data.isExpert),
      credibilityScore: Number(data.credibilityScore || 0),
      reviews: Number(data.reviews || 0),
      trips: Number(data.trips || 0),
      createdAt: data.createdAt || admin.firestore.Timestamp.now(),
      updatedAt: data.updatedAt || data.createdAt || admin.firestore.Timestamp.now(),
    });
    operations.push(operation('set', userSnapshot.ref.path, user, 'profiles'));
    const smartProfile = user.smartProfile || {};
    const publicProfile = {
      uid: userSnapshot.id,
      displayName: user.displayName,
      photoURL: user.photoURL,
      photoMedia: user.photoMedia || null,
      isExpert: user.isExpert,
      smartProfile: {
        interests: Array.isArray(smartProfile.interests) ? smartProfile.interests.slice(0, 30) : [],
        vibe: Array.isArray(smartProfile.vibe) ? smartProfile.vibe.slice(0, 30) : [],
      },
      updatedAt: user.updatedAt,
    };
    operations.push(operation('set', `publicProfiles/${userSnapshot.id}`, publicProfile, 'profiles'));
    publicById.set(userSnapshot.id, publicProfile);
  }

  for (const favorite of source.favorites) {
    const data = favorite.data() || {};
    const uid = favorite.ref.parent.parent.id;
    const rawType = String(data.type || '');
    const type = ['recommendation', 'recommendations'].includes(rawType) ? 'recommendation'
      : ['route', 'routes'].includes(rawType) ? 'route'
        : ['trip', 'trips'].includes(rawType) ? 'trip'
          : ['city', 'cities'].includes(rawType) ? 'city' : null;
    let target;
    if (type === 'city') {
      const mapped = mappedCity(
        cityMap,
        data.target?.countryId || data.countryId,
        data.target?.id || data.id
      );
      if (mapped) target = {
        type,
        id: mapped.cityId,
        countryId: mapped.countryId,
        path: `countries/${mapped.countryId}/cities/${mapped.cityId}`,
      };
    } else if (type) {
      const id = data.target?.id || data.id;
      if (id) target = {
        type,
        id,
        path: data.target?.path ||
          `${type === 'recommendation' ? 'recommendations' : `${type}s`}/${id}`,
      };
    }
    const sourceData = target
      ? canonicalContent.get(target.path) || cityDataByPath.get(target.path)
      : null;
    if (!target || !sourceData) {
      operations.push(operation('delete', favorite.ref.path, null, 'favorites'));
      continue;
    }
    const key = favoriteKeyForPath(target.path);
    const targetPath = `users/${uid}/favorites/${key}`;
    const profile = sourceData.ownerId ? publicById.get(sourceData.ownerId) : null;
    operations.push(operation('set', targetPath, {
      ownerId: uid,
      type,
      target,
      preview: buildFavoritePreview({ target, data: sourceData, publicProfile: profile }),
      createdAt: data.created_at || data.createdAt || admin.firestore.Timestamp.now(),
      sourceUpdatedAt: sourceData.updatedAt || sourceData.createdAt || admin.firestore.Timestamp.now(),
    }, 'favorites'));
    if (favorite.ref.path !== targetPath) {
      operations.push(operation('delete', favorite.ref.path, null, 'favorites'));
    }
  }

  for (const notification of source.notifications) {
    const data = notification.data() || {};
    const recipientId = notification.ref.parent.parent.id;
    const type = data.target?.type || (data.postType === 'route' ? 'route' : 'recommendation');
    const targetId = data.target?.id || data.postId;
    const targetPath = data.target?.path ||
      `${type === 'route' ? 'routes' : type === 'trip' ? 'trips' : 'recommendations'}/${targetId}`;
    const content = canonicalContent.get(targetPath);
    if (!content) {
      operations.push(operation('delete', notification.ref.path, null, 'notifications'));
      continue;
    }
    operations.push(operation('set', notification.ref.path, compact({
      type: data.type === 'comment' ? 'comment' : 'like',
      actorId: data.actorId,
      actorPreview: {
        displayName: publicById.get(data.actorId)?.displayName ||
          data.actorPreview?.displayName || data.actorName || 'Traveler',
        photoURL: publicById.get(data.actorId)?.photoURL ||
          data.actorPreview?.photoURL || data.actorAvatar || null,
      },
      target: {
        type,
        id: targetId,
        path: targetPath,
        ...(data.target?.countryId ? { countryId: data.target.countryId } : {}),
        title: content.title,
        thumbUrl: content.media?.[0]?.thumb?.url || null,
      },
      commentId: data.commentId,
      isRead: Boolean(data.isRead),
      createdAt: data.createdAt || data.timestamp || admin.firestore.Timestamp.now(),
    }), 'notifications'));
    if (!recipientId) issues.push(`Notification ${notification.ref.path} has no recipient.`);
  }

  for (const [pathValue, city] of cityDataByPath) {
    const count = [...canonicalContent.entries()].filter(
      ([contentPath, data]) => contentPath.startsWith('recommendations/') &&
        data.destination?.countryId === pathValue.split('/')[1] &&
        data.destination?.cityId === pathValue.split('/')[3]
    ).length;
    const existing = operations.find((entry) => entry.path === pathValue && entry.group === 'destinations');
    if (existing) existing.data = { ...city, stats: { recommendationCount: count } };
  }

  const canonicalDestinationRoots = Array.from(countryDataById.keys()).map(
    (id) => `countries/${id}`
  );
  const canonicalDestinationSet = new Set(canonicalDestinationRoots);
  const uniqueOperations = Array.from(
    new Map(operations.map((entry) => [entry.id, entry])).values()
  );
  return {
    issues,
    operations: uniqueOperations,
    oldDestinationRoots: source.countries
      .map((entry) => entry.ref.path)
      .filter((entry) => !canonicalDestinationSet.has(entry)),
    canonicalDestinationRoots,
    contentRoots: [...source.recommendations, ...source.routes, ...source.trips].map((entry) => entry.ref.path),
    userIds: source.users.map((entry) => entry.id),
  };
}

async function applyOperations(db, plan, options) {
  const statePath = path.join(options.stateDir, 'state.json');
  const state = options.resume && fs.existsSync(statePath)
    ? JSON.parse(fs.readFileSync(statePath, 'utf8'))
    : { completed: {} };
  for (const group of ['destinations', 'profiles', 'recommendations', 'routes', 'interactions', 'favorites', 'notifications']) {
    const groupOperations = plan.operations.filter((entry) => entry.group === group);
    for (let offset = 0; offset < groupOperations.length; offset += 350) {
      const chunk = groupOperations.slice(offset, offset + 350).filter((entry) => !state.completed[entry.id]);
      if (!chunk.length) continue;
      const batch = db.batch();
      chunk.forEach((entry) => {
        if (entry.type === 'set') batch.set(db.doc(entry.path), entry.data);
        else batch.delete(db.doc(entry.path));
      });
      await batch.commit();
      chunk.forEach((entry) => { state.completed[entry.id] = true; });
      writeJson(statePath, { ...state, updatedAt: new Date().toISOString() });
    }
  }
}

async function verifyNoLegacyReferences(db, plan) {
  const oldCountryIds = new Set(plan.oldDestinationRoots.map((entry) => entry.split('/')[1]));
  const [recommendations, routes, trips, favorites] = await Promise.all([
    db.collection('recommendations').get(),
    db.collection('routes').get(),
    db.collection('trips').get(),
    db.collectionGroup('favorites').get(),
  ]);
  const references = [];
  [...recommendations.docs, ...routes.docs, ...trips.docs].forEach((entry) => {
    if (oldCountryIds.has(entry.data()?.destination?.countryId)) references.push(entry.ref.path);
  });
  favorites.docs.forEach((entry) => {
    if (oldCountryIds.has(entry.data()?.target?.countryId)) references.push(entry.ref.path);
  });
  return references;
}

async function cleanupDestinations(db, plan) {
  const canonical = new Set(plan.canonicalDestinationRoots);
  const references = await verifyNoLegacyReferences(db, plan);
  if (references.length) throw new Error(`Legacy destinations still have ${references.length} references.`);
  for (const root of plan.oldDestinationRoots) {
    if (!canonical.has(root)) await db.recursiveDelete(db.doc(root));
  }
}

async function rollback(db, filePath) {
  const backup = JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
  for (const root of backup.contentRoots || []) await db.recursiveDelete(db.doc(root));
  for (const root of backup.canonicalDestinationRoots || []) await db.recursiveDelete(db.doc(root));
  for (const uid of backup.userIds || []) {
    const userRef = db.doc(`users/${uid}`);
    const [favorites, notifications] = await Promise.all([
      userRef.collection('favorites').get(),
      userRef.collection('notifications').get(),
    ]);
    const batch = db.batch();
    [...favorites.docs, ...notifications.docs].forEach((entry) => batch.delete(entry.ref));
    await batch.commit();
  }
  const documents = backup.documents || [];
  for (let offset = 0; offset < documents.length; offset += 350) {
    const batch = db.batch();
    documents.slice(offset, offset + 350).forEach((entry) => {
      batch.set(db.doc(entry.path), decode(db, entry.data));
    });
    await batch.commit();
  }
  return { restored: documents.length };
}

async function run(options) {
  if (options.rollback) {
    if (!options.apply) throw new Error('Rollback requires --apply.');
    const db = initialize();
    const result = await rollback(db, options.rollback);
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  const db = initialize();
  const source = await collectSource(db);
  const plan = await buildPlan(db, source);
  fs.mkdirSync(options.stateDir, { recursive: true });
  const backupPath = path.join(options.stateDir, `backup-${Date.now()}.json`);
  const documents = Object.values(source).flat().map((entry) => ({
    path: entry.ref.path,
    data: encode(entry.data()),
  }));
  const summary = {
    mode: options.apply ? 'apply' : 'dry-run',
    operations: plan.operations.length,
    byGroup: Object.fromEntries(
      [...new Set(plan.operations.map((entry) => entry.group))].map((group) => [
        group,
        plan.operations.filter((entry) => entry.group === group).length,
      ])
    ),
    issues: plan.issues,
    backupPath,
  };
  if (options.cleanupOnly) {
    if (!options.apply) throw new Error('--cleanup-only requires --apply.');
    if (plan.issues.length) {
      throw new Error(`Cleanup blocked by ${plan.issues.length} migration issue(s).`);
    }
    await cleanupDestinations(db, plan);
    const result = {
      mode: 'cleanup-only',
      removedDestinationRoots: plan.oldDestinationRoots.length,
    };
    writeJson(path.join(options.stateDir, 'cleanup-report.json'), result);
    console.log(JSON.stringify(result, null, 2));
    return result;
  }
  writeJson(path.join(options.stateDir, 'dry-run-report.json'), summary);
  if (!options.apply) {
    console.log(JSON.stringify(summary, null, 2));
    return summary;
  }
  if (plan.issues.length) {
    throw new Error(`Migration blocked by ${plan.issues.length} issue(s). Run media migration first.`);
  }
  writeJson(backupPath, {
    createdAt: new Date().toISOString(),
    documents,
    contentRoots: plan.contentRoots,
    canonicalDestinationRoots: plan.canonicalDestinationRoots,
    userIds: plan.userIds,
  });
  await applyOperations(db, plan, options);
  if (options.cleanup) await cleanupDestinations(db, plan);
  const result = { ...summary, applied: true, cleanup: options.cleanup };
  writeJson(path.join(options.stateDir, 'apply-report.json'), result);
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (require.main === module) {
  run(parseArgs(process.argv.slice(2))).catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}

module.exports = {
  buildPlan,
  canonicalAsset,
  compact,
  legacyDestinationKey,
  mappedCity,
  parseArgs,
  run,
  safeId,
  stableId,
};
