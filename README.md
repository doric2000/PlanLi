# PlanLi

PlanLi is a photo-first travel application built with Expo and Firebase.

## Current environment status

PlanLi has an external TestFlight beta; it has not been publicly released to the
App Store, Google Play, or a public web domain. Native development is performed
with an installed, signed EAS Development Build connected to Metro. Expo Go is
not supported. A signed Android production App Bundle `1.1.0 (5)` completed at
`2026-08-24T23:49:14.951Z` from commit `5c06d10`; it was uploaded to Google Play
internal testing and installed on the owner's Android tablet. The first physical
Android map smoke test on `2026-08-25` found that exact-location place resolution
succeeded but its preview stayed loading, while the Community map mounted with a
Google watermark but no map tiles. Google Maps Android key authorization for the
Play App Signing certificate was corrected at `2026-08-25T14:01:48+03:00`; the
Android-only production EAS Update
`dd0b91d8-b5b7-4a73-94d4-d08d31a449f5` was published from PR `#206` merge
commit `e954e3e` at `2026-08-25T11:19:04.856Z`. Download, application, and the
physical tablet re-test remain pending.
The latest compatible production EAS Update is Noya component-geometry group
`1a691933-e4b6-4003-9d3d-111315a88549`, published for Android
(`01a03e64-1c50-7500-bfe5-9e4fc2aea1e4`) and iOS
(`01a03e64-1c50-7709-96ac-f922c1842eae`) at
`2026-08-26T14:05:43.376Z` from PR `#221` merge commit `408c8e94`. EAS
read-back confirms that both production manifests use runtime `1.1.0`, the
exact merge commit, the production environment, and a clean working tree.
Download, application, and exact tour geometry on the physical Android tablet
and TestFlight iPhone remain unverified.
TestFlight build `1.1.0 (13)` remains installed and
in use on the owner's physical iPhone. Production iOS build `1.1.0 (14)` completed from
commit `f9c7096` at `2026-08-24T20:07:02.152Z`. EAS submission
`3c2adff2-a0f7-420d-b1cf-dd5f8725d8cf` then finished successfully and uploaded
the build to App Store Connect, as verified at `2026-08-24T20:21:18Z`. Apple
processing, TestFlight availability, installation, and physical-iPhone
behavior for build 14 remain unverified. An internal iOS EAS Development Build
`1.1.0 (13)` completed at
`2026-08-24T17:53:02.788Z` from recommendation/RoadTrip composer PR `#193`
merge commit `8afdfb3`. Its EAS build ID is
`ff0fc01a-890b-4668-b9a1-5d60891e9545`, runtime is `1.1.0`, and the
development profile has no update channel. Download, installation, and physical
iPhone behavior remain unverified; no EAS Update, App Store submission, or
backend deployment was performed for this build. The production profile uses
the `production` EAS Update channel and runtime `1.1.0`. The matching Noya
component-geometry preview group is `31df8f49-77fb-4151-85fb-245e594a81d7`;
the immediately preceding compatible groups are preview
`48a9c9ef-4c32-4030-adb0-0ad7bcecb111` and production
`43a873d8-282c-4e6a-986d-fcd014047c2c`. This OTA did not create a native build,
submit to either store, deploy Firebase, or write production data. Twenty-eight
affected Functions and the
active media-bucket Storage Rules were deployed from `0ed8e88` at approximately
`2026-08-24T01:34Z`. The Functions inventory still reports 96 active Node.js 22
v2 Functions in `europe-west1`, and the post-deploy error query returned no
matching entries. Firestore Rules, indexes, Hosting, production documents,
migrations, and the rollback Storage bucket were unchanged.

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
`https://planli-f0b12.web.app/privacy`. The Google Play account-deletion
resource is configured at `https://planli-f0b12.web.app/account-deletion`.
The legal, deletion and support pages must be reachable on Firebase Hosting,
and their deployed versions must be compared with the release commit before
every beta or store submission. They require legal review plus final contact
details before a public release.

The deletion resource offers the existing in-app flow and an external request
through `planli.travel.il@gmail.com`. For an external request, reply only to the
email address registered on the account and require explicit confirmation from
that address. Never request a password, identity document or authentication
code. After verification, use the protected `deleteUserAsAdmin` action with a
recorded reason; do not create a direct public deletion endpoint or client-write
path.

Account-deletion Hosting release record:

- Source: commit `be649bfb84d06b4de1eec5fd1ee419e2e25e5734` on
  `docs/google-play-account-deletion`.
- Firebase project/site: `planli-f0b12` / `planli-f0b12`.
- Preview: channel `account-deletion-20260825`, version
  `2fe856a38d6a03e6`, released at `2026-08-24T22:43:04.812Z` and expiring at
  `2026-08-25T22:42:52.177351646Z`; URL
  `https://planli-f0b12--account-deletion-20260825-7zp3mzlh.web.app`.
- Live: version `1dcffdd8324af2cb`, released at
  `2026-08-24T22:46:57.053Z`; public URL
  `https://planli-f0b12.web.app/account-deletion`.
- Live verification completed at `2026-08-24T22:47:16.9579432Z`. The deletion
  page returned `200` after its canonical trailing-slash redirect, served UTF-8
  Hebrew RTL content, exposed the expected fixed email pathway, contained no
  scripts, forms, frames or third-party resources, and returned the committed
  route-specific CSP, cache, frame, MIME, referrer, resource and permissions
  headers. `/privacy`, `/support` and `/admin` each returned `200`.
- The release command targeted Hosting only. Functions, Firestore Rules and
  indexes, Storage Rules and buckets, IAM, migrations, Android builds, Play
  submissions and production data were unchanged. Google Play review approval
  remains unverified until Google processes the Data Safety submission.

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

## Google Play internal beta release

Current Android release record:

- App version/build: `1.1.0 (5)`, package `com.planli.planlitravels`, runtime
  `1.1.0`.
- EAS build: `958e7d06-8173-4f82-aecf-d9e8f6603d1a`, completed at
  `2026-08-24T23:49:14.951Z` from commit
  `5c06d1081422923fb70ab7413d44bac40f43f8bc` with the `production` profile,
  store distribution, and production update channel. The signed `.aab` is
  available from EAS at
  `https://expo.dev/artifacts/eas/JEjn3jZ6WiVKJoM-6kOdntzztoaedVDJ6wBn6Ky3RgQ.aab`.
- Local artifact: `C:\Users\doric\Downloads\PlanLi-1.1.0-5-google-play.aab`,
  89,016,605 bytes, SHA-256
  `69B09B498AF749B5CA2A7C59EE224D5B1667643C6832F32466F2CA2034966BA0`.
  ZIP inventory verification found the base Android manifest and JavaScript
  bundle.
- Validation: `npm ci`, Expo Doctor (18/18), and an Android Expo export passed.
  The remote Gradle `bundleRelease` build completed, signing validation passed,
  and EAS copied 50 application assets. The locked client dependency audit still
  reports eight high-severity findings; dependencies were not upgraded during
  this release.
- Build recovery: production build
  `bc583e95-85d7-4e8b-a76e-91940c5f2d86` (`1.1.0 (3)`) failed before Gradle
  because EAS CLI 18 preserved Windows read-only directory modes in the upload
  archive. EAS CLI was updated locally to `22.3.0`, whose portable archive
  handling resolved extraction. Version code `4` was reserved while diagnosing
  the archive and no corresponding EAS build was queued.
- EAS archived 111 MB from a workspace that also held unrelated pre-existing
  untracked campaign and rendering-script files; exact archive inclusion was not
  independently audited. The generated application bundle contained the
  expected runtime asset set rather than the campaign source directory.
- Google Play state: the App Bundle was uploaded to internal testing and installed
  on the owner's Android tablet; the upload timestamp and reviewer-processing
  details have not been independently verified. On `2026-08-25`, exact-location
  place resolution returned the selected place but its embedded preview remained
  in a loading state. The Community map mounted and showed the Google watermark
  plus the empty-area message, but no basemap tiles. PR `#206` added bounded
  native map loading, retry states, and Community basemap/result separation.
  Google Cloud project `planli-f0b12` was verified to have a paid billing account
  and Maps SDK for Android enabled. At `2026-08-25T14:01:48+03:00`, the existing
  `PlanLi Android Maps SDK` key remained restricted to Maps SDK for Android and
  gained the Google Play App Signing SHA-1 for `com.planli.planlitravels`, while
  retaining the EAS/upload signer restriction. Google Cloud confirmed the key was
  restricted; propagation can take up to five minutes. No compatible Android
  preview build was available, so preview-channel device validation was not
  performed before the authorized internal-test production-channel update. The
  post-fix tablet smoke test remains pending.
- Android map-loading source validation on `2026-08-25`: seven focused client
  suites passed 57 tests. Changed-scope validation passed its 17 selected tests,
  admin Web export/verification, iOS release-config check, and iOS export. Expo
  prebuild config confirmed that the Android package receives its native Maps
  key, and a separate Android Expo export completed successfully. The Google
  Cloud credential correction above does not require a replacement AAB. No new
  EAS build or Play upload was performed.
- Android map-loading EAS Update: group
  `dd0b91d8-b5b7-4a73-94d4-d08d31a449f5`, Android update
  `01a038a5-2f98-7305-bd82-6afe8dd12f9a`, production channel/branch, runtime
  `1.1.0`, published at `2026-08-25T11:19:04.856Z` with message
  `Fix Android location map loading (#206)`. The source is PR `#206` merge commit
  `e954e3e11e511ddadbfc5bc0d15a3d1f7b948c26`. EAS uploaded one Android app
  bundle, found 51 Android assets, and uploaded no new assets. The publishing
  checkout preserved unrelated pre-existing untracked campaign/rendering files;
  the update manifest reports the exact merge commit. This Android-only update
  did not alter iOS, create an AAB, submit to Google Play, deploy Firebase, or
  write production data. Download, application, exact-location confirmation,
  Community tiles/empty state, manual-pin, and route-map behavior on the physical
  tablet remain unverified. Roll back by republishing the preceding compatible
  Android production group `b0112239-3ce4-46a8-8019-674338a8e409`.

## Open-registration TestFlight beta release

Current release record:

- App version/build: `1.1.0 (14)`.
- iOS Development Build: internal-distribution build
  `ff0fc01a-890b-4668-b9a1-5d60891e9545`, runtime `1.1.0`, completed at
  `2026-08-24T17:53:02.788Z` from PR `#193` merge commit `8afdfb3`. The
  development profile has no update channel or Apple review/submission state;
  the artifact expires on `2026-09-07T17:47:09.652Z`. Download, installation,
  and physical-iPhone verification remain pending.
- Installed state: build `1.1.0 (13)` is running on the owner's physical iPhone
  through TestFlight. Build `1.1.0 (14)` has not yet been installed or exercised
  on a physical iPhone.
- EAS build: `34474cb7-e5c0-45b0-8733-bf848e8ee3da`, completed at
  `2026-08-24T20:07:02.152Z` from commit
  `f9c7096efbf495244a12d63760e5b39fb2b03f67` with the `production` profile,
  store distribution, production channel, app/runtime version `1.1.0`, and iOS
  build number `14`. EAS archived 111 MB from a workspace that also held
  unrelated pre-existing untracked campaign and rendering-script files; the
  exact inclusion of those files in the archive was not independently audited.
- Source release: Noya product-tour PR `#196`, typography release fix PR `#197`,
  and live-audit alignment PR `#198`; the build source is PR `#198` merge commit
  `f9c7096`.
- Preview EAS Update: Home planning hub group
  `48a9c9ef-4c32-4030-adb0-0ad7bcecb111`, runtime `1.1.0`, iOS update
  `01a03b4e-b151-7955-887a-b24f9ded8f1d`, and Android update
  `01a03b4e-b151-7faa-bde7-d23de24d37a1`, published from PR `#215` merge
  commit `e1ba08d9255c90c1c22ed93b5d9da90c5d392d74` at
  `2026-08-25T23:43:28.081Z` with the `production` EAS environment. EAS
  read-back confirmed both manifests, the `preview` branch, runtime, and exact
  commit. There is no signed iOS preview-profile build, so download and
  physical-device behavior remain unverified.
- Production EAS Update: exact republish of that preview bundle as group
  `43a873d8-282c-4e6a-986d-fcd014047c2c`, runtime `1.1.0`, iOS update
  `01a03b51-cc08-727f-88f1-93b17c27e092`, and Android update
  `01a03b51-cc08-7328-8f2d-71f26f5953b2`, published at
  `2026-08-25T23:46:51.528Z`. EAS read-back confirmed both manifests and the
  production branch point to this group and exact commit, with a clean Git
  working tree. Roll back by republishing the preceding production group
  `1184a492-317b-4a5a-be48-12374b98bc8a`. Download and application on the
  physical TestFlight iPhone and Android tablet remain unverified.
- Firebase release: 99 active Node.js 22 v2 Functions in `europe-west1`.
  Twelve affected Functions deployed from clean `main` commit `4766903` at
  approximately `2026-08-25T20:49Z`: `prepareMedia`,
  `publishRecommendationDraft`, `saveRouteDraft`, `publishRouteDraft`,
  `updateProfile`, `getPersonalizedRecommendations`, `getPersonalizedRoutes`,
  `recordDiscoverySignal`, `setPersonalizationFeedback`,
  `mergeGuestPersonalization`, `setPersonalizationBehavior`, and
  `resetPersonalizationActivity`. The last three were created; the other nine
  were updated. CLI inventory independently confirmed all twelve as active v2
  Node.js 22 Functions in `europe-west1`, and the post-deploy logs contained
  rollout health starts with no Function error entries. Firestore Rules,
  Storage Rules, indexes, Hosting, production documents, migrations, IAM, and
  the other 87 Functions were unchanged.
- RoadTrip validation: 16 focused client suites passed 108 tests and seven
  focused Node.js 22 route/location Function suites passed 50 tests.
  Changed-scope validation and PR `#181` plan, affected-client,
  affected-Functions, and final checks passed. The iOS release configuration
  check and iOS export also passed. The physical-iPhone create/resume,
  switch, direct stop edit/add/insert/remove/reorder, autosave retry, and
  order-only publish matrix remains unverified because no compatible signed
  preview client exists.
- Recommendation-draft validation: four focused client suites passed 44 tests;
  PR `#183` plan, affected-client, and final checks passed. EAS exported and
  published iOS, Android, and Web bundles successfully. Download, application,
  and create/resume/discard/media-transfer behavior on the physical TestFlight
  iPhone remain unverified.
- Recommendation destination-search validation: three focused client suites
  passed 26 tests, and PR `#187` plan, affected-client, and final checks passed.
  EAS exported and published iOS, Android, and Web bundles successfully. Live
  Google provider fallback and selection on the physical TestFlight iPhone
  remain unverified.
- Validation: four focused auth/navigation suites passed all 33 tests, the iOS
  release configuration check and export passed, and PR `#169` passed its plan,
  affected-client, and final PR checks. Both EAS exports, project fingerprints,
  uploads, publications, and read-only metadata confirmations completed
  successfully. Download/application and the live Google/Apple authentication
  handshakes on a physical iPhone remain the runtime verification gates.
- Release-candidate validation: all 153 client suites passed 773 tests, all 545
  runnable Functions tests passed with 22 skipped, all 22 Rules emulator tests
  passed, the iOS release configuration and export passed, and the final release
  review found no actionable findings. The locked client dependency audit still
  reports eight high-severity findings; dependencies were not upgraded during
  this release. Physical-device behavior remains unverified.
- OTA device state: Expo serves Home planning hub preview group
  `48a9c9ef-4c32-4030-adb0-0ad7bcecb111` only to matching preview requests;
  no preview iOS client exists, so it has not been applied. Production now
  serves group `43a873d8-282c-4e6a-986d-fcd014047c2c` for Android and iOS.
  Download, application, Home continuation/search/actions/discovery behavior,
  multi-photo gestures, recommendation creation, RoadTrip editing, Noya
  guidance, and For You v2 behavior remain unverified on the physical
  TestFlight iPhone and Android tablet. The immediate rollback groups are
  preview `cde53874-e3f5-4a1b-b8ef-f7a52fa5a025` and production
  `1184a492-317b-4a5a-be48-12374b98bc8a`.
- Production catalog migration: the separately authorized apply run at
  `2026-08-24T19:49Z` scanned 14 recommendations and migrated exactly one
  document (`recommendations/rec_CBCFGWNEcxN3Ov6ijXeI`) to category `nature`
  and subcategory `viewpoint`; 13 were already migrated, with zero blocked
  records and zero conflicts. The post-migration live audit completed at
  `2026-08-24T19:50:08.573Z` with 477 documents checked and zero failures. No
  Firebase deployment accompanied this migration.
- EAS submission ID: `3c2adff2-a0f7-420d-b1cf-dd5f8725d8cf`, created for build
  `34474cb7-e5c0-45b0-8733-bf848e8ee3da`. EAS reported `FINISHED` with no
  submission error at `2026-08-24T20:21:18Z`, confirming upload to App Store
  Connect. Apple processing remains unverified.
- App Store Connect app: `6801453067`; build `1.1.0 (14)` was uploaded for
  TestFlight. External TestFlight availability and any required Beta App Review
  remain subject to App Store Connect and are not yet verified.

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
production. Production releases must run from a clean `main` checkout that
exactly matches `origin/main` and contains the Git commit recorded by the latest
production update group. The preflight queries EAS and blocks the release if a
newer update came from work that is not in the candidate. This prevents a later
feature branch from silently replacing previously deployed JavaScript. Publish
only JavaScript, styling, and bundled-asset changes that are compatible with the
installed native runtime:

```powershell
cd C:\Users\doric\Documents\PlanLi\PlanLi
npm run preflight:eas-production

cd .\client
eas update --channel preview --environment production --message '<summary>'

# Read back the preview group, then promote those exact bundles.
cd ..
npm run preflight:eas-production
cd .\client
eas update:republish --group '<preview-group-id>' --destination-channel production --message '<summary>'
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

## Store submission moderation checklist

These settings are configured manually in App Store Connect or Google Play
Console and are not changed by Firebase deployment:

- Link the public privacy policy, terms, community guidelines, and support
  pages in the listing and review notes.
- Link `https://planli-f0b12.web.app/account-deletion` in Google Play's account
  deletion field and verify that its email request pathway works without the
  app being installed.
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

## iOS gallery recovery OTA release

- Source: PR `#202`, merge commit
  `32f32a75dc42f30563e5d5fea92b71183450fdff` on `main`.
- App/runtime: `1.1.0`; production EAS channel and branch; iOS only.
- EAS Update group: `1b08576e-26c9-4ffb-8566-e7dd845130e6`; iOS update
  `01a03820-4f06-7d69-88ad-aaa771fe6499`, published at
  `2026-08-25T08:53:56.614Z` with message
  `Fix iOS gallery loading and permission recovery (#202)`.
- The update replaced production group
  `b0112239-3ce4-46a8-8019-674338a8e409` for compatible iOS runtime `1.1.0`
  clients. The export uploaded one app bundle, found 52 iOS assets, and uploaded
  no new assets.
- The publishing checkout also contained unrelated uncommitted README and
  campaign-rendering files; they were preserved, and the published manifest
  reports the exact merge commit above. No native build, App Store submission,
  Firebase deployment, backend change, migration, Android update, or production
  data write was performed.
- Download, application, gallery permission recovery, PhotoKit thumbnail loading,
  and crop behavior on the physical iPhone remain unverified.

## Mobile photo picker stability OTA release

- Source: PR `#204`, merge commit
  `0fbba80ddb5e324a1cc5f39e01cda050f7ce3c57` on `main`.
- App/runtime: `1.1.0`; production EAS channel and branch; iOS only.
- EAS Update group: `d98875c3-ccf5-4ea7-b91f-734a802e4602`; iOS update
  `01a0384f-3b3b-7ccb-a51a-0b3828ceecf3`, published at
  `2026-08-25T09:45:11.739Z` with message
  `Stabilize mobile photo selection (#204)`.
- The update replaced production group
  `1b08576e-26c9-4ffb-8566-e7dd845130e6` for compatible iOS runtime `1.1.0`
  clients. The export uploaded one app bundle, found 52 iOS assets, and uploaded
  no new assets.
- Validation passed 53 focused client tests, iOS and Android Expo exports, the
  generated Android media-permission removal check, and all PR `#204` checks.
  Android was validated but did not receive this update.
- The publishing checkout preserved unrelated uncommitted README and campaign
  files, and the published manifest reports the exact merge commit above. No
  native build, App Store submission, Firebase deployment, backend change,
  migration, Android update, or production data write was performed.
- Download, application, system-picker presentation, photo loading, crop review,
  and watchdog-memory behavior on the physical TestFlight iPhone remain
  unverified.

## Noya first-tour repair OTA release

- Source: PR `#208`, merge commit
  `313ebe320592a539b3c6a9771e17db85b09aabd1` on `main`.
- Scope: the JavaScript-only Noya first tour now waits for visible tab navigation,
  scene loading, and stable measurements; spotlights exact tabs and controls; and
  covers search, filters, sorting, maps, recommendation/route creation, and
  favorites in 11 Hebrew/RTL steps. Main-tour storage migrated to V2 while
  preserving independent creator-guide progress.
- App/runtime: `1.1.0`; `production` EAS environment; Android and iOS; no native
  dependency, permission, entitlement, plugin, or app-config change.
- Preview EAS Update: group `b63e0183-d8e8-41a0-9e16-d083b8bb2379`, Android
  update `01a039c6-3ae2-7641-a854-c6873bfb4ac7`, iOS update
  `01a039c6-3ae2-735c-8f4c-31b6d94efed3`, published at
  `2026-08-25T16:34:47.650Z`. EAS read-back confirmed branch `preview`, runtime
  `1.1.0`, and the exact source commit for both manifests.
- Production EAS Update: group `b21002fa-5510-42bb-8c22-75ac24499260`, Android
  update `01a039d6-3555-74e6-a679-2de282732daf`, iOS update
  `01a039d6-3555-7cbe-922d-659d340fb457`, published at
  `2026-08-25T16:52:14.805Z`. EAS read-back confirmed branch `production`,
  runtime `1.1.0`, the exact source commit for both manifests, and this group as
  the newest production update for both platforms.
- Validation: 11 focused Noa/Home/Community/Routes/storage/control suites passed
  66 tests. `npm run validate:changed` passed its related client tests, admin Web
  export/verification, iOS release-config check, and iOS export. PR `#208` plan,
  affected-client, and final validation checks passed. A guest Web smoke test
  exercised all 11 steps before the final review fixes; regression tests cover
  the reviewed map-mode, personalization-loading, and migration-write cases.
- Both publishes exported matching Web, iOS, and Android bundle filenames, found
  52 iOS and 51 Android assets, uploaded both native app bundles, and uploaded no
  new assets. EAS marked the workspace dirty because unrelated pre-existing
  untracked campaign/rendering files were preserved; both manifests report the
  exact merge commit above.
- No EAS build, App Store/TestFlight or Google Play submission, Firebase deploy,
  migration, backend change, or production data write was performed. Download,
  application, exact spotlight geometry, slow/failed-loading behavior, and the
  complete guest/signed-in tour remain unverified on physical Android and iOS
  devices.
- Roll back preview by republishing group
  `e2490214-0532-4777-b1a2-eca3519eac85`; roll back production by republishing
  group `151b7748-1189-406e-8b7c-a10336fe4a9b`.

## Photo editor restoration and For You v2 OTA release

- Source: photo-editor integration PR `#211`, CityCard release-test isolation PR
  `#212`, and Windows preflight repair PR `#213`; released from clean `main`
  commit `4766903a1a40481a6b3019159d14934e9c41d551`. The release also contains
  previously merged For You v2 PR `#210` and Noya first-tour PR `#208`.
- Scope: restores independently editable multi-photo recommendation and RoadTrip
  media, the photo-first four-stage recommendation flow and matching Noya guide,
  the RoadTrip media limits, and the For You v2 client/backend behavior. The
  authenticated media-processing minute allowance is 40; existing file-size,
  pixel, ownership, staging, concurrency, bandwidth, and security controls remain.
- Preview EAS Update: group `cde53874-e3f5-4a1b-b8ef-f7a52fa5a025`, Android
  update `01a03ac7-6651-71cc-ba0e-7c5f6e52da60`, and iOS update
  `01a03ac7-6651-70bf-8579-627e3e7f3364`, published at
  `2026-08-25T21:15:41.521Z` on branch `preview`, runtime `1.1.0`.
- Production EAS Update: exact republish group
  `1184a492-317b-4a5a-be48-12374b98bc8a`, Android update
  `01a03acb-43cc-7631-8bac-e7f9009a6c27`, and iOS update
  `01a03acb-43cc-74d6-b5ad-c0056c688c3c`, published at
  `2026-08-25T21:19:54.828Z` on branch `production`, runtime `1.1.0`. EAS
  read-back confirmed the production branch's newest group contains both
  platforms and exact commit `4766903` with a clean working tree.
- Firebase deployment: the twelve affected Functions listed in the current
  release record were deployed to `planli-f0b12` in `europe-west1`; inventory
  reports 99 active v2 Node.js 22 Functions. No Rules, Hosting, migration,
  production-document, IAM, native-build, or store-submission change accompanied
  this release.
- Validation: release-readiness run `32897877416` passed production lineage,
  locked installs, all client and Functions tests, iOS release configuration and
  export, Firestore/Storage Rules emulator tests, and release dependency audits.
  The live EAS preflight passed immediately before production promotion, and EAS
  uploaded two app bundles with no new assets.
- Prevention: `scripts/easProductionPreflight.js` enforces clean `main`, exact
  `origin/main`, and ancestry of the currently deployed production commit;
  `scripts/easProductionPreflight.test.js` covers the policy and Windows launcher.
  Root `package.json` exposes `preflight:eas-production`, PR tooling tests it in
  `.github/workflows/pr-validation.yml`, and
  `.github/workflows/release-readiness.yml` blocks client/Functions release gates
  until the operator-provided live production commit passes lineage validation.
- Physical download, application, gestures, photo add/delete/crop restoration,
  recommendation/RoadTrip creation and editing, Noya guide behavior, and For You
  v2 remain unverified on the TestFlight iPhone and Android tablet. Force-close
  and reopen the production app up to twice to download and apply the update.
  Roll back preview to `b63e0183-d8e8-41a0-9e16-d083b8bb2379` or production to
  `b21002fa-5510-42bb-8c22-75ac24499260` if required.

## Home planning hub OTA release

- Source: PR `#215`, merge commit
  `e1ba08d9255c90c1c22ed93b5d9da90c5d392d74` on clean `main`.
- Scope: replaces unsupported popularity-metric Home content with a Hebrew/RTL
  planning hub containing trip continuation, destination search and saved-only
  filtering, quick planning actions, Noya onboarding, personalized-or-newest
  routes, and community recommendations. Refresh failures preserve previously
  loaded drafts and discovery cards and do not show false success feedback.
- App/runtime: JavaScript-only `1.1.0`; `production` EAS environment; Android and
  iOS; no native dependency, permission, entitlement, plugin, or app-config
  change.
- Preview EAS Update: group `48a9c9ef-4c32-4030-adb0-0ad7bcecb111`, Android
  update `01a03b4e-b151-7faa-bde7-d23de24d37a1`, and iOS update
  `01a03b4e-b151-7955-887a-b24f9ded8f1d`, published at
  `2026-08-25T23:43:28.081Z` on branch `preview`, runtime `1.1.0`.
- Production EAS Update: exact republish group
  `43a873d8-282c-4e6a-986d-fcd014047c2c`, Android update
  `01a03b51-cc08-7328-8f2d-71f26f5953b2`, and iOS update
  `01a03b51-cc08-727f-88f1-93b17c27e092`, published at
  `2026-08-25T23:46:51.528Z` on branch `production`, runtime `1.1.0`. EAS
  read-back confirmed this as the newest production group, both platforms, the
  exact merge commit, the production environment, and a clean working tree.
- Validation: 4 focused Home/search/filter suites passed 42 tests; all 159
  client suites passed 823 tests; Web rendering was checked at mobile and
  desktop viewport sizes; PR `#215` validation passed; release-readiness run
  `32910178977` passed production lineage, locked installs, client and Functions
  tests, iOS release configuration/export, Firestore and Storage Rules emulator
  tests, and dependency audits. The EAS production preflight passed immediately
  before preview publication and again before production promotion.
- The preview publish exported Web, iOS, and Android bundles, uploaded two app
  bundles, found 52 iOS and 51 Android assets, and uploaded no new assets. The
  production release republished those exact preview artifacts.
- No EAS native build, App Store/TestFlight or Google Play submission, Firebase
  deployment, migration, backend change, IAM change, or production-data write
  was performed. Download, application, visual layout, navigation, refresh
  recovery, and personalized/generic content on physical Android and iOS devices
  remain unverified. Force-close and reopen the production app up to twice to
  download and apply the update. Roll back preview to
  `cde53874-e3f5-4a1b-b8ef-f7a52fa5a025` or production to
  `1184a492-317b-4a5a-be48-12374b98bc8a` if required.

## Noya component-geometry OTA release

- Source: PR `#221`, merge commit
  `408c8e94c97b6eaee83777170130972e4b5f6fda` on clean `main`.
- Scope: converts all Noya guide targets from viewport coordinates to the live
  overlay coordinate space, including nonzero overlay origins, Web scaling,
  safe-area clipping, modal sheets, rotation, and layout changes. The overlay
  waits for two stable complete component measurements before drawing; the main
  tour storage migrated to V3 so everyone receives the repaired tour once while
  recommendation and route creator-guide progress remains intact.
- App/runtime: JavaScript-only `1.1.0`; `production` EAS environment; Android and
  iOS; no native dependency, permission, entitlement, plugin, or app-config
  change.
- Preview EAS Update: group `31df8f49-77fb-4151-85fb-245e594a81d7`, Android
  update `01a03e60-ab2c-71c0-8f71-4d214e86962b`, and iOS update
  `01a03e60-ab2c-7f94-b4d1-9c43b538b785`, published at
  `2026-08-26T14:01:57.804Z` on branch `preview`, runtime `1.1.0`.
- Production EAS Update: exact republish group
  `1a691933-e4b6-4003-9d3d-111315a88549`, Android update
  `01a03e64-1c50-7500-bfe5-9e4fc2aea1e4`, and iOS update
  `01a03e64-1c50-7709-96ac-f922c1842eae`, published at
  `2026-08-26T14:05:43.376Z` on branch `production`, runtime `1.1.0`. EAS
  read-back confirmed this as the newest production group, both platforms, and
  the exact source commit.
- Validation: 10 focused Noya/Home/Community/Routes/Favorites/control suites
  passed 67 tests; `npm run validate:changed` passed; PR `#221` plan, affected
  client, and final validation checks passed; and the requested final review
  reported no findings. Web smoke testing exercised all 11 tour steps at
  390-by-844 and 1280-by-720 viewports; every spotlight matched its live target
  with the intended three-pixel padding, including simultaneous tab/control
  spotlights and automatic tab navigation.
- The preview publish exported Web, iOS, and Android bundles, uploaded two app
  bundles, found 52 iOS and 51 Android assets, and uploaded no new assets. The
  production release republished those exact preview artifacts. The production
  preflight passed before preview publication and again before promotion.
- No EAS native build, App Store/TestFlight or Google Play submission, Firebase
  deployment, migration, backend change, IAM change, or production-data write
  was performed. Download, application, exact spotlight geometry, slow/failed
  loading, and the complete guest/signed-in tour remain unverified on physical
  Android and iOS devices because no native device bridge was available. Force-
  close and reopen the production app up to twice to download and apply the
  update. Roll back preview to `48a9c9ef-4c32-4030-adb0-0ad7bcecb111` or
  production to `43a873d8-282c-4e6a-986d-fcd014047c2c` if required.
