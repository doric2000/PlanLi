# PlanLi

PlanLi is a photo-first travel application built with Expo and Firebase.

## Current environment status

PlanLi has an external TestFlight beta; it has not been publicly released to the
App Store, Google Play, or a public web domain. Native development is performed
with an installed, signed EAS Development Build connected to Metro. Expo Go is
not supported. TestFlight build `1.1.0 (13)` is installed and in use on the
owner's physical iPhone. It has been submitted for external TestFlight
distribution and is waiting for Apple's Beta App Review as reported on
2026-08-22. The production profile uses the `production` EAS Update channel and
runtime `1.1.0`. Transparent-brand production update group
`afd8632f-46a4-4f88-aa22-170dc4178d04` was published for iOS
(`01a02fe2-4be5-7057-b09e-cadb67023cfc`) and Android
(`01a02fe2-4be5-739a-a98b-87e2884d81e3`) at `2026-08-23T18:29:14.853Z` from
merge commit `2002f88`. Delivery and application on the physical iPhone remain
unverified. App version and
runtime remain `1.1.0`, TestFlight build remains `13`, and no native build or
Apple submission was created. RoadTrip lifecycle PR `#175` is merged as
`3ec0cb1`. `saveRoute` and `publishRouteDraft` were deployed from that merge at
approximately `2026-08-23T18:41:49Z`; active revisions are
`saveroute-00039-ban` and `publishroutedraft-00004-tox`. Both remain Node.js 22
v2 callables in `europe-west1`, their rollout startup probes passed, and no
Function errors were present in the post-deploy log page. Preview EAS Update
group `58425c2b-993a-42fc-83b5-c244f5cdf7c9` was published from the same commit
at `2026-08-23T18:53:26.326Z` for runtime `1.1.0`. No signed iOS preview-profile
build exists, so application and physical-iPhone verification are unverified;
the production channel remains on group
`afd8632f-46a4-4f88-aa22-170dc4178d04`. Firestore Rules, indexes, Storage,
Hosting, production documents, migrations, and all other Functions were
unchanged.

## Run the client

PlanLi development and Firebase tooling use Node.js 22. From the repository
root, switch to the version declared in `.nvmrc` before installing packages or
running Expo, Functions, emulators, or Firebase CLI commands:

```powershell
nvm use 22
node --version
```

If the Firebase MCP server reports an unsupported Node version, switch the
Codex host to Node 22 and restart Codex so the MCP process inherits it.

Run these commands from the `client` directory:

```powershell
cd C:\Users\doric\Documents\PlanLi\PlanLi\client
npm install
npx expo start --dev-client -c
```

Open the project from an installed PlanLi Development Build. Expo Go cannot load
the native Google Sign-In module. For Web-only work, run `npm run web` in a
separate terminal; Apple and Google buttons are intentionally hidden on Web.

The local client must contain these bucket values in `client/.env`:

```text
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=planli-f0b12-media-eu
EXPO_PUBLIC_FIREBASE_MEDIA_BUCKET=planli-f0b12-media-eu
```

### Notification Center and native push rollout

The source tree contains the `1.1.0` Notification Center and the
`expo-notifications` native plugin. This does not change the live `1.0.0`
TestFlight binary or deployed Firebase backend. The Firestore inbox remains the
authoritative record on iOS, Android and Web; Expo push is opt-in and is not used
for browser notifications. Expo Go cannot exercise remote push, and the plugin
requires a newly authorized EAS Development Build before device testing.

Before an authorized push rollout:

1. Configure APNs and FCM credentials for the existing EAS project, enable Expo
   enhanced push security, and store its access token without committing it:

```powershell
firebase functions:secrets:set EXPO_PUSH_ACCESS_TOKEN --project planli-f0b12
```

2. Deploy the reviewed notification indexes, Rules and Functions in that order.
   Do not distribute the `1.1.0` binary until all three deployed boundaries are
   compatible with its `appVersion` runtime.
3. Choose and record a UTC cutoff after the new producers are live. The cleanup
   is resumable and dry-run-only unless both apply flags match exactly:

```powershell
cd C:\Users\doric\Documents\PlanLi\PlanLi\functions
npm.cmd run cleanup-legacy-notifications -- --cutoff=REPLACE_WITH_REVIEWED_UTC_CUTOFF
npm.cmd run cleanup-legacy-notifications -- --cutoff=REPLACE_WITH_REVIEWED_UTC_CUTOFF --apply --confirm-cutoff=REPLACE_WITH_REVIEWED_UTC_CUTOFF
```

The apply command performs production deletions and therefore requires separate
migration authorization after its dry-run has been reviewed. It deletes only
inbox rows at or before the immutable cutoff, preserves later schema-v2 events,
and rebuilds per-channel unread counters. Never run it as part of an ordinary
Functions or client deployment.

4. Build and install an authorized `1.1.0` development binary on physical iOS
   and Android devices. Verify denied, provisional and authorized permissions;
   foreground/background/terminated delivery; cold-start taps; token rollover;
   missing targets; and receipt processing. An Expo ticket is only acceptance by
   Expo—the scheduled receipt worker is the delivery diagnostic boundary.

The on-demand iOS simulator smoke test is defined in
`client/.eas/workflows/e2e-test-ios.yml`. It runs only when a pull request is
labeled `ios-e2e`; it is not a per-commit gate and must not be triggered without
authorization for a remote EAS build. It checks the guest/authentication shell
without credentials or destructive administrator actions.

### Maps during development

The iOS/Android maps use `react-native-maps` with OpenStreetMap tiles inside a
Development Build. The Web maps continue to use MapLibre GL 5.24 with
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

Before release, repeat the native map and permission smoke tests in the active
signed Development Build. The `development` and `preview` EAS profiles are
configuration only; neither represents a production release.

### Native authentication release gate

The client keeps password authentication, supports native Google on iOS and
Android, and shows the official Apple button on iOS. Facebook and the legacy
Expo AuthSession proxy are not used. Before requesting a replacement
Development Build or any release build:

1. Enable Sign in with Apple for the primary App ID
   `com.planli.planlitravels` and create a Sign in with Apple key.
2. Enable Google and Apple in Firebase Authentication. Configure Apple's Team
   ID, Key ID, private key and Services ID. Register
   `https://planli-f0b12.firebaseapp.com/__/auth/handler` as the return URL and
   register Firebase's sending address with Apple Private Email Relay.
3. Download the current `GoogleService-Info.plist` for the same bundle ID and
   replace `client/GoogleService-Info.plist`. Confirm that Google Cloud contains
   an iOS OAuth client, reversed URL scheme and a Web OAuth client.
4. Set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` in the EAS `development`, `preview`
   and `production` environments. This is a public OAuth identifier, not a
   private API secret. Also set the bundle-restricted `GOOGLE_MAPS_IOS_KEY` and
   `GOOGLE_MAPS_ANDROID_KEY`; the current native config validates both during
   every EAS build.
5. Configure the server-side Apple key without committing it:

```powershell
firebase functions:secrets:set APPLE_SIGN_IN_PRIVATE_KEY --project planli-f0b12
```

The current legal drafts are available in-app and are configured for Firebase
Hosting at `https://planli-f0b12.web.app/terms` and
`https://planli-f0b12.web.app/privacy`. The legal and support pages are already
reachable on Firebase Hosting; their deployed version must still be compared
with the release commit before every beta or store submission. They require
legal review plus final contact details before a public release.

Before App Store submission, publish the privacy URL, expose it inside the app,
complete App Store Connect's data-practice answers, and retain in-app account
deletion and social-credential revocation. The registration checkbox is a
PlanLi audit choice, not a separate Apple checkbox requirement. Recheck the
current [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
and [App Privacy instructions](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/)
as part of every release review.

Brand icon, adaptive-icon, splash and favicon changes require a replacement EAS
Development Build to appear in the installed native shell. JavaScript-only auth
screen changes appear after reconnecting or refreshing Metro.

At the next authorized Functions deployment, provide these parameter values
when prompted:

```text
APPLE_SIGN_IN_TEAM_ID=<Apple Team ID>
APPLE_SIGN_IN_KEY_ID=<Sign in with Apple Key ID>
APPLE_SIGN_IN_CLIENT_ID=com.planli.planlitravels
```

The account-deletion callable exchanges and revokes a fresh Apple authorization
code before deleting the user's data. Deploy the updated Functions before
distributing a client build that exposes Apple sign-in. Build and submission
remain explicit release operations; merging source code does not perform them.

## Open-registration TestFlight beta release

Current release record:

- App version/build: `1.1.0 (13)`.
- Installed state: running on the owner's physical iPhone through TestFlight.
- EAS build: `6d00f03e-dad3-45cc-9e85-336097f5a420`, created from notification
  center commit `4656434` with the `production` profile and runtime `1.1.0`.
- Source release: RoadTrip lifecycle PR `#175`, merged as commit `3ec0cb1`.
- Preview EAS Update: group `58425c2b-993a-42fc-83b5-c244f5cdf7c9`, runtime
  `1.1.0`, iOS update `01a02ff8-71b6-78f1-a711-cdb84adb5b78`, Android update
  `01a02ff8-71b6-7808-a3ef-d86db45dfbaa`, published from `3ec0cb1` at
  `2026-08-23T18:53:26.326Z` with the `production` EAS environment. There is no
  signed iOS preview-profile build, so download, application, and physical-device
  behavior remain unverified.
- Production EAS Update: group `afd8632f-46a4-4f88-aa22-170dc4178d04`, runtime
  `1.1.0`, iOS update `01a02fe2-4be5-7057-b09e-cadb67023cfc`, Android update
  `01a02fe2-4be5-739a-a98b-87e2884d81e3`, published from `2002f88` at
  `2026-08-23T18:29:14.853Z`. This RoadTrip task did not publish it. Roll back
  by republishing the prior production group
  `9602e8f0-0c25-4a5e-9872-b82aaa68a1f4` to `production`.
- Firebase release: 92 active Node.js 22 v2 Functions in `europe-west1`.
  `saveRoute` and `publishRouteDraft` were deployed from `3ec0cb1` at
  approximately `2026-08-23T18:41:49Z`. Active revisions are
  `saveroute-00039-ban` and `publishroutedraft-00004-tox`; both report ACTIVE,
  Node.js 22, v2, `europe-west1`, successful startup probes, and no errors in the
  post-deploy log page. Firestore Rules, indexes, Storage Rules, Hosting,
  production documents, and the other 90 Functions were not changed.
- RoadTrip validation: changed-scope validation passed 37 client tests and 26
  selected Function tests; the broader focused Node.js 22 route draft/location
  run passed 37 tests. PR `#175` passed plan, affected-client,
  affected-Functions, and final PR checks. The physical-iPhone create/resume,
  switch, direct stop edit/add/insert/remove/reorder, autosave retry, and
  order-only publish matrix remains unverified because no compatible signed
  preview client exists.
- Validation: four focused auth/navigation suites passed all 33 tests, the iOS
  release configuration check and export passed, and PR `#169` passed its plan,
  affected-client, and final PR checks. Both EAS exports, project fingerprints,
  uploads, publications, and read-only metadata confirmations completed
  successfully. Download/application and the live Google/Apple authentication
  handshakes on a physical iPhone remain the runtime verification gates.
- OTA device state: Expo serves RoadTrip group
  `58425c2b-993a-42fc-83b5-c244f5cdf7c9` only to matching preview requests.
  No preview iOS client exists, so it has not been applied. Production was not
  updated by this RoadTrip task and retains group
  `afd8632f-46a4-4f88-aa22-170dc4178d04`; rollback
  identifiers are the previous preview group
  `c1bfeede-8577-420a-977b-3ac56f35cdde` and previous production group
  `9602e8f0-0c25-4a5e-9872-b82aaa68a1f4`.
- Known live-audit exception: two pre-existing recommendation documents
  (`rec_9gXo3omDD7yJ9aIKQ_Yj` and `rec_GiMpMfW5sxBdz0RZ5u7o`) have invalid
  `budget` taxonomy values. No unrelated production data was changed during the
  route-builder release. Existing recommendations without a valid price were
  not guessed or migrated; the client continues to show `מחיר לא צוין`, and
  editing and republishing requires a valid selection.
- EAS submission ID: not yet recorded.
- App Store Connect app: `6801453067`; version `1.1.0` has been submitted for
  external TestFlight distribution and is waiting for Apple's Beta App Review
  as reported on 2026-08-22.

The current release target is an **external TestFlight beta with open PlanLi
registration**, not an App Store listing. PlanLi does not maintain a Firebase
tester allowlist: anyone who receives the TestFlight invitation or public link
may create an account. External distribution still requires Apple's Beta App
Review and App Store Connect configuration. Testers install Apple's TestFlight
app and then install PlanLi from the invitation or public link; no provisioning
profile is installed manually.

The beta is iPhone-only because iPad has not been exercised. The production EAS
profile is pinned to the SDK 54 Xcode 26 image, uses store distribution, takes
values from the EAS `production` environment and auto-increments the remote iOS
build number. A production EAS build is suitable for both TestFlight and a later
App Store version, but uploading it to App Store Connect does not publish a
public listing.

### Release configuration

Before requesting an authorized production build, configure these EAS
production values without committing them:

- Existing public Firebase client values, the Google Web OAuth client ID and
  the bundle-restricted native Maps keys described above.
- `EXPO_PUBLIC_SENTRY_DSN` as a public client identifier.
- `SENTRY_ORG` and `SENTRY_PROJECT` for symbolication.
- `SENTRY_AUTH_TOKEN` as a sensitive EAS secret. Never place it in `app.json`,
  `.env.example`, a build log or App Store Connect notes.

Sentry is configured for beta crash/error diagnostics with a bounded 10%
performance sample, 50 allowlisted breadcrumbs, and an error-only mobile replay
buffer. Regular session replay, profiles, screenshots, view hierarchy, failed
request capture and default PII remain disabled. Error replays mask all text,
images and vector graphics and use low quality. The client attaches only the
Firebase UID as a pseudonymous user identifier, removes request/extra data,
allowlists diagnostic tags and device contexts, and redacts common email and
credential patterns before sending an event. The EAS production build fails
early if any Sentry value is missing, so a release cannot silently ship without
symbolicated diagnostics.

The updated privacy version is `2026-08-18-beta-observability`. Publish the matching
Hosting policy and deploy the matching Functions and Storage Rules immediately
before distributing the new client. This coordinated release is required
because old clients cannot accept the new server-owned privacy version.

Before enabling the production Sentry DSN, also enable Sentry's server-side
default data scrubbing, prevent IP-address storage, add sensitive-field rules,
disable public issue sharing, source fetching and join requests, and create
alerts for new fatal and regressed issues. Require organization-wide two-factor
authentication only after every current member has enrolled, because Sentry
removes unenrolled members when the requirement is enabled. Those account
settings cannot be enforced by the repository and must be verified from the
Sentry project before the build.

For App Store Connect privacy answers, the Sentry integration adds Crash Data,
Performance Data, Other Diagnostic Data and error-only Product Interaction for
App Functionality. Because events carry a Firebase UID, treat those categories
as linked to the user unless final event inspection establishes otherwise; they
are not used for tracking. Reconcile the rest of the existing PlanLi answers
against the final binary and deployed behavior, including name, email, user ID,
photos/text, travel preferences, saved/liked activity, reports, support messages,
and any location or place-search data transmitted off-device. Do not copy these
notes into App Store Connect without inspecting a real production-mode Sentry
event and replay from the signed beta build.

### Manual release gates

These full checks are for an explicitly authorized release candidate, not ordinary
development, commits, pushes, or merges. Run them on Node.js 22 from the clean release
commit; normal changes use `npm run validate:changed` from the repository root.

```powershell
cd C:\Users\doric\Documents\PlanLi\PlanLi\client
npm.cmd ci
npm.cmd run verify:ios-release
npm.cmd test -- --runInBand
npx.cmd expo export --platform ios --output-dir .expo-validation\ios-release

cd ..\functions
npm.cmd ci
npm.cmd test
npm.cmd run test:rules:emulator
npm.cmd run audit-live
```

`verify:ios-release` checks the bundle ID, Firebase plist, app icon,
permissions, native plugins, EAS profile, Sentry privacy controls and known
debug markers. `audit-live` and the Rules emulator are read-only validation;
they require the correct Firebase identity/project and do not authorize a
deployment. Complete one release review against `main` after these checks.

After local checks, manually exercise the signed build on a physical iPhone:

- Email/password, Google and Apple sign-in, email verification, onboarding,
  legal consent, sign-out and relaunch.
- Location denied/allowed, photo library denied/limited/allowed and camera
  denied/allowed.
- Create, edit and delete a recommendation and route; like, comment, favorite,
  report and block; verify held content is no longer public.
- Account deletion for password, Google and Apple accounts, including a failed
  recent-auth attempt and a successful retry.
- Offline, slow-network, provider-limit and server-error states without raw
  provider messages or permanent loading indicators.
- One deliberate non-PII test exception in a release candidate, followed by
  confirmation that its Sentry stack trace is symbolicated; remove the trigger
  before the final build.

Only after the gates pass and build authorization is given, create the EAS iOS
production build. Only after separate submission authorization, upload that
specific build to App Store Connect. First exercise it with the account owner,
then submit the build and beta metadata for Apple's external Beta App Review.
After approval, enable the external group and public link. Record the branch,
commit, EAS build ID, iOS build number, review status and processing result. Do
not use auto-submit for the first beta.

The installed `1.1.0` production build can receive compatible EAS Updates. It
uses the `production` channel and derives runtime `1.1.0` from the app version.
Until the beta is explicitly closed, the Expo marketing version is locked to
`1.1.0`; `verify:ios-release` rejects an accidental version change. This lock
does not apply to the iOS build string: every newly uploaded binary must still
use a unique, incremented build number, and the production EAS profile keeps
`autoIncrement: true`. Prefer compatible EAS Updates for JavaScript, styling,
and bundled assets so the installed `1.1.0` binary can receive beta changes
without another binary upload. Keeping the marketing version does not guarantee
that Apple will waive TestFlight review for a later build.
Test an update on the `preview` channel before publishing the same commit to
production. Publish only JavaScript, styling, and bundled-asset changes that are
compatible with the installed native runtime:

```powershell
cd C:\Users\doric\Documents\PlanLi\PlanLi\client
eas update --channel preview --environment production --message '<summary>'
eas update --channel production --environment production --message '<summary>'
```

An EAS Update is a release action and requires explicit authorization. Native
dependency, plugin, entitlement, permission, or incompatible app-config changes
require an incremented app version and a new store build. After publishing an
update, force-close and reopen the release app up to twice so it can download
and apply the compatible update. Record the source commit, update group ID,
channel, runtime version, environment, verification result, and rollback plan.

### Beta operations and cost controls

Provider-backed callables are limited to one instance each, four concurrent
requests per instance, 30 weighted units per user/minute and 120 per user/day.
The location budget is versioned so the beta increase immediately releases
users previously blocked by an older bucket while retaining per-user spend
protection. Public discovery
callables are also limited to one instance and ten concurrent requests each, in
addition to their per-user/network request budgets. Configure a US$10
Google Cloud billing budget and alerts, but remember that budget alerts do not
stop charges. During the beta, check Functions errors, Sentry crashes, reports
and the support inbox twice daily; acknowledge urgent safety reports within
24 hours.

There is no per-tester Firebase configuration. Signed-in callables are open to
all authenticated accounts; actions that publish or modify content still
require the existing identity-verification, current legal-consent, completed
profile/preferences and active moderation-status checks. Staging uploads apply
the same active-account gates plus ownership, filename, MIME type, metadata and
20 MB size validation.

Before release, resolve every issue reported by `audit-live` and the canonical
database dry-run. Do not apply a partial canonical migration while it still
reports unmapped destinations, categories, tags, or media. Then preview and
explicitly authorize the account moderation backfill and admin registry:

```powershell
npm.cmd run backfill-account-moderation
npm.cmd run backfill-account-moderation -- --apply
npm.cmd run bootstrap-admin -- owner@example.com
npm.cmd run bootstrap-admin -- owner@example.com --apply
```

`bootstrap-admin` is dry-run by default. Review the resolved UID before using
`--apply`; the account must refresh its ID token afterwards. Next run the media
availability backfill for every canonical media collection. Account moderation
must run first so existing user images are not incorrectly registered as held:

```powershell
npm.cmd run backfill-media-availability -- --collection recommendations
npm.cmd run backfill-media-availability -- --collection recommendations --apply
```

Repeat the media command for `routes`, `trips`, and `users`; it replaces legacy
one-year cache metadata, creates the required registry entries and revokes
tokens for already-held media.

Only after all supported documents use canonical EU media, quarantine every
legacy user-media prefix so old download tokens and public cache metadata are
revoked; repeat the command for `optimized`, `profilePicture`, `recommendations`,
`routes`, and `trips`:

Do not apply quarantine until `audit-live` and a dry-run of `migrate-database`
confirm that no supported document still references a legacy object. If either
check reports a reference, migrate that document first; quarantine would make
the legacy URL intentionally unreadable.

```powershell
npm.cmd run quarantine-legacy-media -- --prefix recommendations
npm.cmd run quarantine-legacy-media -- --prefix recommendations --apply
```

Storage Rules deny legacy and unregistered media, so the account, canonical
media, registry and quarantine migrations must finish successfully before the
updated rules are deployed. Rebuild public projections only after eligible
users have accepted the current legal versions:

```powershell
node scripts/backfillPublicProfiles.js
node scripts/backfillPublicProfiles.js --apply
```

Use every command's reported `nextAfter` value with `--after` whenever it returns
a full page; this applies to both the account-state and media-availability
backfills. Use `nextPageToken` with `--page-token` for legacy-media quarantine.
Continue until the relevant cursor is `null` for every collection and prefix.
These are live writes and require separate migration authorization; every
command without `--apply` is a read-only preview. Do not distribute the beta
client until all migration and projection checks pass.

Server-side image classification is intentionally excluded from this beta.
User-generated content is instead covered by upload constraints, report/block
flows, admin hold/removal controls, public-visibility status checks and a support
contact. Verify those moderation flows in the signed build and describe them in
the Beta App Review notes. Enable App Check only after valid iOS tokens are
observed; it must not be enabled speculatively for the first build.

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
countries/{countryId}/destinations/{destinationId}

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

The recommendation catalog v1 migration moves existing recommendations to the
short Noya classification flow. It is dry-run by default, accepts only direct
legacy-tag mappings, refuses every ambiguous classification before any write,
and writes an ignored rollback checkpoint. A provider result containing only
broad locality types is migrated to a general destination and its misleading
map point is removed. Apply is additionally guarded by the production project
identifier:

```powershell
cd C:\Users\doric\Documents\PlanLi\PlanLi\functions
npm.cmd run migrate-recommendation-catalog
# Only after Functions and the supported 1.1.0 client are released and every row is reviewed:
npm.cmd run migrate-recommendation-catalog -- --apply --confirm-project=planli-f0b12
npm.cmd run migrate-recommendation-catalog -- --rollback .recommendation-catalog-v1\<checkpoint>.json --confirm-project=planli-f0b12
npm.cmd run audit-live
```

The migration does not alter recommendation timestamps, ownership, media,
engagement counters, comments, likes, or status. Routes retain taxonomy v5
until their separate creation flow is redesigned.

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

## Manual full verification and troubleshooting

Ordinary development uses the focused validation policy in `AGENTS.md` and
`npm run validate:changed`. Use the commands below only for explicit release readiness
or when troubleshooting requires the complete subsystem.

Use `npm run validate:changed -- --plan-only` to inspect the selected checks without
running them; `node scripts/validationPlan.js --help` lists exact-diff and scope options.

Run the full Functions checks from `functions`:

```powershell
cd C:\Users\doric\Documents\PlanLi\PlanLi\functions
npm install
npm test
npm run test:rules:emulator
npm audit --omit=dev
```

Run the full client tests and exports from `client`:

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

## Admin moderation console

The same responsive moderation console runs inside the iOS Development Build
and as a Firebase Hosting web application at
`https://planli-f0b12.web.app/admin`. Access requires the Firebase `admin`
custom claim; the server checks the claim again for every operation. Sensitive
actions require a sign-in from the last ten minutes, a written reason, and are
recorded in the append-only moderation audit log. Current sensitive actions are:

- `moderateContent` (dismiss / hold / restore / delete report targets)
- `setUserSuspension` (suspend / unsuspend a user)
- `setUserEmailVerified` (force email verification state)
- `setUserAdmin` (grant / remove admin access)
- `deleteUserAsAdmin` (full irreversible account deletion)
- `deactivateDestination` (deactivate a city and place linked content on moderation hold)
- `setDestinationHebrewName` (rename a destination and propagate the canonical
  Hebrew name through current content and projections)

All other admin callables are defined as non-sensitive (no recent sign-in check)
when they only read or apply non-destructive moderation workflows.
The web console signs out after 30 minutes without activity.

Build the generated, ignored Hosting bundle before a Hosting deployment:

```powershell
cd C:\Users\doric\Documents\PlanLi\PlanLi\client
npm.cmd run export:admin-web
```

Bootstrap the first administrator from an authenticated Firebase CLI session.
The script synchronizes both the Auth claim and the private admin registry:

```powershell
cd C:\Users\doric\Documents\PlanLi\PlanLi\functions
npm.cmd run bootstrap-admin -- '<uid-or-email>'
```

Never commit administrator credentials or App Review demo credentials.

## App Store Connect moderation checklist

These settings are configured manually in App Store Connect and are not
changed by Firebase deployment:

- Link the public privacy policy, terms, community guidelines, and support
  pages in the listing and review notes.
- Complete the privacy questionnaire for account/profile data, user content,
  location, identifiers, product interaction, diagnostics, and moderation data
  according to the behavior of the submitted build.
- Confirm the age-rating answers for user-generated content and unrestricted
  web access based on the current app experience.
- Give App Review a dedicated demo account that can reach reporting, blocking,
  and in-app account deletion. Store its credentials only in App Store Connect.
- Explain in review notes that reports are prioritized, three unique reports in
  24 hours automatically hold posts, users can block other users, and account
  deletion removes the account, content, interactions, and media.
- Verify the support inbox `planli.travel.il@gmail.com` is monitored before
  submission, especially for urgent child-safety and violence reports.

## Destination quality control

The admin console includes a destination-quality queue. New cities are added
automatically and a daily scheduled audit continues scanning the existing
catalog. Approval is blocked when bilingual identity, Google Place identity,
country, or coordinates are missing or contradictory. The queue also surfaces
stale cache data, missing or weak images, missing attribution, missing airports,
and failed provider jobs.

Administrators can request verified Unsplash/Wikimedia suggestions, upload a
manually reviewed JPEG through the normal EXIF-stripping media pipeline, select
only nearby scheduled airports returned by OurAirports, recheck a destination,
set its canonical Hebrew name with an audited resumable propagation job,
approve it with a recorded reason, or deactivate it. Renaming never approves a
destination. Deactivation removes the public catalog entry and places linked
recommendations, trips, and routes on moderation hold; it never silently
republishes them later.

The Storage deployment applies the normal rules to the EU bucket and the
read-only rollback rules to the US bucket. `storage.cors.json` restricts web
origins, and `storage.lifecycle.json` removes abandoned staging objects.

The server secrets are configured from the repository root:

```powershell
firebase functions:secrets:set GOOGLE_MAPS_KEY --project planli-f0b12
firebase functions:secrets:set GOOGLE_PLACES_NEW_KEY --project planli-f0b12
firebase functions:secrets:set REST_COUNTRIES_KEY --project planli-f0b12
firebase functions:secrets:set OPENWEATHER_API_KEY --project planli-f0b12
firebase functions:secrets:set UNSPLASH_ACCESS_KEY --project planli-f0b12
```

`GOOGLE_PLACES_NEW_KEY` is the server-only key for Places API (New), selected by
the `PLACES_PROVIDER=new` Functions parameter. `GOOGLE_MAPS_KEY` remains the
server-only Geocoding/legacy rollback key. Restrict each key to its required
Google API set; never expose either key to clients.
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

App Check enforcement remains intentionally disabled during the first private
Development Build and preview validation. Before a public release, configure
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
