# PlanLi
Our Application for our final Project in Software Engineering.

## Run the client

```powershell
cd client
npm install
npm run web
```

Use `npm run android` or `npm run ios` for a native Expo target.

## Web development (Google Places without CORS extensions)

On web, the Google Places API is blocked by browser CORS. This repo includes a small Express proxy so you can keep any CORS-unblock extension **off** (those extensions can break Firebase/Firestore WebChannel).

1. Create `server/.env` (you can copy `server/.env.example`) and set `GOOGLE_MAPS_KEY`.
2. Start the proxy: `cd server` then `npm install` and `npm run start`.
3. Run the client web app as usual. The web client defaults to `http://localhost:5000` for the proxy.

Optional: override the proxy base URL via `EXPO_PUBLIC_PLACES_PROXY_BASE_URL`.

### Windows: run the proxy with live Places logs

If you want a dedicated terminal window that shows every Places request/response (autocomplete/details), use:

- `server/run-server-with-logs.cmd`

This script:
- Runs the server from the correct folder.
- Loads `server/.env` via `dotenv` (so `GOOGLE_MAPS_KEY` must be set).
- Keeps the window open so you can see live logs while testing the web app.

## Canonical European image pipeline

PlanLi uses one media schema, without v1/v2 branches:

- `large`: details and hero images.
- `feed`: full-width cards, editing previews and profile headers.
- `thumb`: grids, maps, favorites and small avatars.

The client uploads one bounded, high-quality JPEG to a temporary staging path.
`prepareMedia` runs in `europe-west1`, removes EXIF/GPS data and creates three
immutable WebP variants directly from that source. The source is removed after
successful processing. Prepared media that is never attached to a Firestore
document is removed automatically after 24 hours.

Firestore is already in `eur3`. Create the configured
`planli-f0b12-media-eu` bucket in `europe-west1` from Firebase Console
(`Storage` > `Add bucket`). A bucket location cannot be changed after
creation, so the existing US bucket is retained only as the migration source
and rollback copy.

Set these values before deployment:

```powershell
# client/.env (ignored; do not commit)
EXPO_PUBLIC_FIREBASE_MEDIA_BUCKET=planli-f0b12-media-eu

# functions/.env.YOUR_PROJECT_ID (ignored; do not commit)
MEDIA_STORAGE_BUCKET=planli-f0b12-media-eu
```

Run the migration from `functions`; it is dry-run by default:

```powershell
cd C:\path\to\PlanLi\functions
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\secure\service-account.json"
npm install
npm run migrate-media -- --source-bucket "planli-f0b12.firebasestorage.app" --target-bucket "planli-f0b12-media-eu"
npm run migrate-media -- --source-bucket "planli-f0b12.firebasestorage.app" --target-bucket "planli-f0b12-media-eu" --apply
```

Resume an interrupted apply:

```powershell
npm run migrate-media -- --source-bucket "planli-f0b12.firebasestorage.app" --target-bucket "planli-f0b12-media-eu" --apply --resume
```

State and the JSONL rollback audit are stored locally under
`functions/.canonical-media-migration/` and ignored by Git. Restore the old
Firestore media fields with:

```powershell
npm run migrate-media -- --apply --rollback ".canonical-media-migration\rollback-<timestamp>.jsonl"
```

Do not remove the US objects until the European client, Functions, Firestore
references and visual quality have all been verified.

Cutover order from the repository root:

```powershell
# 1. After creating the European bucket, deploy its targeted rules.
firebase deploy --only storage:media --project planli-f0b12
gcloud storage buckets update gs://planli-f0b12-media-eu --cors-file=storage.cors.json --lifecycle-file=storage.lifecycle.json

# 2. Deploy the Europe-configured Functions.
firebase deploy --only functions --project planli-f0b12
```

If Firebase detects matching US Functions during the region change, keep them
temporarily by answering **No** to deletion. Run the dry-run and applied media
migration, restart the local client with `npx expo start -c`, then test upload,
save, edit and delete. Finally inspect `firebase functions:list` and delete only
the confirmed `us-central1` copies:

```powershell
firebase functions:delete FUNCTION_NAME --region us-central1 --project planli-f0b12
```

All callable clients use `europe-west1` explicitly, and all media reads/writes
use `planli-f0b12-media-eu`.

## Favorite referential integrity

Favorites are removed automatically for every user when their recommendation,
route or city source document is deleted. The cleanup triggers run in
`europe-west1`; Firestore rules also reject a new favorite when its source no
longer exists.

Deploy the required collection-group indexes first from the repository root,
wait for them to become `Enabled` in Firebase Console, then deploy Functions
and rules:

```powershell
cd C:\path\to\PlanLi
firebase deploy --only firestore:indexes --project planli-f0b12
firebase deploy --only functions --project planli-f0b12
firebase deploy --only firestore:rules --project planli-f0b12
```

Clean favorites that became orphaned before the triggers were deployed. Run
the dry-run first from `functions`; only the second command deletes data:

```powershell
cd C:\path\to\PlanLi\functions
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\secure\service-account.json"
npm run cleanup-orphan-favorites
npm run cleanup-orphan-favorites -- --apply
```

Unknown future favorite types and malformed records are reported but never
deleted automatically by this one-time script.

## Security rollout: destinations, public profiles, Firestore and Storage

The rollout is intentionally staged so an older client is not blocked by the
new rules. Use Node.js 22 for Firebase Functions and run each command from the
directory shown below. Replace `YOUR_PROJECT_ID` with the Firebase project ID.

### 1. Local verification

From the repository root:

```powershell
cd C:\path\to\PlanLi
cd functions
npm install
npm test
npm run test:rules:emulator
cd ..\client
npm install
npm test -- --runInBand
```

`test:rules:emulator` starts temporary Firestore and Storage emulators, runs
the security tests, and stops them automatically.

### 2. Configure the Places secret and deploy Functions

Run from the repository root, not from `client`:

```powershell
cd C:\path\to\PlanLi
firebase login
firebase functions:secrets:set GOOGLE_MAPS_KEY --project YOUR_PROJECT_ID
firebase deploy --only functions --project YOUR_PROJECT_ID
```

The secret command prompts for the Google Maps/Places server key without
writing it to the repository. The Functions deployment adds:

- `saveRecommendation`, which validates the caller, place and uploaded media
  before atomically writing the destination and recommendation.
- `resolveRecommendationDestination`, which resolves the exact server-owned
  country/city preview before media upload. Enable both Places API and
  Geocoding API for `GOOGLE_MAPS_KEY`; restrict the key to those APIs.
- `onPublicProfileSync`, which copies only public profile fields from `users`
  to `publicProfiles`.
- Existing recommendation counters and media-cleanup triggers.

Country resolution uses Google place/city details, Google reverse geocoding,
and a local Natural Earth 5.1.1 fallback. The versioned Israel policy maps the
West Bank, East Jerusalem and the Golan Heights to Israel; Gaza follows the
normal provider/local-boundary result. Regenerate the checked-in geography
file only when intentionally updating its source version:

```powershell
cd C:\path\to\PlanLi\functions
npm run build-country-geo
```

### 3. Backfill existing public profiles

The backfill is a dry run by default. Run it from `functions` with Admin
credentials:

```powershell
cd C:\path\to\PlanLi\functions
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\secure\service-account.json"
npm run backfill-public-profiles
npm run backfill-public-profiles -- --apply
```

If an applied run is interrupted:

```powershell
npm run backfill-public-profiles -- --apply --resume
```

The script never copies email, budget, trust scores or other private fields.
It stores a resumable checkpoint in `_migrations/publicProfilesV1`.

### 4. Release the updated client

Publish the web/iOS/Android client through the normal release process only
after Functions and the public-profile backfill are available. The new client
reads author data from `publicProfiles`, previews unknown destinations without
writing them, and saves recommendations through `saveRecommendation`.

### 5. Deploy the hardened rules

After confirming that the updated client is active, run from the repository
root:

```powershell
cd C:\path\to\PlanLi
firebase deploy --only firestore:rules,storage --project YOUR_PROJECT_ID
```

Do not deploy these rules before the client rollout: older clients that write
recommendations or destinations directly will receive `permission-denied`.

### Monitoring and rollback

After deployment, monitor Cloud Functions logs plus Firestore and Storage
denials in Firebase/Google Cloud. Smoke-test this exact flow:

1. Upload recommendation images.
2. Save a recommendation for a city that is not yet in Firestore.
3. Confirm the country/city and public author profile appear.
4. Edit and then delete the recommendation.

## Destination schema compatibility and country metadata

New countries and cities keep the legacy Firestore layout: the localized
country/city name is the document ID, while the ISO code and Google Place ID
are fields used for deduplication. Country documents contain only `name`,
`code`, `region`, and `currencyCode`; city creation uses the existing city
field shape.

REST Countries v5 is the live metadata source. Configure its production key
as a Firebase secret from the repository root:

```powershell
cd C:\path\to\PlanLi
firebase functions:secrets:set REST_COUNTRIES_KEY --project YOUR_PROJECT_ID
```

The scheduled `syncCountryMetadataScheduled` function refreshes existing
country metadata every Monday at 03:00 Asia/Jerusalem time. If the API is
temporarily unavailable, the pinned zero-dependency `countries-list` dataset
is used without writing arbitrary `USD`/`Global` defaults. Sync results and
errors are written to Cloud Logging; the function does not create support
collections in Firestore.

Run an on-demand metadata check from `functions`. It is a dry run unless
`--apply` is present:

```powershell
cd C:\path\to\PlanLi\functions
$env:REST_COUNTRIES_KEY="your-local-key"
npm run sync-country-metadata -- --code MM
npm run sync-country-metadata -- --code MM --apply
```

Do not put the key in source control or paste it into logs.

The destination compatibility migration is also dry-run first:

```powershell
cd C:\path\to\PlanLi\functions
npm run migrate-destination-schema
npm run migrate-destination-schema -- --apply
```

The apply phase retains source documents. After recommendation counters have
settled, run the guarded cleanup:

```powershell
npm run migrate-destination-schema -- --cleanup
```

If apply is interrupted, resume it with:

```powershell
npm run migrate-destination-schema -- --apply --resume
```
5. Confirm removed media is cleaned up.

If permission failures affect production, restore the preceding Firestore and
Storage rules release from the Firebase Console (Rules → Release history), or
redeploy the previous rule files from Git. Functions can remain deployed
because they are additive and use the Admin SDK.
