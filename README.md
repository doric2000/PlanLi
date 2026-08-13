# PlanLi

PlanLi is a photo-first travel application built with Expo and Firebase.

## Current environment status

The PlanLi client has **not** been publicly released to the App Store, Google
Play, TestFlight, or a public web domain. During the current stabilization phase
the iPhone client runs in Expo Go. A signed Development Build and a small
private preview are deferred until the application is ready for final native
validation. The deployed Firebase backend is not evidence of a public client
release.

## Run the client

Run these commands from the `client` directory:

```powershell
cd C:\Users\doric\Documents\PlanLi\PlanLi\client
npm install
npx expo start -c
```

Scan the QR code with Expo Go. For Web, run `npm run web` in a separate terminal.

The local client must contain these bucket values in `client/.env`:

```text
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=planli-f0b12-media-eu
EXPO_PUBLIC_FIREBASE_MEDIA_BUCKET=planli-f0b12-media-eu
```

### Maps during Expo Go development

The iOS/Android maps use `react-native-maps` with OpenStreetMap tiles so they can
run inside Expo Go. The Web maps continue to use MapLibre GL 5.24 with
MapTiler's `Dataviz Light` style. A local Web session uses the testing key from
the ignored `client/.env` file:

```text
EXPO_PUBLIC_MAPTILER_KEY=...
```

The mobile maps do not require a MapTiler key. A future public Web deployment
can use a separate origin-restricted key:

```text
EXPO_PUBLIC_MAPTILER_WEB_KEY=...  # public web domain/origin restriction
```

Ordinary JavaScript changes only require Fast Refresh or restarting Metro:

```powershell
# Local Web on this Windows computer.
npx expo start --web
```

Before release, repeat the native map and permission smoke tests in a signed
Development Build. The `development` and `preview` EAS profiles remain prepared
for that later step; neither represents a production release.

## Canonical data model

The application has one database and media schema. There are no permanent
v1/v2 branches.

```text
users/{uid}
publicProfiles/{uid}

recommendations/{id}
recommendations/{id}/likes/{uid}
recommendations/{id}/comments/{commentId}

routes/{id}
routes/{id}/days/{dayId}
routes/{id}/days/{dayId}/stops/{stopId}
routes/{id}/likes/{uid}
routes/{id}/comments/{commentId}

trips/{id}
countries/{countryId}/cities/{cityId}

users/{uid}/favorites/{sha256OfTargetPath}
users/{uid}/notifications/{notificationId}
system/**
```

Countries use stable `cty_...` IDs and cities use stable `city_...` IDs.
Names and provider identifiers can change without breaking references.

All business writes use callable Functions in `europe-west1`. The client does
not directly write recommendations, routes, trips, favorites, reactions,
comments, notifications, public profiles, or destination catalog documents.

Favorites contain a server-generated preview. A favorite tab therefore needs
one query and does not perform an extra read for every card. Source triggers
refresh previews and remove favorites when their source is deleted; a bounded
daily repair job handles rare missed events.

### Travel preferences and recommendation facets

Private travel preferences live only at `users/{uid}.smartProfile` and use
stable IDs. The canonical fields are `setupRequired`, `completedAt`,
`interests`, `budget`, `travelParties`, `vibe`, `travelerStyles`, `pace`,
and `needs`. Only
interests and vibes are copied to `publicProfiles`; budget, party,
practical needs, and learned activity stay private.

The source of truth for profile options, recommendation categories, and post
tags is `shared/travelTaxonomy.json`. Generated client and Functions copies
must pass `npm run test:travel-taxonomy` from the repository root. Post tags
are stored as stable IDs; Hebrew labels are presentation only. Every selectable
tag must either map explicitly to recommendation facets or be marked
`displayOnly`. Generic accessibility and proximity to Chabad are never treated
as wheelchair-accessible or Shabbat-friendly guarantees.

Roll out taxonomy changes in this order: required Firestore indexes, Functions,
the supported client, and only then the reviewed personalization migration.
Never run the migration with `--apply` as part of an ordinary client/backend
deployment.

Recommendations and routes store server-derived `facets`. Interests are
derived only from canonical categories and subcategories; they are not a
second author-entered classification. `audienceScope` distinguishes content
for everyone from content aimed at selected audiences. Practical needs use
`needsScope: recommendation` for a single recommendation and
`needsScope: entire_route` only after the author confirms the fact for every
part of a route. Missing needs metadata never counts as a match.

Recommendation facets may contain interests, audiences, vibes, needs,
budget level, and environment. Traveler style and season are deliberately
empty for recommendations because those describe a trip, not an individual
place. Routes additionally store traveler styles and seasons plus canonical difficulty,
experience, transport, pace, duration, distance, and destinations derived from
verified stops. The server also builds bounded normalized search tokens and
prefixes; clients never write `facets`, `search`, or route destinations
directly.

The generated relationship map is `docs/travel-taxonomy-map.md`. Categories
and subcategories form the content tree; interests, audiences, vibes, traveler
styles, practical needs, seasons, and environments remain cross-cutting axes.
Do not edit generated taxonomy copies or the relationship map manually.

Personalized discovery keeps only
bounded aggregate scores and recent-open deduplication state inside the private
user document. Do not add a raw behavioral-event collection.

The personalization migration is dry-run by default and writes local reports
under the ignored canonical migration state directory:

```powershell
cd C:\Users\doric\Documents\PlanLi\PlanLi\functions
npm run migrate-personalization
npm run migrate-personalization -- --resume
# Only after reviewing the report and taking the required backup:
npm run migrate-personalization -- --apply
```

The v4 migration also rebuilds recommendation/route search fields, maps legacy
`attractions` entries only when their content is unambiguous, migrates legacy
backpacker/digital-nomad values to traveler styles, seeds bounded route
affinity, and marks empty broken routes inactive without deleting their media
or interactions. Any ambiguous recommendation or route keeps the migration
audit from passing and must be reviewed before `--apply`.

The taxonomy-v5 budget migration separates `free` (חינם) from `economy` (₪).
It is dry-run by default, refuses unclassified legacy `economy` content, and
writes a private rollback checkpoint before applying changes:

```powershell
cd C:\Users\doric\Documents\PlanLi\PlanLi\functions
npm run migrate-budget-taxonomy
# Only after reviewing every classified record:
npm run migrate-budget-taxonomy -- --apply
# Restore the exact previous budget/version fields if a rollback is required:
npm run migrate-budget-taxonomy -- --rollback .budget-taxonomy-v5\<checkpoint>.json
npm run audit-live
```

Recommendation content curation is also dry-run by default. A dry run scans
the live collection, applies canonical taxonomy rules plus an optional ignored
override file, and writes a reviewable manifest containing each document's
Firestore `updateTime` precondition. Only high-confidence entries are eligible
for `--apply`; concurrent edits, ambiguous places, and engaged placeholders are
reported instead of overwritten. Reports, checkpoints, manifests, and rollback
data stay under the ignored `functions/.recommendation-curation/` directory.

```powershell
cd C:\Users\doric\Documents\PlanLi\PlanLi\functions
npm run curate-recommendations -- --overrides .recommendation-curation\overrides.json
npm run curate-recommendations -- --apply --manifest .recommendation-curation\manifests\<manifest>.json
npm run curate-recommendations -- --apply --resume --manifest .recommendation-curation\manifests\<manifest>.json
npm run curate-recommendations -- --apply --rollback .recommendation-curation\rollback-<timestamp>.jsonl
```

Exact-place changes require a verified Place ID, coordinates, a verification
date, and a source URL. Broad activities remain city-level and must not be
pinned to a city centre. Current prices or opening hours require a dated
official source; otherwise the claim must be removed or softened before apply.

## European image pipeline

The active Firebase Storage bucket is:

```text
planli-f0b12-media-eu (europe-west1, STANDARD)
```

Each selected source photo is uploaded to a user-owned staging path.
`prepareMedia` removes EXIF/GPS metadata and generates three immutable WebP
files directly from the source:

- `large` for details and hero views.
- `feed` for full-width cards and editing previews.
- `thumb` for grids, maps, favorites and avatars.

The UI keeps at most three image components mounted in each carousel. Feed
lists render in bounded batches and remote images use memory/disk caching.

The former US bucket `planli-f0b12.firebasestorage.app` is read-only and is
kept only as a 30-day rollback snapshot. Do not remove it before 30 August
2026 and before `npm run audit-live` reports zero US references.

## Local Admin authentication

Maintenance scripts do not use a local Service Account JSON key. They use:

1. `GOOGLE_APPLICATION_CREDENTIALS` when standard ADC is explicitly set; or
2. the signed-in Firebase CLI user and a short-lived temporary ADC file that
   is deleted when the process exits.

Sign in once:

```powershell
firebase login
```

The Cloud Functions runtime uses two keyless, least-privilege accounts:

- `planli-core-functions@planli-f0b12.iam.gserviceaccount.com`
- `planli-media-functions@planli-f0b12.iam.gserviceaccount.com`

IAM setup is dry-run by default:

```powershell
cd C:\Users\doric\Documents\PlanLi\PlanLi\functions
npm run configure-function-iam
npm run configure-function-iam -- --apply
```

## Verification

Run Functions tests from `functions`:

```powershell
cd C:\Users\doric\Documents\PlanLi\PlanLi\functions
npm install
npm test
npm run test:rules:emulator
npm audit --omit=dev
```

Run client tests and builds from `client`:

```powershell
cd C:\Users\doric\Documents\PlanLi\PlanLi\client
npm install
npm test -- --runInBand
npx expo export --platform web --output-dir .expo-validation\web
npx expo export --platform android --output-dir .expo-validation\android
```

The read-only live audit checks every Firestore document, favorite target,
interaction counter, destination ID, media URL and both bucket inventories:

```powershell
cd C:\Users\doric\Documents\PlanLi\PlanLi\functions
npm run audit-live
```

It writes nothing to Firestore and creates no support collection.

## Firebase backend deployment (not client distribution)

These commands update the shared Firebase backend used by the local client.
They do not publish the PlanLi client to users, an app store, TestFlight, or a
website.

Run Firebase deployments from the repository root:

```powershell
cd C:\Users\doric\Documents\PlanLi\PlanLi
firebase deploy --only firestore:indexes,firestore:rules --project planli-f0b12
firebase deploy --only functions --project planli-f0b12
firebase deploy --only storage --project planli-f0b12
```

The Storage deployment applies the normal rules to the EU bucket and the
read-only rollback rules to the US bucket. `storage.cors.json` restricts web
origins, and `storage.lifecycle.json` removes abandoned staging objects.

The server secrets are configured from the repository root:

```powershell
firebase functions:secrets:set GOOGLE_MAPS_KEY --project planli-f0b12
firebase functions:secrets:set REST_COUNTRIES_KEY --project planli-f0b12
firebase functions:secrets:set OPENWEATHER_API_KEY --project planli-f0b12
firebase functions:secrets:set UNSPLASH_ACCESS_KEY --project planli-f0b12
```

`GOOGLE_MAPS_KEY` must be restricted to Places and Geocoding APIs.
`OPENWEATHER_API_KEY` is used only by the server-side destination overview;
the client does not call the weather provider directly.
`UNSPLASH_ACCESS_KEY` is used by the asynchronous destination-image selector.
Unsplash images remain hotlinked and their photographer attribution is shown
by the client.

## Maintenance and recovery

Migration commands are dry-run unless `--apply` is present. Their checkpoints
and rollback reports live only in ignored local directories; they never create
Firestore migration collections.

```powershell
cd C:\Users\doric\Documents\PlanLi\PlanLi\functions

# Prepare and review the resumable destination-image manifest. These local
# environment variables should contain the same provider credentials as the
# deployed secrets.
$env:GOOGLE_MAPS_KEY='<google-key>'
$env:UNSPLASH_ACCESS_KEY='<unsplash-access-key>'
npm run backfill-destination-images
npm run backfill-destination-images -- --apply

# Preview or repair active destinations that still have no canonical image.
# The resolver keeps the verified Unsplash/recommendation policy and uses a
# licensed Wikimedia Commons landscape only after anchoring it to an exact
# nearby Wikipedia city page. Repeat --city to target specific city IDs.
npm run repair-missing-destination-images -- --city '<city-id>'
npm run repair-missing-destination-images -- --apply --city '<city-id>'

# Verify or resume US -> EU object copying.
npm run migrate-storage-eu
npm run migrate-storage-eu -- --apply --resume

# Verify or restore the read-only US rollback snapshot from verified EU files.
npm run migrate-storage-eu -- --restore-source
npm run migrate-storage-eu -- --restore-source --apply --resume

# Verify canonical Firestore data or resume an interrupted migration.
npm run migrate-database

# Preview and apply country language/calling-code enrichment.
npm run sync-country-metadata
npm run sync-country-metadata -- --apply

# Preview and apply nearest-airport facts from OurAirports.
npm run sync-airport-facts
npm run sync-airport-facts -- --apply
npm run migrate-database -- --apply --resume

# Detect or remove orphan favorites.
npm run cleanup-orphan-favorites
npm run cleanup-orphan-favorites -- --apply

# Recalculate canonical city recommendation counters (dry-run first).
node scripts/recalculateCityRecommendationCounts.js
node scripts/recalculateCityRecommendationCounts.js --apply
```

Firestore PITR and a seven-day daily backup schedule are enabled. Content and
account deletion use resumable server jobs because deleting a Firestore parent
document does not delete its subcollections.

## App Check before public launch

App Check enforcement remains intentionally disabled during private
Development Build and preview testing. Before a public release, configure
platform providers and private debug tokens for local/CI builds, then deploy
Functions with:

```powershell
$env:PLANLI_ENFORCE_APP_CHECK="true"
firebase deploy --only functions --project planli-f0b12
Remove-Item Env:PLANLI_ENFORCE_APP_CHECK
```

Do not enable enforcement before every Web, Android and iOS build can attach a
valid App Check token; otherwise all callable requests from that client are
rejected.
