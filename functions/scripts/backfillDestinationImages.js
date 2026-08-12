const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const { initializeAdmin } = require('./localCredentials');
const {
  destinationImageWritePatch,
  destinationJobRef,
  resolveDestinationImageCandidate,
  destinationQuery,
  trackUnsplashDownload,
} = require('../destinationImageService');
const { resolveWikidataIdentity } = require('../destinationIdentityService');

const STATE_DIRECTORY = path.join(__dirname, '..', '.destination-images');

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function manifestPath() {
  const explicit = argumentValue('--manifest');
  return explicit
    ? path.resolve(process.cwd(), explicit)
    : path.join(STATE_DIRECTORY, 'destination-images-manifest.json');
}

function writeManifest(filePath, manifest) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

function hasArgument(name) {
  return process.argv.includes(name);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function sameDestinationImage(current, expected) {
  if (!current && !expected) return true;
  if (!current || !expected || current.source?.type !== expected.source?.type) return false;
  if (expected.source.type === 'unsplash') {
    return current.source.providerPhotoId === expected.source.providerPhotoId;
  }
  return current.source.recommendationId === expected.source.recommendationId &&
    current.source.assetId === expected.source.assetId;
}

function cityAlreadyMatchesEntry(city, entry) {
  // A newer identity is acceptable when the manifest had no confident match;
  // it is strictly more complete than the migration result would have been.
  const identityMatches = !entry.identity ||
    city?.identity?.sourceId === entry.identity.sourceId;
  return identityMatches && sameDestinationImage(city?.destinationImage || null, entry.image || null);
}

async function recordDestinationJob(db, entry) {
  const [, countryId, , cityId] = entry.path.split('/');
  await destinationJobRef(db, countryId, cityId).set({
    countryId,
    cityId,
    identitySync: {
      state: entry.identity ? 'ready' : 'needs_review',
      attempts: entry.identity ? 1 : 0,
      lastAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    imageSync: {
      state: entry.state,
      attempts: 1,
      query: entry.query || null,
      unsplashOutcome: entry.query ? entry.state : 'not_attempted',
      lastAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function createDryRunManifest(db, filePath) {
  const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!unsplashKey) throw new Error('Set UNSPLASH_ACCESS_KEY before running the migration.');
  const existing = fs.existsSync(filePath)
    ? JSON.parse(fs.readFileSync(filePath, 'utf8'))
    : { version: 1, mode: 'dry-run', createdAt: new Date().toISOString(), entries: [] };
  // A previous rate-limit pause is historical once this invocation starts.
  delete existing.pausedAt;
  delete existing.pauseReason;
  delete existing.retryAfterMs;
  const completed = new Set(existing.entries.map((entry) => entry.path));
  const snapshot = await db.collectionGroup('destinations').where('status', '==', 'active').get();

  for (const citySnapshot of snapshot.docs) {
    if (completed.has(citySnapshot.ref.path)) continue;
    const countryRef = citySnapshot.ref.parent.parent;
    if (!countryRef) continue;
    const countrySnapshot = await countryRef.get();
    try {
      const city = citySnapshot.data();
      const country = countrySnapshot.exists ? countrySnapshot.data() : null;
      // This is the only migration-time identity lookup. Its English query is
      // recorded in the manifest and is reused by all retries.
      const identity = city.identity || await resolveWikidataIdentity({ city, country });
      const query = identity
        ? destinationQuery({ ...city, identity }, country)
        : null;
      const candidate = await resolveDestinationImageCandidate({
        db,
        city,
        country,
        countryId: countryRef.id,
        cityId: citySnapshot.id,
        unsplashKey,
        query,
      });
      existing.entries.push({
        path: citySnapshot.ref.path,
        updateTime: {
          seconds: citySnapshot.updateTime.seconds,
          nanoseconds: citySnapshot.updateTime.nanoseconds,
        },
        state: candidate.state,
        identity: identity || null,
        googlePlaceId: city.providerRefs?.googlePlaceId || city.providerIds?.googlePlaceIds?.[0] || null,
        query,
        image: candidate.image || null,
        downloadLocation: candidate.downloadLocation || null,
      });
      writeManifest(filePath, existing);
      if (candidate.rateLimit?.remaining === 0) break;
    } catch (error) {
      existing.errors = existing.errors || [];
      existing.errors.push({
        path: citySnapshot.ref.path,
        message: error.message,
        ...(error.status ? { status: error.status } : {}),
        ...(error.retryAfterMs ? { retryAfterMs: error.retryAfterMs } : {}),
      });
      writeManifest(filePath, existing);
      // Stop immediately on a provider limit. Continuing would only create a
      // noisy manifest and increase the time until Wikidata accepts retries.
      if (error.status === 429) {
        existing.pausedAt = new Date().toISOString();
        existing.pauseReason = 'wikidata_rate_limited';
        existing.retryAfterMs = error.retryAfterMs || null;
        writeManifest(filePath, existing);
        break;
      }
    }
  }
  return existing;
}

async function applyManifest(db, filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Manifest not found: ${filePath}`);
  const manifest = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;
  if (manifest.entries?.some((entry) => entry.image?.source?.type === 'unsplash') && !unsplashKey) {
    throw new Error('Set UNSPLASH_ACCESS_KEY before applying an Unsplash manifest.');
  }
  let applied = 0;
  let conflicts = 0;
  let reconciled = 0;
  for (const entry of manifest.entries || []) {
    if (entry.appliedAt) continue;
    const ref = db.doc(entry.path);
    try {
      const patch = {
        ...destinationImageWritePatch(admin, entry.image),
        ...(entry.identity ? {
          schemaVersion: 2,
          identity: entry.identity,
          providerRefs: {
            googlePlaceId: entry.googlePlaceId || null,
          },
        } : {}),
      };
      await ref.update(
        patch,
        {
          lastUpdateTime: new admin.firestore.Timestamp(
            entry.updateTime.seconds,
            entry.updateTime.nanoseconds
          ),
        }
      );
      await recordDestinationJob(db, entry);
      if (entry.image?.source?.type === 'unsplash') {
        try {
          await trackUnsplashDownload({
            downloadLocation: entry.downloadLocation,
            accessKey: unsplashKey,
          });
        } catch (error) {
          entry.trackingError = error.message;
        }
      }
      entry.appliedAt = new Date().toISOString();
      applied += 1;
    } catch (error) {
      if (error.code === 9 || String(error.message).includes('precondition')) {
        const latest = await ref.get();
        if (latest.exists && cityAlreadyMatchesEntry(latest.data(), entry)) {
          await recordDestinationJob(db, entry);
          entry.appliedAt = new Date().toISOString();
          entry.reconciledAt = entry.appliedAt;
          delete entry.conflict;
          reconciled += 1;
        } else {
          entry.conflict = error.message;
          conflicts += 1;
        }
      } else {
        entry.applyError = error.message;
      }
    }
    writeManifest(filePath, manifest);
  }
  return { applied, reconciled, conflicts };
}

async function activeCityCount(db) {
  return (await db.collectionGroup('destinations').where('status', '==', 'active').get()).size;
}

async function runContinuously(db, filePath, { applyWhenReady }) {
  let previousPrepared = -1;
  while (true) {
    const manifest = await createDryRunManifest(db, filePath);
    const total = await activeCityCount(db);
    const prepared = manifest.entries?.length || 0;
    console.log('Destination image migration progress.', { prepared, total, paused: manifest.pauseReason || null });
    if (prepared >= total) {
      if (applyWhenReady) {
        const result = await applyManifest(db, filePath);
        console.log('Destination image migration apply complete.', { filePath, ...result });
      }
      return { prepared, total, applied: Boolean(applyWhenReady) };
    }
    if (!manifest.pauseReason && prepared <= previousPrepared) {
      throw new Error('Migration made no progress; inspect the manifest errors before retrying.');
    }
    previousPrepared = prepared;
    // Wait at least one minute after a provider pause. This keeps the process
    // automatic without hammering Wikidata when it asks us to slow down.
    const delayMs = Math.max(60 * 1000, Number(manifest.retryAfterMs || 0));
    console.log(`Migration will resume automatically in ${Math.ceil(delayMs / 1000)} seconds.`);
    await sleep(delayMs);
  }
}

async function main() {
  initializeAdmin(admin);
  const db = admin.firestore();
  const filePath = manifestPath();
  if (hasArgument('--continuous')) {
    const result = await runContinuously(db, filePath, { applyWhenReady: hasArgument('--apply-when-ready') });
    console.log('Continuous destination image migration complete.', { filePath, ...result });
  } else if (hasArgument('--apply')) {
    const result = await applyManifest(db, filePath);
    console.log('Destination image migration apply complete.', { filePath, ...result });
  } else {
    const manifest = await createDryRunManifest(db, filePath);
    console.log('Destination image dry run complete.', {
      filePath,
      prepared: manifest.entries.length,
      errors: manifest.errors?.length || 0,
    });
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  applyManifest,
  activeCityCount,
  createDryRunManifest,
  manifestPath,
  runContinuously,
};
