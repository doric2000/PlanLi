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

async function createDryRunManifest(db, filePath) {
  const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!unsplashKey) throw new Error('Set UNSPLASH_ACCESS_KEY before running the migration.');
  const existing = fs.existsSync(filePath)
    ? JSON.parse(fs.readFileSync(filePath, 'utf8'))
    : { version: 1, mode: 'dry-run', createdAt: new Date().toISOString(), entries: [] };
  const completed = new Set(existing.entries.map((entry) => entry.path));
  const snapshot = await db.collectionGroup('cities').where('status', '==', 'active').get();

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
        entry.conflict = error.message;
        conflicts += 1;
      } else {
        entry.applyError = error.message;
      }
    }
    writeManifest(filePath, manifest);
  }
  return { applied, conflicts };
}

async function main() {
  initializeAdmin(admin);
  const db = admin.firestore();
  const filePath = manifestPath();
  if (process.argv.includes('--apply')) {
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
  createDryRunManifest,
  manifestPath,
};
