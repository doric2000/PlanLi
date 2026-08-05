/* eslint-disable no-await-in-loop, no-console */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const { initializeAdmin } = require('./localCredentials');
const {
  analyzeTagValues,
  buildRecommendationFacets,
	buildTravelContentFacets,
  CATEGORY_IDS,
  ENVIRONMENT_IDS,
  getCategoryLabel,
  INTEREST_IDS,
  NEED_IDS,
  normalizeBudget,
  normalizeCategoryId,
  normalizeSmartProfile,
  PACE_IDS,
  POST_BUDGET_IDS,
	recommendationAttributeRequirements,
  ROUTE_DIFFICULTY_IDS,
  ROUTE_EXPERIENCE_IDS,
  SEASON_IDS,
  TAG_IDS,
  tagsMatchCategory,
  taxonomy,
  TRANSPORT_MODE_IDS,
  TRAVELER_STYLE_IDS,
  TRAVEL_PARTY_IDS,
  uniqueAllowed,
  VIBE_IDS,
} = require('../travelTaxonomy');
const { mapWithConcurrency, sanitizeRouteMetadata } = require('../routeService');
const { resolveGoogleDestination } = require('../recommendationService');
const { buildSearchIndex, destinationKey } = require('../discoverySearch');
const {
  applyPersonalizationSignal,
  normalizePersonalization,
} = require('../personalizationService');

const PAGE_SIZE = 250;
// Keep the original seed marker: changing it would add historical likes and
// saves a second time for users already migrated under taxonomy v3.
const HISTORY_SEED_VERSION = 'travel-taxonomy-v3';
const DEFAULT_STATE_DIR = path.join(
  __dirname,
  '..',
  '.database-canonical-migration',
  'travel-personalization'
);

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : null;
}

function parseArgs(argv) {
  const parsedLimit = Number.parseInt(valueAfter(argv, '--limit'), 10);
  return {
    apply: argv.includes('--apply'),
    resume: argv.includes('--resume'),
    rollback: valueAfter(argv, '--rollback'),
    limit: Number.isFinite(parsedLimit) && parsedLimit > 0
      ? parsedLimit
      : Number.POSITIVE_INFINITY,
    stateDir: path.resolve(valueAfter(argv, '--state-dir') || DEFAULT_STATE_DIR),
    mapsKey: process.env.GOOGLE_MAPS_KEY || '',
    restCountriesKey: process.env.REST_COUNTRIES_KEY || '',
  };
}

function encode(value) {
  if (value === undefined) return { __type: 'undefined' };
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

function decode(value, db) {
  if (Array.isArray(value)) return value.map((entry) => decode(entry, db));
  if (!value || typeof value !== 'object') return value;
  if (value.__type === 'undefined') return undefined;
  if (value.__type === 'timestamp') {
    return new admin.firestore.Timestamp(value.seconds, value.nanoseconds);
  }
  if (value.__type === 'geopoint') {
    return new admin.firestore.GeoPoint(value.latitude, value.longitude);
  }
  if (value.__type === 'reference') return db.doc(value.path);
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, decode(entry, db)]));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  fs.writeFileSync(temporary, serialized);
  try {
    fs.renameSync(temporary, filePath);
  } catch (error) {
    // Windows does not consistently allow rename() to replace an existing
    // checkpoint. Keep the temporary write first, then fall back to replacing
    // the local ignored checkpoint in place.
    if (!['EPERM', 'EEXIST', 'ENOTEMPTY'].includes(error.code)) throw error;
    fs.writeFileSync(filePath, serialized);
    fs.rmSync(temporary, { force: true });
  }
}

function appendRollback(filePath, documentPath, before, { deleteDocument = false } = {}) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify({
    path: documentPath,
    ...(deleteDocument ? { deleteDocument: true } : { before: encode(before) }),
  })}\n`);
}

function migratedSmartProfile(raw = {}) {
  const canonical = normalizeSmartProfile(raw);
  const completed = Boolean(
    raw.completedAt && canonical.interests.length >= 3 && canonical.budget &&
    canonical.travelParties.length >= 1
  );
  return {
    setupRequired: completed ? false : raw.setupRequired === true,
    completedAt: completed ? raw.completedAt : null,
    ...canonical,
  };
}

const TAG_CATEGORY_BY_ID = Object.fromEntries(taxonomy.tags.map((tag) => [tag.id, tag.categoryId]));

function inferredLegacySubcategory(data = {}) {
  const text = `${data.title || ''} ${data.description || ''}`.toLocaleLowerCase('he');
  const rules = [
    { pattern: /camp nou|קאמפ נואו|אצטדיונ|stadium/i, categoryId: 'activities', tagId: 'sports_stadium' },
    { pattern: /אקווריום|aquarium/i, categoryId: 'nature', tagId: 'wildlife' },
    { pattern: /באולינג|bowling/i, categoryId: 'activities', tagId: 'indoor_venue_activity' },
    { pattern: /dubai frame|מבנה תצפית/i, categoryId: 'culture', tagId: 'architecture_landmark' },
    { pattern: /miracle garden|גן הפרחימ/i, categoryId: 'activities', tagId: 'family_attraction' },
    { pattern: /בית הכנסת|כנסי|מקדש|מסגד|synagogue|church|temple|mosque/i, categoryId: 'culture', tagId: 'religious_site' },
    { pattern: /מוזיאונ|museum/i, categoryId: 'culture', tagId: 'museum' },
    { pattern: /עיר העתיקה|עייר|old city|neighbou?rhood/i, categoryId: 'culture', tagId: 'neighborhood' },
  ];
  return rules.find((rule) => rule.pattern.test(text)) || null;
}

function resolveLegacyRecommendationClassification(data = {}) {
  const rawCategory = String(data.categoryId || data.category || '').trim();
  const analysis = analyzeTagValues(data.tags);
  const inferred = inferredLegacySubcategory(data);
  let categoryId = normalizeCategoryId(rawCategory);
  let confident = Boolean(categoryId);
  if (['attractions', 'אטרקציות'].includes(rawCategory)) {
    const tagCategories = Array.from(new Set(analysis.tagIds.map((tagId) => TAG_CATEGORY_BY_ID[tagId]).filter(Boolean)));
    if (inferred) categoryId = inferred.categoryId;
    else if (tagCategories.length === 1) categoryId = tagCategories[0];
    else if (tagCategories.includes('culture')) categoryId = 'culture';
    else if (tagCategories.includes('activities')) categoryId = 'activities';
    else if (tagCategories.includes('nature')) categoryId = 'nature';
    else if (tagCategories.includes('shopping')) categoryId = 'shopping';
    else confident = false;
  }
  const tagIds = Array.from(new Set([
    ...analysis.tagIds.filter((tagId) => TAG_CATEGORY_BY_ID[tagId] === categoryId),
    ...(inferred?.categoryId === categoryId ? [inferred.tagId] : []),
  ]));
  return { categoryId, tagIds, tagAnalysis: analysis, confident };
}

const RECOMMENDATION_ENVIRONMENT_BY_TAG = Object.freeze({
	restaurant: 'indoor', cafe: 'indoor', bakery_desserts: 'indoor', bar_nightlife: 'indoor',
	grocery_supermarket: 'indoor', local_cuisine: 'indoor', museum: 'indoor', art_gallery: 'indoor',
	indoor_venue_activity: 'indoor', wellness: 'indoor', shopping_center: 'indoor', hotel: 'indoor',
	resort: 'indoor', hostel: 'indoor', guesthouse: 'indoor', apartment: 'indoor',
	street_food: 'outdoor', hiking: 'outdoor', beach: 'outdoor', freshwater: 'outdoor',
	waterfall_spring: 'outdoor', nature_reserve: 'outdoor', viewpoint: 'outdoor', picnic: 'outdoor',
	winter_sports: 'outdoor', neighborhood: 'outdoor', theme_park: 'outdoor', adventure: 'outdoor',
	water_activity: 'outdoor', photography_spot: 'outdoor', market: 'outdoor', camping: 'outdoor',
	wildlife: 'mixed', historic_site: 'mixed', religious_site: 'mixed', architecture_landmark: 'mixed',
	family_attraction: 'mixed', performance_event: 'mixed', workshop: 'mixed', sports_stadium: 'mixed',
	local_crafts: 'mixed',
});

function migratedRecommendationEnvironment(existingFacets, tagIds) {
	const existing = uniqueAllowed(existingFacets?.environments, ENVIRONMENT_IDS);
	if (existing.length > 1) return 'mixed';
	if (existing.length === 1) return existing[0];
	const inferred = Array.from(new Set(tagIds.map((tagId) => RECOMMENDATION_ENVIRONMENT_BY_TAG[tagId]).filter(Boolean)));
	return inferred.length > 1 ? 'mixed' : inferred[0] || '';
}

function isUnengagedPlaceholder(data = {}) {
	const title = String(data.title || '').normalize('NFKC').trim().toLocaleLowerCase('he');
	const placeholder = ['טסט', 'ניסיון', 'test'].includes(title);
	const stats = data.stats || {};
	return placeholder && Number(stats.likeCount || 0) === 0 && Number(stats.commentCount || 0) === 0 &&
		Number(stats.favoriteCount || 0) === 0;
}

function migratedRecommendation(data = {}) {
  const classification = resolveLegacyRecommendationClassification(data);
  const { categoryId, tagIds, tagAnalysis } = classification;
  const budget = normalizeBudget(data.budget, { allowFlexible: false }) || tagAnalysis.budgetLevel;
  const existingFacets = data.facets && typeof data.facets === 'object' ? data.facets : {};
	const rawVibes = Array.isArray(existingFacets.vibes) ? existingFacets.vibes : [];
	const audiences = uniqueAllowed([
		...(Array.isArray(existingFacets.audiences) ? existingFacets.audiences : []),
		...tagAnalysis.audiences,
	], TRAVEL_PARTY_IDS, 6);
	const requirements = recommendationAttributeRequirements(tagIds);
  const submittedFacets = {
	audienceScope: existingFacets.audienceScope === 'all' || audiences.length === 0 ? 'all' : 'selected',
	audiences,
	vibes: requirements.vibes ? uniqueAllowed([...rawVibes, ...tagAnalysis.vibes], VIBE_IDS, 4) : [],
    needs: uniqueAllowed([
      ...(Array.isArray(existingFacets.needs) ? existingFacets.needs : []),
      ...tagAnalysis.needs,
	], NEED_IDS).filter((needId) => requirements.needs.includes(needId)),
	environments: requirements.environment
		? [migratedRecommendationEnvironment(existingFacets, tagIds)].filter(Boolean)
		: [],
  };
  const facets = buildRecommendationFacets(
    { ...data, categoryId, tags: tagIds, budget },
    submittedFacets
  );
  return {
    taxonomyVersion: taxonomy.version,
    categoryId,
    category: getCategoryLabel(categoryId),
    tags: tagIds,
    budget,
    facets,
	status: isUnengagedPlaceholder(data) ? 'inactive' : (data.status || 'active'),
    search: buildSearchIndex({
      title: data.title,
      description: data.description,
      destination: data.destination,
      place: data.place,
      categoryIds: [categoryId],
      subcategoryIds: tagIds,
      interestIds: facets.interests,
    }),
  };
}

function canonicalRouteDestinations(data = {}, stops = []) {
  const stopValue = (entry) => entry?.data || entry || {};
  const source = [
    ...(Array.isArray(data.destinations) ? data.destinations : []),
    ...stops.map((entry) => stopValue(entry).destination),
  ];
  const unique = new Map();
  for (const entry of source) {
    const countryId = typeof entry?.countryId === 'string' ? entry.countryId.trim() : '';
    const cityId = typeof entry?.cityId === 'string' ? entry.cityId.trim() : '';
    if (!countryId || !cityId) continue;
    unique.set(`${countryId}:${cityId}`, {
      countryId,
      cityId,
      countryName: typeof entry.countryName === 'string' ? entry.countryName.trim() : '',
      cityName: typeof entry.cityName === 'string' ? entry.cityName.trim() : '',
    });
  }
  return Array.from(unique.values()).slice(0, 20);
}

function migratedRoute(data = {}, stops = []) {
  const stopValue = (entry) => entry?.data || entry || {};
  const destinations = canonicalRouteDestinations(data, stops);
  const hasStops = stops.length > 0;
  if (!hasStops) {
    return {
      patch: { status: 'inactive' },
      confidence: 'high',
      reason: 'route-without-days-or-stops',
      reviewRequired: false,
    };
  }
  if (!destinations.length) {
    return {
      patch: null,
      confidence: 'low',
      reason: 'route-destinations-cannot-be-derived',
      reviewRequired: true,
    };
  }
	const legacyFacets = data.facets && typeof data.facets === 'object' ? {
		interests: data.facets.interests || [],
		audiences: data.facets.audiences || [],
		vibes: data.facets.vibes || [],
		travelerStyles: data.facets.travelerStyles || [],
		needs: data.facets.needs || [],
		budgetLevel: data.facets.budgetLevel || '',
		seasons: data.facets.seasons || [],
		environments: data.facets.environments || [],
	} : {};
	const initialMetadata = sanitizeRouteMetadata(
		Number(data.taxonomyVersion || 0) >= 3
			? { ...data, taxonomyVersion: 3, facets: legacyFacets }
			: { ...data, taxonomyVersion: 0 }
	);
	const existingFacets = initialMetadata.facets || {};
	const confirmedNeeds = data.facets?.needsScope === 'entire_route'
		? existingFacets.needs || []
		: [];
	const facets = buildTravelContentFacets({
		categoryIds: initialMetadata.categoryIds,
		subcategoryIds: initialMetadata.subcategoryIds,
		budget: existingFacets.budgetLevel,
	}, {
		audienceScope: data.facets?.audienceScope === 'all' || !(existingFacets.audiences || []).length
			? 'all'
			: 'selected',
		audiences: existingFacets.audiences || [],
		vibes: existingFacets.vibes || [],
		travelerStyles: existingFacets.travelerStyles || [],
		needs: confirmedNeeds,
		seasons: existingFacets.seasons || [],
		environments: existingFacets.environments || [],
	}, { surface: 'route' });
	const metadata = { ...initialMetadata, facets };
	const tagCategories = new Set(metadata.subcategoryIds.map((tagId) => TAG_CATEGORY_BY_ID[tagId]).filter(Boolean));
	const missingMetadata = [
		...(!metadata.categoryIds.length || !metadata.categoryIds.every((categoryId) => tagCategories.has(categoryId))
			? ['subcategories'] : []),
		...(!POST_BUDGET_IDS.includes(metadata.facets.budgetLevel) ? ['budget'] : []),
		...(!PACE_IDS.includes(metadata.pace) ? ['pace'] : []),
		...(!metadata.facets.seasons.length ? ['seasons'] : []),
		...(metadata.facets.environments.length !== 1 ? ['environment'] : []),
	];
	if (missingMetadata.length) {
		return {
			patch: null,
			confidence: 'low',
			reason: `route-missing-factual-metadata:${missingMetadata.join(',')}`,
			reviewRequired: true,
		};
	}
  const summaryPlaces = Array.from(new Set([
    ...(Array.isArray(data.summaryPlaces) ? data.summaryPlaces : []),
    ...stops.map((entry) => stopValue(entry).location || stopValue(entry).place?.name),
  ].filter(Boolean))).slice(0, 30);
  const destinationKeys = Array.from(new Set(destinations.flatMap((destination) => [
    destinationKey(destination.countryId),
    destinationKey(destination.countryId, destination.cityId),
  ])));
  return {
    patch: {
      taxonomyVersion: taxonomy.version,
      ...metadata,
      destinations,
      destinationKeys,
      summaryPlaces,
      search: buildSearchIndex({
        title: data.title,
        description: `${data.description || ''} ${summaryPlaces.join(' ')}`,
        destinations,
        categoryIds: metadata.categoryIds,
        subcategoryIds: metadata.subcategoryIds,
        interestIds: metadata.facets.interests,
      }),
    },
    confidence: 'high',
	reason: 'canonical-route-taxonomy-v4-and-search',
    reviewRequired: false,
  };
}

function auditCanonicalPatch(stageName, patch) {
  const errors = [];
  const arraysUseOnly = (values, allowed) => (
    Array.isArray(values) && values.every((value) => allowed.includes(value))
  );
  if (stageName === 'users') {
    const profile = patch.smartProfile;
    if (!profile || !PACE_IDS.includes(profile.pace) && profile.pace !== '') errors.push('profile-pace');
    if (!arraysUseOnly(profile?.interests, INTEREST_IDS)) errors.push('profile-interests');
    if (!arraysUseOnly(profile?.travelParties, TRAVEL_PARTY_IDS)) errors.push('profile-parties');
    if (!arraysUseOnly(profile?.vibe, VIBE_IDS)) errors.push('profile-vibes');
    if (!arraysUseOnly(profile?.travelerStyles, TRAVELER_STYLE_IDS)) errors.push('profile-styles');
    if (!arraysUseOnly(profile?.needs, NEED_IDS)) errors.push('profile-needs');
  }
  if (stageName === 'recommendations') {
    if (!CATEGORY_IDS.includes(patch.categoryId)) errors.push('recommendation-category');
    if (!arraysUseOnly(patch.tags, TAG_IDS)) errors.push('recommendation-tags');
    if (patch.budget && !POST_BUDGET_IDS.includes(patch.budget)) errors.push('recommendation-budget');
    if (!arraysUseOnly(patch.facets?.interests, INTEREST_IDS)) errors.push('facet-interests');
    if (!arraysUseOnly(patch.facets?.audiences, TRAVEL_PARTY_IDS)) errors.push('facet-audiences');
    if (!arraysUseOnly(patch.facets?.vibes, VIBE_IDS)) errors.push('facet-vibes');
    if (!arraysUseOnly(patch.facets?.travelerStyles, TRAVELER_STYLE_IDS)) errors.push('facet-styles');
    if (!arraysUseOnly(patch.facets?.needs, NEED_IDS)) errors.push('facet-needs');
    if (!arraysUseOnly(patch.facets?.seasons, SEASON_IDS)) errors.push('facet-seasons');
    if (!arraysUseOnly(patch.facets?.environments, ENVIRONMENT_IDS)) errors.push('facet-environments');
	if (!['all', 'selected'].includes(patch.facets?.audienceScope)) errors.push('facet-audience-scope');
	if (patch.facets?.audienceScope === 'all' && patch.facets.audiences.length) errors.push('facet-universal-audiences');
	if (patch.facets?.travelerStyles.length) errors.push('recommendation-styles');
	if (patch.facets?.seasons.length) errors.push('recommendation-seasons');
	if (patch.facets?.needs.length && patch.facets?.needsScope !== 'recommendation') errors.push('recommendation-needs-scope');
    if (!patch.facets?.needs.length && patch.facets?.needsScope) errors.push('recommendation-empty-needs-scope');
	const requirements = recommendationAttributeRequirements(patch.tags);
	if (patch.status !== 'inactive' && requirements.vibes && !patch.facets?.vibes.length) errors.push('recommendation-required-vibe');
	if (patch.status !== 'inactive' && !requirements.vibes && patch.facets?.vibes.length) errors.push('recommendation-inapplicable-vibe');
	if (patch.status !== 'inactive' && requirements.environment && !patch.facets?.environments.length) errors.push('recommendation-required-environment');
	if (patch.status !== 'inactive' && !requirements.environment && patch.facets?.environments.length) errors.push('recommendation-inapplicable-environment');
    if (patch.taxonomyVersion !== taxonomy.version) errors.push('recommendation-version');
    if (!Array.isArray(patch.search?.prefixes)) errors.push('recommendation-search');
  }
  if (stageName === 'routes') {
    if (patch.status === 'inactive') return errors;
    if (patch.taxonomyVersion !== taxonomy.version) errors.push('route-version');
    if (!arraysUseOnly(patch.categoryIds, CATEGORY_IDS)) errors.push('route-categories');
    if (!arraysUseOnly(patch.subcategoryIds, TAG_IDS)) errors.push('route-subcategories');
	const tagCategories = new Set((patch.subcategoryIds || []).map((tagId) => TAG_CATEGORY_BY_ID[tagId]).filter(Boolean));
	if (!(patch.categoryIds || []).every((categoryId) => tagCategories.has(categoryId)) ||
		(patch.subcategoryIds || []).some((tagId) => !patch.categoryIds?.includes(TAG_CATEGORY_BY_ID[tagId]))) {
		errors.push('route-subcategory-category-match');
	}
    if (!arraysUseOnly(patch.facets?.interests, INTEREST_IDS)) errors.push('route-interests');
    if (!arraysUseOnly(patch.facets?.audiences, TRAVEL_PARTY_IDS)) errors.push('route-audiences');
    if (!arraysUseOnly(patch.facets?.vibes, VIBE_IDS)) errors.push('route-vibes');
    if (!arraysUseOnly(patch.facets?.travelerStyles, TRAVELER_STYLE_IDS)) errors.push('route-styles');
    if (!arraysUseOnly(patch.facets?.needs, NEED_IDS)) errors.push('route-needs');
    if (!arraysUseOnly(patch.facets?.seasons, SEASON_IDS)) errors.push('route-seasons');
    if (!arraysUseOnly(patch.facets?.environments, ENVIRONMENT_IDS)) errors.push('route-environments');
	if (!['all', 'selected'].includes(patch.facets?.audienceScope)) errors.push('route-audience-scope');
	if (patch.facets?.audienceScope === 'all' && patch.facets.audiences.length) errors.push('route-universal-audiences');
	if (patch.facets?.needs.length && patch.facets?.needsScope !== 'entire_route') errors.push('route-needs-scope');
    if (!ROUTE_DIFFICULTY_IDS.includes(patch.difficulty)) errors.push('route-difficulty');
    if (patch.experienceLevel && !ROUTE_EXPERIENCE_IDS.includes(patch.experienceLevel)) errors.push('route-experience');
    if (!arraysUseOnly(patch.transportModes, TRANSPORT_MODE_IDS)) errors.push('route-transport');
	if (!POST_BUDGET_IDS.includes(patch.facets?.budgetLevel)) errors.push('route-budget');
	if (!PACE_IDS.includes(patch.pace)) errors.push('route-pace');
	if (!patch.facets?.seasons.length) errors.push('route-seasons-required');
	if (patch.facets?.environments.length !== 1) errors.push('route-environment-required');
    if (!Array.isArray(patch.destinations) || !patch.destinations.length ||
      patch.destinations.some((entry) => !entry?.countryId || !entry?.cityId)) {
      errors.push('route-destinations');
    }
    if (!Array.isArray(patch.search?.prefixes)) errors.push('route-search');
  }
  return errors;
}

function changed(before, after) {
  return JSON.stringify(encode(before)) !== JSON.stringify(encode(after));
}

async function readCollection(db, collectionPath, limit, startAfterId = null) {
  let query = db.collection(collectionPath)
    .orderBy(admin.firestore.FieldPath.documentId())
    .limit(Math.min(PAGE_SIZE, limit));
  if (startAfterId) query = query.startAfter(startAfterId);
  return query.get();
}

async function migrateProfilesAndFacets(db, options, checkpoint, rollbackPath, report) {
  const stages = [
    {
      name: 'users',
      path: 'users',
      transform: (data) => ({ smartProfile: migratedSmartProfile(data.smartProfile || {}) }),
    },
    {
      name: 'recommendations',
      path: 'recommendations',
      transform: migratedRecommendation,
    },
  ];

  for (const stage of stages) {
    let processed = 0;
    let lastId = options.resume ? checkpoint[stage.name]?.lastId || null : null;
    while (processed < options.limit) {
      const snapshot = await readCollection(db, stage.path, options.limit - processed, lastId);
      if (snapshot.empty) break;
      const batch = db.batch();
      let writes = 0;
      for (const document of snapshot.docs) {
        const data = document.data();
        const tagAnalysis = stage.name === 'recommendations' ? analyzeTagValues(data.tags) : null;
        if (stage.name === 'recommendations' && !tagAnalysis.recognized) {
          if (report.audit.errors.length < 50) {
            report.audit.errors.push({ path: document.ref.path, errors: ['unrecognized-legacy-tags'] });
          }
          continue;
        }
        const classification = stage.name === 'recommendations'
          ? resolveLegacyRecommendationClassification(data)
          : null;
        if (stage.name === 'recommendations' && !classification.confident) {
            report.recommendations.reviewRequired += 1;
            report.manifest.push({
              path: document.ref.path,
              expectedUpdateTime: document.updateTime?.toDate?.().toISOString() || null,
              stage: 'recommendations',
              confidence: 'low',
              reason: 'ambiguous-legacy-attractions-category',
              reviewRequired: true,
            });
            continue;
        }
        if (stage.name === 'recommendations' &&
          classification.tagIds.some((tagId) => !tagsMatchCategory([tagId], classification.categoryId))) {
          if (report.audit.errors.length < 50) {
            report.audit.errors.push({ path: document.ref.path, errors: ['tag-category-mismatch'] });
          }
          continue;
        }
        const next = stage.transform(data);
        const before = Object.fromEntries(Object.keys(next).map((field) => [field, data[field]]));
        const auditErrors = auditCanonicalPatch(stage.name, next);
        if (auditErrors.length) {
          if (report.audit.errors.length < 50) {
            report.audit.errors.push({ path: document.ref.path, errors: auditErrors });
          }
          continue;
        }
        report.audit.checked += 1;
        if (changed(before, next)) {
          report[stage.name].changed += 1;
          report.manifest.push({
            path: document.ref.path,
            expectedUpdateTime: document.updateTime?.toDate?.().toISOString() || null,
            stage: stage.name,
            confidence: 'high',
			reason: stage.name === 'users' ? 'canonical-smart-profile-v4' : 'canonical-recommendation-v4',
            before: encode(before),
            after: encode(next),
          });
          if (options.apply) {
            appendRollback(rollbackPath, document.ref.path, before);
            batch.update(document.ref, {
              ...next,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { lastUpdateTime: document.updateTime });
            writes += 1;
          }
        }
      }
      if (options.apply && writes) await batch.commit();
      processed += snapshot.size;
      report[stage.name].scanned += snapshot.size;
      lastId = snapshot.docs[snapshot.docs.length - 1].id;
      checkpoint[stage.name] = { lastId, complete: snapshot.size < PAGE_SIZE };
      if (options.apply) writeJson(path.join(options.stateDir, 'checkpoint.json'), checkpoint);
      if (snapshot.size < PAGE_SIZE) break;
    }
  }
}

async function readRouteStops(routeDocument) {
  const days = await routeDocument.ref.collection('days').get();
  const stopSnapshots = await Promise.all(days.docs.map((day) => day.ref.collection('stops').get()));
  return stopSnapshots.flatMap((snapshot) => snapshot.docs.map((document) => ({
    document,
    data: document.data(),
  })));
}

async function resolveMigrationRouteStops(stops, options) {
  if (!options.mapsKey) return { stops, catalogDestinations: [], resolved: false };
  const placeIds = Array.from(new Set(stops.map((entry) => entry.data?.place?.placeId).filter(Boolean)));
  if (!placeIds.length) return { stops, catalogDestinations: [], resolved: false };
  const destinations = await mapWithConcurrency(placeIds, 5, (placeId) => resolveGoogleDestination({
    admin,
    placeId,
    mapsKey: options.mapsKey,
    restCountriesKey: options.restCountriesKey,
  }));
  const byPlaceId = new Map(placeIds.map((placeId, index) => [placeId, destinations[index]]));
  const nextStops = stops.map((entry) => {
    const resolved = byPlaceId.get(entry.data?.place?.placeId);
    if (!resolved) return entry;
    const patch = {
      location: resolved.place.name || entry.data.location || '',
      country: resolved.countryData.name || resolved.countryId,
      place: resolved.place,
      destination: {
        countryId: resolved.countryId,
        cityId: resolved.cityId,
        countryName: resolved.countryData.name || resolved.countryId,
        cityName: resolved.cityData.name || resolved.cityId,
      },
    };
    return { ...entry, data: { ...entry.data, ...patch }, patch };
  });
  return {
    stops: nextStops,
    catalogDestinations: Array.from(new Map(destinations.map((entry) => [entry.cityRef.path, entry])).values()),
    resolved: nextStops.every((entry) => entry.data?.destination?.countryId && entry.data?.destination?.cityId),
  };
}

async function migrateRoutes(db, options, checkpoint, rollbackPath, report) {
  let processed = 0;
  let lastId = options.resume ? checkpoint.routes?.lastId || null : null;
  while (processed < options.limit) {
    const snapshot = await readCollection(db, 'routes', options.limit - processed, lastId);
    if (snapshot.empty) break;
    const batch = db.batch();
    let writes = 0;
    for (const document of snapshot.docs) {
      const data = document.data();
      let stops = await readRouteStops(document);
      let catalogDestinations = [];
      let result;
      try {
        result = migratedRoute(data, stops);
        if (!result.patch && result.reason === 'route-destinations-cannot-be-derived') {
          const resolution = await resolveMigrationRouteStops(stops, options);
          stops = resolution.stops;
          catalogDestinations = resolution.catalogDestinations;
          if (resolution.resolved) result = migratedRoute(data, stops);
        }
      } catch (error) {
        result = {
          patch: null,
          confidence: 'low',
          reason: `route-normalization-failed:${error.message}`,
          reviewRequired: true,
        };
      }
      report.routes.scanned += 1;
      if (!result.patch) {
        report.routes.reviewRequired += 1;
        report.manifest.push({
          path: document.ref.path,
          expectedUpdateTime: document.updateTime?.toDate?.().toISOString() || null,
          stage: 'routes',
          confidence: result.confidence,
          reason: result.reason,
          reviewRequired: true,
        });
        continue;
      }
      const auditErrors = auditCanonicalPatch('routes', result.patch);
      if (auditErrors.length) {
        report.audit.errors.push({ path: document.ref.path, errors: auditErrors });
        continue;
      }
      report.audit.checked += 1;
      const before = Object.fromEntries(Object.keys(result.patch).map((field) => [field, data[field]]));
      if (!changed(before, result.patch)) continue;
      report.routes.changed += 1;
      if (result.patch.status === 'inactive') report.routes.deactivated += 1;
      report.manifest.push({
        path: document.ref.path,
        expectedUpdateTime: document.updateTime?.toDate?.().toISOString() || null,
        stage: 'routes',
        confidence: result.confidence,
        reason: result.reason,
        reviewRequired: false,
        before: encode(before),
        after: encode(result.patch),
        stopChanges: stops.filter((entry) => entry.patch).map((entry) => ({
          path: entry.document.ref.path,
          expectedUpdateTime: entry.document.updateTime?.toDate?.().toISOString() || null,
          before: encode(Object.fromEntries(Object.keys(entry.patch).map((field) => [field, entry.document.data()[field]]))),
          after: encode(entry.patch),
        })),
        catalogCreates: Array.from(new Set(catalogDestinations.flatMap((entry) => [
          ...(entry.createCountry ? [entry.countryRef.path] : []),
          ...(entry.createCity ? [entry.cityRef.path] : []),
        ]))),
      });
      if (options.apply) {
        appendRollback(rollbackPath, document.ref.path, before);
        batch.update(document.ref, {
          ...result.patch,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { lastUpdateTime: document.updateTime });
        writes += 1;
        for (const entry of stops.filter((stop) => stop.patch)) {
          const beforeStop = Object.fromEntries(Object.keys(entry.patch).map((field) => [field, entry.document.data()[field]]));
          appendRollback(rollbackPath, entry.document.ref.path, beforeStop);
          batch.update(entry.document.ref, entry.patch, { lastUpdateTime: entry.document.updateTime });
          writes += 1;
        }
        const now = admin.firestore.FieldValue.serverTimestamp();
        const createdCatalogPaths = new Set();
        for (const destination of catalogDestinations) {
          if (destination.createCountry && !createdCatalogPaths.has(destination.countryRef.path)) {
            createdCatalogPaths.add(destination.countryRef.path);
            appendRollback(rollbackPath, destination.countryRef.path, null, { deleteDocument: true });
            batch.create(destination.countryRef, { ...destination.countryData, createdAt: now, updatedAt: now });
            writes += 1;
          }
          if (destination.createCity && !createdCatalogPaths.has(destination.cityRef.path)) {
            createdCatalogPaths.add(destination.cityRef.path);
            appendRollback(rollbackPath, destination.cityRef.path, null, { deleteDocument: true });
            batch.create(destination.cityRef, {
              ...destination.cityData,
              stats: { ...(destination.cityData.stats || {}), recommendationCount: 0 },
              createdAt: now,
              updatedAt: now,
            });
            writes += 1;
          }
        }
      }
    }
    if (options.apply && writes) await batch.commit();
    processed += snapshot.size;
    lastId = snapshot.docs[snapshot.docs.length - 1].id;
    checkpoint.routes = { lastId, complete: snapshot.size < PAGE_SIZE };
    if (options.apply) writeJson(path.join(options.stateDir, 'checkpoint.json'), checkpoint);
    if (snapshot.size < PAGE_SIZE) break;
  }
}

async function seedActivity(db, options, checkpoint, rollbackPath, report) {
  const byUser = new Map();
  const add = (userId, targetPath, delta, action) => {
    if (!userId || !targetPath) return;
    const entries = byUser.get(userId) || [];
    if (entries.length < options.limit) entries.push({ targetPath, delta, action });
    byUser.set(userId, entries);
  };

  const [favorites, likes] = await Promise.all([
    db.collectionGroup('favorites').get(),
    db.collectionGroup('likes').get(),
  ]);
  favorites.docs.forEach((document) => {
    const data = document.data();
    const userId = data.ownerId || document.ref.parent.parent?.id;
    const targetPath = data.target?.path;
    const isRecommendation = typeof targetPath === 'string' && targetPath.startsWith('recommendations/');
    const isRoute = typeof targetPath === 'string' && targetPath.startsWith('routes/');
    const isCity = typeof targetPath === 'string' && /^countries\/[^/]+\/cities\/[^/]+$/.test(targetPath);
    if (!isRecommendation && !isRoute && !isCity) return;
    const delta = data.type === 'city' || targetPath?.includes('/cities/') ? 6 : 5;
    add(userId, targetPath, delta, 'historical-favorite');
  });
  likes.docs.forEach((document) => {
    const data = document.data();
    const targetRef = document.ref.parent.parent;
    if (['recommendations', 'routes'].includes(targetRef?.parent?.id)) {
      add(data.userId || document.id, targetRef.path, 3, 'historical-like');
    }
  });

  const users = Array.from(byUser.entries()).sort(([left], [right]) => left.localeCompare(right));
  for (const [userId, signals] of users) {
    if (options.resume && checkpoint.activity?.lastUserId && userId <= checkpoint.activity.lastUserId) {
      continue;
    }
    const userRef = db.doc(`users/${userId}`);
    const userSnapshot = await userRef.get();
    if (!userSnapshot.exists) continue;
    const existingPersonalization = userSnapshot.data().personalization;
    if (existingPersonalization?.historySeedVersion === HISTORY_SEED_VERSION) {
      checkpoint.activity = { lastUserId: userId };
      continue;
    }
    let personalization = normalizePersonalization(existingPersonalization, Date.now());
    for (const signal of signals) {
      const target = await db.doc(signal.targetPath).get();
      if (!target.exists) continue;
      const targetType = target.ref.parent.id === 'recommendations'
        ? 'recommendation'
        : target.ref.parent.id === 'routes' ? 'route' : 'city';
      personalization = applyPersonalizationSignal({
        existing: personalization,
        target: {
          id: target.id,
          path: target.ref.path,
          type: targetType,
          ...(target.ref.parent.id === 'cities'
            ? { countryId: target.ref.parent.parent?.id }
            : {}),
        },
        targetData: target.data(),
        delta: signal.delta,
        action: signal.action,
        nowMs: Date.now(),
      }).personalization;
      report.activity.signals += 1;
    }
    if (options.apply && signals.length) {
      personalization.historySeedVersion = HISTORY_SEED_VERSION;
      appendRollback(rollbackPath, userRef.path, { personalization: existingPersonalization });
      await userRef.update({
        personalization,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      report.activity.usersChanged += 1;
      checkpoint.activity = { lastUserId: userId };
      writeJson(path.join(options.stateDir, 'checkpoint.json'), checkpoint);
    }
  }
  report.activity.usersScanned = byUser.size;
}

async function rollback(db, filePath) {
  const lines = fs.readFileSync(path.resolve(filePath), 'utf8').split(/\r?\n/).filter(Boolean).reverse();
  for (const line of lines) {
    const entry = JSON.parse(line);
    if (entry.deleteDocument) {
      await db.doc(entry.path).delete();
      continue;
    }
    const before = decode(entry.before, db);
    const update = {};
    for (const [field, value] of Object.entries(before)) {
      update[field] = value === undefined ? admin.firestore.FieldValue.delete() : value;
    }
    await db.doc(entry.path).update(update);
  }
  return { restored: lines.length };
}

async function run(options) {
  initializeAdmin(admin);
  const db = admin.firestore();
  if (options.rollback) {
    if (!options.apply) throw new Error('Rollback requires --apply.');
    return { mode: 'rollback', ...(await rollback(db, options.rollback)) };
  }

  fs.mkdirSync(options.stateDir, { recursive: true });
  const checkpointPath = path.join(options.stateDir, 'checkpoint.json');
  const checkpoint = options.resume && fs.existsSync(checkpointPath)
    ? JSON.parse(fs.readFileSync(checkpointPath, 'utf8'))
    : {};
  const rollbackPath = path.join(
    options.stateDir,
    `rollback-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`
  );
  const report = {
    mode: options.apply ? 'apply' : 'dry-run',
    users: { scanned: 0, changed: 0 },
    recommendations: { scanned: 0, changed: 0, reviewRequired: 0 },
    routes: { scanned: 0, changed: 0, deactivated: 0, reviewRequired: 0 },
    activity: { usersScanned: 0, usersChanged: 0, signals: 0 },
    audit: { checked: 0, passed: false, errors: [] },
    manifest: [],
    rollbackPath: options.apply ? rollbackPath : null,
  };
  await migrateProfilesAndFacets(db, options, checkpoint, rollbackPath, report);
  await migrateRoutes(db, options, checkpoint, rollbackPath, report);
  await seedActivity(db, options, checkpoint, rollbackPath, report);
  report.audit.passed = report.audit.errors.length === 0 &&
    report.routes.reviewRequired === 0 && report.recommendations.reviewRequired === 0;
  writeJson(path.join(options.stateDir, 'report.json'), report);
  if (options.apply && !report.audit.passed) {
    throw new Error('Post-migration canonical audit failed. Review the local report and rollback data.');
  }
  return report;
}

if (require.main === module) {
  run(parseArgs(process.argv.slice(2))).then((result) => {
    console.log(JSON.stringify({
      mode: result.mode,
      users: result.users,
      recommendations: result.recommendations,
      routes: result.routes,
      activity: result.activity,
      audit: result.audit,
      manifestEntries: result.manifest.length,
      rollbackPath: result.rollbackPath,
    }, null, 2));
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  auditCanonicalPatch,
  migratedRecommendation,
  migratedRoute,
  migratedSmartProfile,
  parseArgs,
  resolveLegacyRecommendationClassification,
  rollback,
  run,
};
