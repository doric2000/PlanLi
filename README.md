# PlanLi

PlanLi is a photo-first travel application built with Expo and Firebase.

## Current environment status

PlanLi has an external TestFlight beta and an active Google Play internal-testing
track; it has not been publicly released to the App Store, Google Play, or a
public web domain. Native development is performed with an installed, signed EAS
Development Build connected to Metro. Expo Go is not supported.

The current Android internal release is `1.1.0 (6)`, EAS build
`6eb6a704-2546-4f4e-acaa-fff95ec38d7c`, built from clean `main` source commit
`5bf89e69d90cf6c35da414b3bdac84ea1a5181f5` and completed at
`2026-08-26T15:46:09.341Z`. Google Play reports release
`PlanLi 1.1.0 (6) – RTL Navigation` as available to internal testers, released at
`2026-08-26T18:58+03:00`. Download, installation, and physical Hebrew/Arabic RTL
verification on Android remain pending.

The current iOS production binary is `1.1.0 (15)`, EAS build
`d9e78de5-6f97-4371-b223-245862ec4fbb`, built from the same source commit and
completed at `2026-08-26T15:00:19.672Z`. EAS submission
`c25a5130-e7fd-464c-a41c-ff62288b65df` finished at
`2026-08-26T16:38:56.039Z` and uploaded the build to App Store Connect app
`6801453067`. App Store Connect reports build 15 as in beta testing for internal
and external TestFlight. Installation and physical Hebrew/Arabic RTL verification
remain unverified.
The latest compatible Android and iOS production EAS Update is region-selector
polish group `b363be1d-63b2-4ea9-86e2-67bf3923b01c`, Android update
`01a04728-4cd2-7278-bf57-8d555e2e1c2d` and iOS update
`01a04728-4cd2-7c6d-a464-3f0af1fe74b6`, published at
`2026-08-28T06:56:58.578Z` from clean `main` merge commit
`0c10dc73b4b7ad78b025acf321615f95d47b8277`. EAS read-back confirms runtime
`1.1.0`, the exact merge commit, both platforms and the production branch.
Download, application and end-to-end visual behavior on physical Android and
iOS devices remain unverified.
TestFlight build `1.1.0 (13)` remains installed and in use on the owner's physical
iPhone. Builds 14 and 15 have not been confirmed as installed or exercised. An
internal iOS EAS Development Build
`1.1.0 (13)` completed at
`2026-08-24T17:53:02.788Z` from recommendation/RoadTrip composer PR `#193`
merge commit `8afdfb3`. Its EAS build ID is
`ff0fc01a-890b-4668-b9a1-5d60891e9545`, runtime is `1.1.0`, and the
development profile has no update channel. Download, installation, and physical
iPhone behavior remain unverified; no EAS Update, App Store submission, or
backend deployment was performed for this build. The production profile uses
the `production` EAS Update channel and runtime `1.1.0`. The matching content-
publication preview group is `50e55983-342e-48d0-9e9f-ceba7c77754d`; the
immediately preceding compatible groups are preview
`2be4404d-9bb4-48aa-b296-44df198deb1b` and production
`a50b1502-5158-49e5-bb59-02933dac81f1`. PR `#231` merged the canonical-
destination rollout to `main` as `9d70edad`. Nine affected Functions and the
48-file admin Hosting bundle were then redeployed from that clean merge commit.
The private registry now contains 252 validated entries. Fourteen reviewed
legacy destinations are reassigned, 14 historical user personalization profiles
were repaired with an audited production migration, and the location-resolution
v3 release below added canonical Vlorë as the Hebrew city `ולורה`. The latest
production audit at `2026-08-28T13:45:08.873Z` checked 869 Firestore documents
and 124 active Node.js 22 v2 Functions in `europe-west1` and returned zero
failures. Firestore
Rules, indexes, Storage Rules, IAM, native builds, store submissions, and the
rollback Storage bucket were unchanged.

### Admin moderation reliability rollout

PR [#255](https://github.com/doric2000/PlanLi/pull/255) merged the recoverable
moderation-decision rollout to `main` as merge commit
`4640888d1dadb5d88d0a83e3b758f5c7f5dced0c` at
`2026-08-28T10:42:13Z`. The production rollout from that clean commit has the
following verified state:

- Firestore composite index `CICAgLiK4oIJ` for enforcement
  `type + status + updatedAt` is `READY`. Firestore Rules were compiled during
  validation but were not deployed.
- Thirty-one targeted v2 Functions, including the moderation callables, report
  handler, search-projection triggers, and the suspension scheduler, are 31/31
  `ACTIVE` on Node.js 22 in `europe-west1`. Their live update window was
  `2026-08-28T10:52:39.691931735Z` through
  `2026-08-28T10:55:33.103381994Z`; 21 use the core Functions service account
  and 10 use the media Functions service account. The current regional
  inventory contains 124 Functions. The scheduler is enabled every 15 minutes
  in the `Asia/Jerusalem` timezone.
- The approved production enforcement repair used fingerprint
  `77926dfd66f3ab868fa1d0b690f651c26d5b1f1edab6ad11cdd02ade3e1f1714`.
  Its pre-apply dry run, apply, and post-apply dry run each scanned zero
  `applying` records, applied zero writes, found zero safe repairs remaining,
  and found zero accounts suspended beyond their end time. No ambiguous record
  or personal data was returned.
- Firebase Hosting release `sites/planli-f0b12/releases/1787914814724000`
  serves version `sites/planli-f0b12/versions/e137f68c68fb6793`, released at
  `2026-08-28T11:00:14.724Z`. `/admin/` and bundle
  `index-7e30e6b3469b93c7b54eed2fabd8a054.js` returned HTTP 200. Browser checks at
  1280x900 and 390x844 found no console errors or horizontal overflow. The
  available browser was signed out, so authenticated production moderation was
  not exercised and no real moderation decision was submitted.
- Focused Functions tests passed 57/57 and focused client tests passed 22/22;
  changed-scope validation, Admin Web export/verification, iOS release-config
  verification, iOS and Android Expo exports, the final review, and the security
  diff scan passed. Post-deploy error-log queries returned no entries.
- Firestore and Storage Rules, IAM, production user data, and unrelated
  Functions were unchanged. No EAS Update, EAS build, TestFlight submission,
  App Store release, or Google Play release was performed; iOS and Android were
  verified and merged at source/export level only.

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

- App version/build: `1.1.0 (6)`, package `com.planli.planlitravels`, runtime
  `1.1.0`.
- EAS build: `6eb6a704-2546-4f4e-acaa-fff95ec38d7c`, completed at
  `2026-08-26T15:46:09.341Z` from clean `main` commit
  `5bf89e69d90cf6c35da414b3bdac84ea1a5181f5` with the `production` profile,
  store distribution, and production update channel. The signed `.aab` is
  available from EAS at
  `https://expo.dev/artifacts/eas/oPxirTbUSZSoziOa2xLG7H-y4aAdKBKFo2uAEYdmIc8.aab`.
- Verified local artifact: `.codex_tmp/validation/planli-1.1.0-6.aab`, 89,081,301
  bytes, SHA-256
  `84AE2043C191C4AE0D02B633B0027D085323F0796DFFC2B38DF4C9E7090B29C7`.
- Native RTL root cause and fix: PlanLi already implements its Hebrew-first RTL
  layout in JavaScript, while native OS RTL auto-mirroring mirrored navigation a
  second time. PR `#217` disabled native auto-mirroring through the
  `expo-localization` config plugin and added a regression test. The build source
  contains PR `#217` merge commit `0511cf110642fb1811cb717b5a80fd9d11e19510`.
- Release validation: all 161 client suites passed 841 tests; all 585 runnable
  Functions tests passed with 22 intentional skips; all 22 Rules emulator tests
  passed; iOS release configuration and both Android/iOS Expo exports passed. A
  live read-only audit at `2026-08-26T14:45:26.864Z` returned `ok: true` with no
  failures. The locked client dependency audit still reports eight high-severity
  findings; dependencies were not upgraded during this release.
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
- Google Play state: release `PlanLi 1.1.0 (6) – RTL Navigation`, containing only
  version code 6, was published to the active internal-testing track at
  `2026-08-26T18:58+03:00`. Play Console reports it as available to internal
  testers with no supported-device changes. Play emitted one non-blocking warning
  that no deobfuscation file is associated with the bundle. Installation and
  physical RTL behavior remain unverified. On `2026-08-25`, exact-location
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

- App version/build: `1.1.0 (15)`.
- iOS Development Build: internal-distribution build
  `ff0fc01a-890b-4668-b9a1-5d60891e9545`, runtime `1.1.0`, completed at
  `2026-08-24T17:53:02.788Z` from PR `#193` merge commit `8afdfb3`. The
  development profile has no update channel or Apple review/submission state;
  the artifact expires on `2026-09-07T17:47:09.652Z`. Download, installation,
  and physical-iPhone verification remain pending.
- Installed state: build `1.1.0 (13)` is running on the owner's physical iPhone
  through TestFlight. Builds `1.1.0 (14)` and `(15)` have not been confirmed as
  installed or exercised on a physical iPhone.
- EAS build: `d9e78de5-6f97-4371-b223-245862ec4fbb`, completed at
  `2026-08-26T15:00:19.672Z` from clean `main` commit
  `5bf89e69d90cf6c35da414b3bdac84ea1a5181f5` with the `production` profile,
  store distribution, production channel, app/runtime version `1.1.0`, and iOS
  build number `15`. The IPA artifact is
  `https://expo.dev/artifacts/eas/2jQYWEvqtwhLx2V5wFAP4qGz3odwPGh0kac1AmqfMlo.ipa`.
- Source release: the build contains the native RTL correction from PR `#217`
  merge commit `0511cf110642fb1811cb717b5a80fd9d11e19510`; its exact source is
  `5bf89e69d90cf6c35da414b3bdac84ea1a5181f5`.
- Preview EAS Update: rebuilt admin-console group
  `18ae0c59-1b46-49a7-89cf-941782743183`, runtime `1.1.0`, iOS update
  `01a04321-6135-7f22-a823-6a41f8016ee3`, and Android update
  `01a04321-6135-796f-adb0-b2f29c372bcd`, published at
  `2026-08-27T12:10:56.181Z` from clean `main` commit
  `cd458a7e33f23970926d1af3db05ef18c1cd57d6` with the production EAS
  environment. EAS read-back confirmed both manifests, the `preview` branch,
  runtime, and exact commit.
- Production EAS Update: exact republish of those preview artifacts as group
  `f91d01d2-42aa-436c-8774-98d9f85d09bd`, runtime `1.1.0`, iOS update
  `01a04323-fa7c-77db-96bb-f59d49c3474e`, and Android update
  `01a04323-fa7c-7dc9-b4ec-b5eaa4c31130`, published at
  `2026-08-27T12:13:46.492Z`. EAS read-back confirmed the production branch,
  both platforms, and exact commit `cd458a7e33f23970926d1af3db05ef18c1cd57d6`.
  Roll back by republishing production group
  `4947c1c8-6bae-4115-bc2f-b6c622d9230d`. Download and application on the
  physical TestFlight iPhone and Android tablet remain unverified.
- Firebase admin-console release: 34 targeted v2 Functions were deployed from
  clean `main` and independently inventoried as 34/34 `ACTIVE` on Node.js 22 in
  `europe-west1`. Firestore has 62/62 expected composite indexes after adding
  the eight moderation queue, enforcement, and search indexes. The authorized
  resumable backfill completed and its final dry run found zero remaining case,
  held-content, or search-projection changes. Firestore and Storage Rules, IAM,
  unrelated Functions, and native builds were unchanged.
- Firebase Hosting now serves the rebuilt admin console at
  `https://planli-f0b12.web.app/admin/`. The production HTML and expected bundle
  returned HTTP 200; browser checks at 1280x900 and 390x844 found no console
  errors or horizontal overflow. Authenticated admin behavior remains pending
  because the available browser session was signed out.
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
- OTA device state: Expo serves rebuilt admin-console preview group
  `18ae0c59-1b46-49a7-89cf-941782743183` to matching preview requests and
  production group `f91d01d2-42aa-436c-8774-98d9f85d09bd` to compatible
  Android and iOS runtime `1.1.0` clients. Download, application, and signed-in
  admin-console behavior remain unverified on physical devices. The immediate
  production rollback group is `4947c1c8-6bae-4115-bc2f-b6c622d9230d`.
- Production catalog migration: the separately authorized apply run at
  `2026-08-24T19:49Z` scanned 14 recommendations and migrated exactly one
  document (`recommendations/rec_CBCFGWNEcxN3Ov6ijXeI`) to category `nature`
  and subcategory `viewpoint`; 13 were already migrated, with zero blocked
  records and zero conflicts. The post-migration live audit completed at
  `2026-08-24T19:50:08.573Z` with 477 documents checked and zero failures. No
  Firebase deployment accompanied this migration.
- Successful EAS submission ID: `c25a5130-e7fd-464c-a41c-ff62288b65df`, created
  for build `d9e78de5-6f97-4371-b223-245862ec4fbb` and completed at
  `2026-08-26T16:38:56.039Z`. The initial submission
  `b67ba705-93eb-4438-86dd-5b058134000a` and its server-side retry
  `fad0f28f-356b-44ef-bb4d-be3d689c633e` errored without upload logs during the
  Expo incident `iOS submissions failing on upload to App Store Connect`. A fresh
  submission of the same signed IPA succeeded without rebuilding.
- App Store Connect app: `6801453067`; authenticated EAS status read-back reports
  build `1.1.0 (15)` as in beta testing for both internal and external TestFlight.
  Installation and physical-device behavior remain unverified.

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

On the Windows release workstation, use the globally installed `eas` CLI and
verify it with `eas --version` and `eas whoami`. Do not fall back to the cached
`npx eas-cli@latest` package when it fails with a missing-module error; the npm
cache can contain an incomplete EAS installation even while the global CLI is
healthy.

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

## Recommendation provider-destination publication release

- Source: recommendation fix PR `#226`, merge commit
  `92331f87a9600ce8ac59e19616573c826361c1a0`; released from clean `main`
  commit `cbb6aa61afe4e41f66e1e0afd6dbf6d3ca372ec7`, which also includes the
  approved Noya copy and campaign-ignore follow-ups in PRs `#227` and `#228`.
- Scope: preserves Google provider identity through recommendation drafts,
  materializes new city/region destinations during publication, validates the
  canonical destination IDs, keeps destination/pin/exact semantics distinct,
  repairs durable failed queues idempotently, adds destination-specific error
  copy, and tags failures only with the privacy-safe content mode.
- Firebase deployment: only `saveRecommendation`, `saveRecommendationDraft`,
  and `publishRecommendationDraft` were deployed to `planli-f0b12` in
  `europe-west1` at `2026-08-26T19:50:18Z`. All are active Node.js 22 v2
  Functions. Their deployed source hashes/generations are respectively
  `66d353305cc5bd0d3c181eb567c0ba69e7f34c89`/`1787773818476342`,
  `2f759a7e3eccf844a050dd77cad92cacd06e55b6`/`1787773818505072`, and
  `66d353305cc5bd0d3c181eb567c0ba69e7f34c89`/`1787773818504460`.
- Preview EAS Update: group `1a3c69c6-fc05-4666-b3df-da528b00facf`, Android
  update `01a03fb1-241f-7185-beb7-e5fbbd3b3b23`, and iOS update
  `01a03fb1-241f-7241-afc2-51225a3ed294`, published at
  `2026-08-26T20:09:28.863Z` on branch `preview`, runtime `1.1.0`.
- Production EAS Update: exact republish group
  `2b8fe998-103e-4d9f-8080-ad01301b6cb8`, Android update
  `01a03fb3-eeb4-7379-9d28-4b48cf0aff7b`, and iOS update
  `01a03fb3-eeb4-7718-ac45-7271f9864282`, published at
  `2026-08-26T20:12:31.796Z` on branch `production`, runtime `1.1.0`. EAS
  read-back confirmed both manifests use exact commit `cbb6aa61`; the production
  release reused the preview bundles and uploaded no new assets.
- Validation: focused Functions tests passed 63 tests, focused client tests
  passed 39 tests, `npm run validate:changed` passed, PR `#226` checks passed,
  and the final shared-contract review found no blocking issue. Both clean-main
  EAS production-lineage preflights passed. The preview export found 52 iOS and
  51 Android assets and uploaded two app bundles with no new assets.
- Observability: Sentry issue `PLANLI-MOBILE-9` remains unresolved with 15
  historical events; its last event was `2026-08-26T18:23:36Z`, before this
  rollout, and no later event was returned. Firebase inventory reports all 99
  Functions active. A Firebase MCP Cloud Logging query covering
  `2026-08-26T19:50:18Z` through `2026-08-26T20:18:00Z` returned no `ERROR`
  entries for the three deployed targets. Cloud Run revision names remain
  unverified; deployed source hashes and generations are recorded above.
- No native build, TestFlight/App Store or Google Play submission, Rules,
  indexes, Hosting, migration, IAM, or production-document mutation accompanied
  this release. Mykonos/Venice city-or-region and exact-place publication,
  one-tap recovery of a failed queue, and banner dismissal remain unverified on
  physical devices. Force-close and reopen the production app up to twice to
  download and apply the update. Roll back preview to
  `31df8f49-77fb-4151-85fb-245e594a81d7` or production to
  `1a691933-e4b6-4003-9d3d-111315a88549` if required.

## Canonical travel destination rollout

- Source: feature commit `21ad5cf9fc18d231a55142efb8317e4b38a208dd`,
  deterministic reassignment-counter fix `907ba32`, and live-audit compatibility
  fix `baf1a08`, all on pushed branch `feat/canonical-travel-destinations`. No
  merge to `main` was performed.
- Scope: a private 251-entry traveler-facing registry; canonical place-ID,
  alias, containment, parent/child and grouping resolution; India
  `addressDescriptor` support; Pro `containingPlaces` only as a last-resort
  match to an already approved destination; admin policy editing and resumable
  reassignment; writer locks; and dry-run-first seed/audit/repair tooling.
- Functions deployment: 17 affected Node.js 22 v2 Functions were created or
  updated in `europe-west1`: `saveRecommendation`,
  `publishRecommendationDraft`, `resolveRecommendationDestination`,
  `resolvePlaceSelection`, `saveRoute`, `publishRouteDraft`, `saveTrip`,
  `setFavorite`, `deleteContent`, `listDestinationReviews`,
  `getDestinationReview`, `approveDestination`, `updateDestinationPolicy`,
  `previewDestinationReassignment`, `startDestinationReassignment`,
  `getDestinationReassignmentJob`, and
  `onDestinationReassignmentJobWritten`. The worker was redeployed from
  `907ba32` after runtime validation of deterministic counter finalization. The
  exact CLI completion timestamps and Cloud Run revision names were not
  returned; deployment completed before the independent audit at
  `2026-08-26T22:37:37.021Z`. Firebase inventory confirms all five new targets
  and 104 total active Functions.
- Registry seed: `system/destinationRegistry` version 1 was written at
  `2026-08-26T22:15:38.225Z` with 251 validated, unique entries: 101 Europe,
  80 Asia, 30 Central America, and 40 South America. Enrichment returned zero
  unresolved entries and the independent Firestore read-back returned exactly
  251 child documents. The Google key was read from Secret Manager into process
  memory only and was not logged or written to disk.
- Production correction: 14 preview-bound reassignment jobs completed. They
  moved 14 recommendations, one route and its active/prepared stops, and two
  favorites; all source destinations are inactive with exact `mergedInto`
  pointers and all targets/catalog projections are active. The reported cases
  now resolve as Rivas/Ojo de Agua → Ometepe, Kannan Devan Hills/Rajamalai →
  Munnar, and Perama → Corfu. Chiang Mai and Chiang Rai are canonical province
  destinations. Bansko, Sapa, Mykonos, Da Nang, Budapest, Tyrol, Cusco, Venice,
  and Bangkok were also canonicalized from unapproved legacy identities.
- Runtime repair: one observed two-worker race moved the Munnar recommendation
  correctly but left its diagnostic progress count at zero. The finalizer now
  uses the immutable preview count; the Munnar statistic was transactionally
  reconciled from 0 to 1 and recorded in the moderation audit. A read-back of
  all 14 targets found zero recommendation-counter mismatches.
- Remaining audit state: 29 active destinations comprise 14 canonical entries
  and 15 manual-review entries, with zero active reassignment candidates and
  zero ambiguities. Fourteen inactive merged sources and two unrelated inactive
  review records remain preserved. `Nam Hoa Lu`, `Humantay Lake`, and `Rinas`
  remain manual-review cases because no approved match was reliable enough to
  mutate automatically.
- Admin Hosting: the 48-file bundle was released to
  `https://planli-f0b12.web.app/admin/`. HTML and JavaScript returned HTTP 200,
  the live bundle contains the canonical-policy and reassignment controls, and
  the configured CSP remained present. The Firebase CLI did not return a
  Hosting release ID or exact release timestamp.
- Validation: `npm run validate:changed` passed twice, including client checks,
  admin Web export/verification, 16 related Functions groups, and the Functions
  production audit. Focused post-race tests passed 14/14. The final
  `audit-live` checked 835 Firestore documents, 104 Functions, both Storage
  buckets, and public media, and returned `ok: true` with zero failures. Direct
  propagation checks found no residual source references or stale Chiang Rai
  stops, and verified the Budapest and Chiang Mai favorite moves. The final
  Cloud Logging query returned no `ERROR` entries for affected Functions. The
  32-file Codex Security diff review found no reportable vulnerabilities.
- No Firestore Rules, indexes, Storage Rules, IAM, EAS Update, native build,
  TestFlight/App Store or Google Play action accompanied this rollout. A new
  destination selection was covered by resolver tests but was not submitted
  through a physical signed-in mobile client after deployment.

## Canonical destination integrity follow-up release

- Source and Git: PR `#231` merged to `main` as
  `9d70edadfd32f18a60a0784c74266313ebcd6a2b` at
  `2026-08-27T05:57:07Z`. Final hardening commit `8fbd279` prevents reuse of an
  inactive merged destination that shares a Google Place ID, enforces parent
  grouping, validates registry graphs and provider identities, locks favorite
  mutations during reassignment, and propagates merged destination affinity.
- Firebase: `saveRecommendation`, `publishRecommendationDraft`,
  `resolveRecommendationDestination`, `resolvePlaceSelection`, `saveRoute`,
  `publishRouteDraft`, `setFavorite`, `updateDestinationPolicy`, and
  `onDestinationReassignmentJobWritten` were successfully redeployed from the
  clean merge commit. Firebase inventory confirms Node.js 22 v2 in
  `europe-west1`; a post-deploy MCP query returned no `ERROR` entries for those
  targets. Exact Cloud Run revision names and the CLI completion timestamp were
  not returned.
- Production data repair: the explicit apply run resolved 14 completed merge
  mappings, scanned 23 users, and repaired 14 personalization profiles. It
  required project confirmation and an active admin and wrote a moderation
  audit record. The immediate follow-up dry-run reported `updatedUsers: 0`.
- Hosting: the current 48-file admin bundle was released to
  `https://planli-f0b12.web.app/admin/`. Browser verification loaded the Hebrew
  authentication screen with title `AdminPanel` and no console warnings or
  errors. Firebase CLI did not return a Hosting release ID or exact timestamp.
- Preview EAS Update: group `65aad93c-c64b-4f13-a154-626f6909d333`, Android
  update `01a041e5-a290-7bc3-92e4-7befabc8c036`, and iOS update
  `01a041e5-a290-7969-ac3a-fc848b263c40`, published at
  `2026-08-27T06:26:03.536Z` on branch `preview`, runtime `1.1.0`.
- Production EAS Update: exact republish group
  `57eed77a-9f71-4e56-89c7-2c85f3c82077`, Android update
  `01a041e7-be3b-7ced-83d6-8243c9c5c93b`, and iOS update
  `01a041e7-be3b-76f4-bc0f-f7e7540f8821`, published at
  `2026-08-27T06:28:21.691Z` on branch `production`, runtime `1.1.0`. EAS
  read-back confirmed both manifests use exact commit `9d70edad`; production
  reused the preview bundles. The export found 52 iOS and 51 Android assets,
  uploaded two app bundles, and uploaded no new assets.
- Validation: final focused tests passed 89/89; `npm run validate:changed` and
  GitHub PR validation passed; the 14-file Codex Security review completed with
  no reportable findings. The final `audit-live` at
  `2026-08-27T06:31:11.158Z` checked 839 Firestore documents, 104 Functions,
  both Storage buckets and public media and returned `ok: true` with zero
  failures.
- No Firestore Rules, indexes, Storage Rules, IAM, native EAS build,
  TestFlight/App Store submission, or Google Play release was changed. The OTA
  is available to installed production-channel binaries, but download,
  application and destination behavior remain unverified on physical iOS and
  Android devices. Force-close and reopen the app up to twice to apply it. Roll
  back preview to `1a3c69c6-fc05-4666-b3df-da528b00facf` or production to
  `2b8fe998-103e-4d9f-8080-ad01301b6cb8` if required.

## Recommendation draft recovery release

- Source and Git: PR `#233` merged to clean `main` as
  `f06f2f6b6aacb99cc9d76e99cb9ffb1d34f8c4ba` at
  `2026-08-27T07:01:32Z`.
- Root cause and scope: production logs showed repeated HTTP 409 responses from
  `saveRecommendationDraft`, which maps uniquely to
  `RECOMMENDATION_DRAFT_VERSION_CONFLICT`; the final save therefore failed
  before the publication queue was reached. The client now refreshes and retries
  a matching stale draft once without overwriting a different draft. Discard is
  single-flight, shows immediate progress, treats an already-missing draft as
  success, and leaves after server deletion even if local media cleanup fails.
  Terminal save/discard failures use privacy-safe Sentry operation, code, reason,
  and content-mode tags only.
- Preview EAS Update: group `50b71fab-4cab-4a78-acf2-ef2ced0a22ff`, Android
  update `01a04210-e502-77d6-9679-5098ff897ec1`, and iOS update
  `01a04210-e502-70f2-9bb1-5f825c56fe48`, published at
  `2026-08-27T07:13:18.594Z` on branch `preview`, runtime `1.1.0`.
- Production EAS Update: exact republish group
  `65e800f9-a1eb-4a6c-916e-4cf941ec3e10`, Android update
  `01a04212-50c3-7b27-abbe-5ab757b1d1db`, and iOS update
  `01a04212-50c3-721e-ac6e-60b97ce356f3`, published at
  `2026-08-27T07:14:51.715Z` on branch `production`, runtime `1.1.0`. EAS
  read-back confirmed both manifests use exact commit `f06f2f6b`; production
  reused the preview artifacts.
- Validation: all 32 focused recommendation-composer tests passed,
  `npm run validate:changed` passed, and every PR `#233` check passed. Both
  clean-main production-lineage preflights passed against the previously live
  commit `9d70edad`. The preview export found 52 iOS and 51 Android assets,
  uploaded two app bundles, and uploaded no new assets.
- Observability: read-only Sentry queries returned no issues in the preceding
  24 hours for the `prod` or `production` environments or without an environment
  filter. No physical-device reproduction has been completed after rollout.
- No Firebase deployment, Rules, indexes, Hosting, migration, IAM, native EAS
  build, TestFlight/App Store submission, or Google Play release accompanied
  this JavaScript-only update. Force-close and reopen the production app up to
  twice to apply it. Roll back preview to
  `65aad93c-c64b-4f13-a154-626f6909d333` or production to
  `57eed77a-9f71-4e56-89c7-2c85f3c82077` if required.

## Android Home startup-crash hotfix

- Source and Git: PR `#235` merged to clean `main` as
  `c53976369bf26bf7608a635c962b88e84b8eab4a` at
  `2026-08-27T09:28:04Z`.
- Root cause and scope: Sentry issue `PLANLI-MOBILE-M` showed React Native
  throwing `IllegalArgumentException: Invalid accessibility role value: status`
  while an authenticated user opened Home on Android 16. React Native `0.81.5`
  accepts `status` in the JavaScript type but excludes it from the legacy
  Android `AccessibilityRole` enum. Both cached Home refresh notices now use the
  cross-platform `role="status"` prop and retain polite Android live-region
  announcements without sending the crashing legacy prop.
- Preview EAS Update: Android-only group
  `15e726fc-c307-4939-96fb-519e6c5c4050`, update
  `01a04298-0ef7-75ef-8187-72bf5df94c6e`, published at
  `2026-08-27T09:40:56.695Z` on branch `preview`, runtime `1.1.0`.
- Production EAS Update: exact Android artifact republish group
  `25506ec2-6a03-46dd-99f4-7b26178e9205`, update
  `01a0429b-1a4e-7018-bbd6-a8001df4f267`, published at
  `2026-08-27T09:44:16.206Z` on branch `production`, runtime `1.1.0`. EAS
  read-back confirmed the exact source commit and Android-only platform; iOS
  remains on recommendation draft-recovery group
  `65e800f9-a1eb-4a6c-916e-4cf941ec3e10`.
- Validation: the focused Home suite passed 17/17 tests, changed-scope
  validation passed, the Android Hermes export bundled 2,418 modules and 48
  assets, and all applicable PR `#235` checks passed. Both clean-main
  production-lineage preflights passed. The EAS preview export uploaded one app
  bundle, found 51 Android assets, and uploaded no new assets.
- Observability: Sentry still marks `PLANLI-MOBILE-M` unresolved with four fatal
  events from one user. Its last event remains `2026-08-26T20:57:31Z`, before
  this rollout; the post-release read-only query returned no later event.
- No native EAS build, iOS update, TestFlight/App Store or Google Play
  submission, Firebase deployment, Rules, indexes, Hosting, migration, IAM, or
  production-data write accompanied this JavaScript-only hotfix. Download,
  application, and launch verification on a physical Android device remain
  pending. Force-close and reopen the production app up to twice to apply it.
  Roll back Android preview to group
  `50b71fab-4cab-4a78-acf2-ef2ced0a22ff` or Android production to group
  `65e800f9-a1eb-4a6c-916e-4cf941ec3e10` if required.

## Recommendation RTL-link publication recovery release

- Source and Git: PR `#237` merged to clean `main` as
  `ffde0470634d13f9e5c93656770cc16e85818171` at
  `2026-08-27T10:14:34Z`.
- Root cause and scope: production incident `loc_DiQNgtDzVtrp` reached
  `publishRecommendationDraft` with a visually valid HTTPS link prefixed by an
  invisible RTL formatting character. Draft and media saves had succeeded, but
  final URL parsing rejected the link as `invalid_selection`. Client and server
  boundaries now strip Unicode bidi formatting controls and trim external URLs,
  while still rejecting non-HTTP(S), hostless, and non-string values. Existing
  durable recommendation jobs that failed specifically for this legacy shape
  are upgraded and requeued once without re-uploading remote media; unrelated
  invalid selections remain failed. Genuine link errors now return
  `invalid_external_url` with link-specific Hebrew copy.
- Firebase deployment: only `saveRecommendation`, `saveRecommendationDraft`,
  and `publishRecommendationDraft` were deployed from the clean merge commit to
  `planli-f0b12` in `europe-west1`. Independent inventory confirms all 104
  Functions active on Node.js 22. The resulting Cloud Run revisions are
  `saverecommendation-00042-dis` (updated `2026-08-27T10:19:46Z`),
  `saverecommendationdraft-00004-pax` (`2026-08-27T10:19:58Z`), and
  `publishrecommendationdraft-00008-tuw` (`2026-08-27T10:19:52Z`). The first
  CLI attempt stopped during local source discovery before any remote update;
  the single retry with the documented discovery timeout completed successfully.
- Preview EAS Update: group `98b2e69d-fabb-466a-88a8-abbc98510616`, Android
  update `01a042cb-79bc-7440-928c-b13c1bc6be47`, and iOS update
  `01a042cb-79bc-77b8-b482-2830fa2101be`, published at
  `2026-08-27T10:37:06.364Z` on branch `preview`, runtime `1.1.0`.
- Production EAS Update: exact preview-artifact republish group
  `4947c1c8-6bae-4115-bc2f-b6c622d9230d`, Android update
  `01a042ce-61b1-763e-aaf8-37e5379f0b43`, and iOS update
  `01a042ce-61b1-7335-b9c8-c07e666cabbc`, published at
  `2026-08-27T10:40:16.817Z` on branch `production`, runtime `1.1.0`. EAS
  read-back confirmed both manifests use exact commit `ffde0470634d13f9e5c93656770cc16e85818171`.
  The preview export bundled 2,419 modules for each native platform, found 52
  iOS and 51 Android assets, uploaded two app bundles and no new assets; the
  production release reused those exact artifacts.
- Validation: 64 focused client tests and 68 focused Functions tests passed,
  `npm run validate:changed` and `git diff --check` passed, every PR `#237`
  check passed, and final review found no blocking issue. Both clean-main EAS
  production-lineage preflights passed against the previously live production
  source `c539763`.
- Observability: a post-deploy read-only Cloud Logging response covering the
  three deployed services from `2026-08-27T10:19:30Z` returned 15 entries with
  zero `ERROR`/5xx entries and zero publication-failure signals. Subsequent
  repeated queries reached the project read-request quota; the successful
  response, deployed revision inventory, and EAS manifests were verified
  independently.
- No native EAS build, TestFlight/App Store or Google Play submission, Rules,
  indexes, Hosting, migration, IAM, or production-document mutation accompanied
  this release. OTA download/application and retry success remain unverified on
  physical iOS and Android devices. Force-close and reopen the production app up
  to twice to apply it. Roll back preview Android to
  `15e726fc-c307-4939-96fb-519e6c5c4050`, preview iOS to
  `50b71fab-4cab-4a78-acf2-ef2ced0a22ff`, production Android to
  `25506ec2-6a03-46dd-99f4-7b26178e9205`, or production iOS to
  `65e800f9-a1eb-4a6c-916e-4cf941ec3e10` if required.

## Admin console rebuild and compatibility release

- Source and Git: compatibility PR `#239` merged as
  `7d71e3b8c41d` and search-projection repair PR `#240` merged as final release
  commit `cd458a7e33f23970926d1af3db05ef18c1cd57d6` on clean `main`.
- Root cause and scope: the rebuilt admin client could reach an older or
  partially deployed callable/index surface and then expose raw Firebase
  failures for every action. The console now bootstraps against an explicit
  `consoleContractVersion`, blocks operational controls until the backend
  contract is compatible, keeps saved views optional, and maps callable/index
  failures to safe Hebrew recovery states. The moderation search backfill is
  idempotent and no longer rewrites equivalent projections. A production dry
  run also exposed an optional destination `countryName` being serialized as
  `undefined`; PR `#240` omits the absent field and covers it with a regression
  test.
- Firestore indexes: the exact indexes target was deployed to the Standard
  `(default)` database in `eur3`. Independent comparison reported 62 local and
  62 live composite indexes with none missing; eight moderation-case,
  enforcement, and search indexes were added. Firestore Rules were not
  deployed or weakened.
- Functions: the 34 admin, moderation, enforcement, notification, profile-sync,
  deletion, and search-projection targets were deployed with the documented
  extended source-discovery timeout and explicit retry-policy confirmation.
  Independent inventory found all 34 `ACTIVE`, v2, Node.js 22, and
  `europe-west1`; the seven repaired search triggers share deployed source hash
  `a03346c8f761f7519163bc2f22737a06695cd0c1`. Two attempts to read recent
  Function logs through Firebase CLI failed in the Google Cloud log-retrieval
  layer, so post-release log contents are explicitly unverified rather than
  reported as clean.
- Moderation backfill: the initial dry run found nine case revisions, two held
  content links, and 127 search projections. The approved apply wrote the nine
  case and two held-content repairs. The first search apply stopped before its
  batch commit when Firestore rejected the undefined destination field; after
  PR `#240` and redeployment of the seven search triggers, the dry run found 74
  and five changes across two resumable batches and the apply completed. The
  final read-only audit inspected 11 cases, two held records, and 318 search
  resources across two pages with zero remaining changes or writes.
- Hosting: `export:admin-web` and `verify:admin-web` passed, resolving all 35
  local references, before exact Hosting deployment. The live admin route at
  `https://planli-f0b12.web.app/admin/` returned HTTP 200 with the expected
  bundle. Browser checks at desktop 1280x900 and iPhone 390x844 loaded the
  Hebrew sign-in state with no console errors or horizontal overflow. The
  available browser profile had no signed-in admin session, so authenticated
  policy bootstrap and real admin actions remain unverified in production.
- EAS Update: two clean-main production-lineage preflights passed against the
  preceding live source `ffde0470634d13f9e5c93656770cc16e85818171`. Preview
  group `18ae0c59-1b46-49a7-89cf-941782743183` contains iOS update
  `01a04321-6135-7f22-a823-6a41f8016ee3` and Android update
  `01a04321-6135-796f-adb0-b2f29c372bcd`, published at
  `2026-08-27T12:10:56.181Z`. Those exact artifacts were republished to
  production group `f91d01d2-42aa-436c-8774-98d9f85d09bd`, iOS update
  `01a04323-fa7c-77db-96bb-f59d49c3474e`, and Android update
  `01a04323-fa7c-7dc9-b4ec-b5eaa4c31130` at
  `2026-08-27T12:13:46.492Z`. EAS read-back confirmed both production
  manifests, runtime `1.1.0`, branch `production`, and exact commit
  `cd458a7e33f23970926d1af3db05ef18c1cd57d6`. The preview export bundled 2,419
  modules for each native platform, found 52 iOS and 51 Android assets, uploaded
  two app bundles, and uploaded no new assets.
- Validation: focused Functions coverage passed 40/40 tests and transitive
  moderation, notification, deletion, and public-profile coverage passed 75/75.
  Client contract/error coverage passed 13/13, changed-scope validation passed,
  and the single final review found and drove the error-priority regression fix
  before merge. Regression coverage includes reporter document-ID anonymity,
  filtered moderation datasets larger than one page, failure after suspension
  reinstatement finalization, and route-revision projection cleanup.
- No native EAS build, TestFlight/App Store or Google Play submission, Rules,
  Storage, IAM, dependency upgrade, or destructive production deletion was
  performed. The only production-document writes were the explicitly approved
  moderation backfill. OTA download/application and authenticated admin actions
  on a physical iPhone remain unverified. Force-close and reopen the production
  app up to twice to apply the OTA; roll back by republishing production group
  `4947c1c8-6bae-4115-bc2f-b6c622d9230d`.

## Launch-safe destination resolution release

- Source and Git: implementation commit `59dc63b19801cc9b596679dbe10f8066b9ac940d`
  passed PR `#242` and merged to clean `main` as
  `77096274e5b6f0efd6219d8500c94f4a5864a174` at
  `2026-08-27T13:46:55Z`.
- Root cause and scope: Google `locality` values were treated as traveler-facing
  destinations even when they represented unfamiliar address components such
  as Rivas or Kannan Devan Hills. Resolution now prefers a private reviewed
  registry of 251 traveler destinations, supports explicit Hebrew naming and a
  same-country fallback picker, preserves the exact-place publication token,
  rejects cross-country attachment before any cache mutation, and ignores stale
  asynchronous destination-search results. The client asks the user to choose
  when no reliable destination can be inferred instead of activating a raw
  provider name.
- Validation: focused review-fix coverage passed 23 client and 49 recommendation
  service tests. Changed-scope validation passed 79 client tests and 106
  Functions tests, validated all 251 registry entries and reported zero
  Functions dependency vulnerabilities. Every required PR `#242` check passed,
  including affected client and Functions jobs and final PR validation.
- Functions: only `resolvePlaceSelection` and
  `resolveRecommendationDestination` were deployed from the merge source to
  `planli-f0b12` in `europe-west1`. Independent inventory reports both `ACTIVE`,
  v2, Node.js 22, and source hash
  `2172059424f0ac2be3f4668238982121b37aa98a`. The uploaded source generations
  correspond to `2026-08-27T14:13:31.722Z` and
  `2026-08-27T14:12:43.311Z`, respectively. The Firebase log read-back failed in
  the Google Cloud retrieval layer, so post-deploy log contents are unverified.
- EAS Update: EAS CLI `22.6.0` was reinstalled after the cached `npx` package was
  incomplete. The new `eas release` topic still exposed no executable
  subcommands, so it was not added to the durable release instructions and the
  established exact-artifact workflow remained in use. Two production-lineage
  preflights passed against prior production commit
  `cd458a7e33f23970926d1af3db05ef18c1cd57d6`. Preview group
  `2be4404d-9bb4-48aa-b296-44df198deb1b`, Android update
  `01a0438a-7b5f-7b6e-bb99-a93a49637c41` and iOS update
  `01a0438a-7b5f-7038-9bf4-acd190311bf0` were published at
  `2026-08-27T14:05:44.159Z`. Those exact artifacts were republished to
  production group `a50b1502-5158-49e5-bb59-02933dac81f1`, Android update
  `01a04394-64d8-76b2-8e63-e7c29c23f6df` and iOS update
  `01a04394-64d8-72c5-b098-e4c0700e6544` at
  `2026-08-27T14:16:33.752Z`. EAS read-back confirmed both platforms, runtime
  `1.1.0`, production head, and exact merge commit `77096274`.
- The preview export bundled 2,421 modules for each native platform, uploaded
  two app bundles, found 52 iOS and 51 Android assets, and uploaded no new
  assets. No native build, TestFlight/App Store or Google Play submission,
  Hosting, Rules, indexes, IAM, migration, registry seed, or production-document
  write accompanied this release. OTA download/application and authenticated
  destination behavior remain unverified on physical devices. Force-close and
  reopen the production app up to twice to apply it; roll back preview to group
  `18ae0c59-1b46-49a7-89cf-941782743183` or production to group
  `f91d01d2-42aa-436c-8774-98d9f85d09bd` if required.

## Content publication contract release

- Source and Git: implementation commit `5e2967838463` passed PR `#244` and
  merged to clean `main` as `e7bc51d640adfd2cc45ea01a441bc554c0499591`
  at `2026-08-27T15:08:41Z`.
- Root cause and scope: safe recommendations using a labeled taxonomy “Other”
  choice were persisted as `moderation_hold`, while save responses omitted the
  stored publication status. The durable queue therefore reported success even
  though public/profile queries correctly excluded the record. Recommendation
  and route save/draft receipts now return an explicit `active` or
  `moderation_hold` outcome, unknown legacy responses never claim public
  visibility, safe labeled Other recommendations publish immediately, and held
  route retries replay idempotently. The owner profile now has a read-only
  **בבדיקה** tab backed by an owner-scoped callable. The acceptance matrix covers
  exact, destination and pin locations, all 10 categories and 166
  subcategories, route stop variants, drafts, edits, retries and moderation.
- Functions: only `saveRecommendation`, `publishRecommendationDraft`,
  `saveRoute`, `publishRouteDraft`, and `listMyPendingContent` were deployed to
  `planli-f0b12` in `europe-west1`. Independent inventory confirms all five are
  `ACTIVE`, v2 and Node.js 22. Revisions are
  `saverecommendation-00043-mob`,
  `publishrecommendationdraft-00009-bih`, `saveroute-00043-nul`,
  `publishroutedraft-00009-zal`, and `listmypendingcontent-00001-vuj`; deployment
  completed between `2026-08-27T15:13:08Z` and `2026-08-27T15:13:12Z`.
- Production repair: a guarded dry run found exactly two legacy
  `taxonomy_other` holds, both valid and none blocked. The fingerprint-locked
  apply activated both at `2026-08-27T15:16:20Z`, removed their obsolete
  moderation fields and wrote two audit records. Independent read-back found
  both recommendations and all 10 media registry entries active, with zero
  remaining taxonomy-Other holds. Direct Storage object checks were unavailable
  to the CLI service identity; canonical descriptors and owner-bound active/held
  registry records were verified before apply, and the media trigger's active
  read-back was verified afterward.
- EAS Update: two clean-main production-lineage preflights passed against prior
  production commit `77096274e5b6f0efd6219d8500c94f4a5864a174`. Preview group
  `50e55983-342e-48d0-9e9f-ceba7c77754d`, Android update
  `01a043dd-a5c4-7b59-9ccd-c3e6e8f7b77d` and iOS update
  `01a043dd-a5c4-7eca-8272-19218a684a56` were published at
  `2026-08-27T15:36:34.500Z`. Those exact artifacts were republished to
  production group `4c1fcb12-53c4-4696-90ff-3ad047597e40`, Android update
  `01a043e2-3cf0-710b-a265-2c3b9ecfa9ca` and iOS update
  `01a043e2-3cf0-7812-8872-12d045411a09` at
  `2026-08-27T15:41:35.344Z`. EAS read-back confirmed both branches, platforms,
  runtime `1.1.0` and exact source commit `e7bc51d`. The preview export bundled
  2,422 modules for each native platform, uploaded two app bundles, found 52
  iOS and 51 Android assets, and uploaded no new assets.
- Validation and observability: focused client publication/profile/draft/route
  coverage, 108 focused Functions tests, generated coverage for every taxonomy
  selection, `npm run validate:changed`, `git diff --check`, secret review and
  all four required PR checks passed. Firebase read-only logging found no
  `ERROR` entries for the five deployed Functions from
  `2026-08-27T15:08:00Z` through release verification. Sentry returned no
  unresolved `prod`/`production` issue and no publication issue in the preceding
  24 hours.
- No native EAS build, TestFlight/App Store or Google Play submission, Rules,
  indexes, Hosting, IAM or dependency change accompanied this release. The only
  production-document writes were the two explicitly approved audited repairs.
  OTA download/application and a physical end-to-end recommendation/route
  matrix remain unverified. Force-close and reopen the production app up to
  twice to apply it. Roll back preview to group
  `2be4404d-9bb4-48aa-b296-44df198deb1b` or production to group
  `a50b1502-5158-49e5-bb59-02933dac81f1` if required.

## Location selection and RoadTrip stability release

- Source and Git: implementation commit `ab94604` passed PR `#246` and merged
  to clean `main` as `f5bfbff22f71f6a95d1b1e8bc56c968635fa52fd`. EAS
  preflight repair commit `24fd4d3` passed PR `#247` and produced final release
  source `b1314ba4bf10dee1e9fbb82548cfceab2aaf355d` at
  `2026-08-27T18:00:47Z`.
- Root cause and scope: directly selected Google cities outside the reviewed
  catalog were rejected, successful destination confirmation was lost by two
  recommendation screens, and exact places could disappear while reassignment
  was required. Draft expiry and RoadTrip publication could also discard a
  verified place-to-destination binding or consume Google verification quota
  again. The release establishes one location-selection contract for
  recommendations and RoadTrips, permits verified directly selected cities such
  as Hod Hasharon as provisional destinations, keeps exact-place map state,
  preserves server-owned draft bindings, trusts matching active PlanLi sources,
  keeps PlanLi results usable during Google failures, and classifies recovery
  actions instead of exposing a dead end.
- Validation: changed-scope validation passed seven affected client groups and
  eight affected Functions groups; focused Functions location coverage passed
  106 tests. The final review reported no blocking, P1 or P2 finding, every check
  on PRs `#246` and `#247` passed, and the repaired EAS preflight unit suite
  passed 5/5. Physical end-to-end behavior remains unverified and is delegated
  to the beta device matrix after rollout.
- Functions: `searchPlaces`, `resolvePlaceSelection`,
  `resolveRecommendationDestination`, `saveRecommendation`,
  `saveRecommendationDraft`, `publishRecommendationDraft`,
  `getCurrentRouteDraft`, `saveRoute`, `saveRouteDraft`, and
  `publishRouteDraft` were deployed with exact targets to `planli-f0b12` in
  `europe-west1`. The first attempt stopped before live changes because source
  discovery exceeded ten seconds; the documented
  `FUNCTIONS_DISCOVERY_TIMEOUT=60000` retry succeeded. Independent inventory
  confirmed all ten `ACTIVE`, v2 and Node.js 22. No Rules, indexes, Storage,
  Hosting, IAM or production-document writes accompanied the deployment.
- Production audit: the post-release read-only audit at
  `2026-08-27T18:25:41.293Z` inspected 848 Firestore documents and all 123
  Functions. It found zero unexpected roots or Functions, invalid location
  references or names, orphan location sources, invalid destination IDs,
  missing European media objects or checksum mismatches; `failureCount` was
  zero.
- EAS Update: global EAS CLI `22.6.0` was used because the cached `npx eas-cli`
  installation remained incomplete. The release preflight now deliberately uses
  the installed EAS executable, and its durable setup and identity checks are
  documented above. Preview group `e0db577e-4aa0-4e29-bc00-0ee0442e6671`, iOS
  update `01a04472-8495-7bbe-a365-2f617a77b6b7` and Android update
  `01a04472-8495-73ea-88dd-4057e2f458aa` were published at
  `2026-08-27T18:19:10.869Z`. Those exact artifacts were republished to
  production group `3016e5a7-5f03-4abd-8277-db1e43f48f4d`, iOS update
  `01a04475-a5ba-7ff3-ae65-1fc08c9b7e40` and Android update
  `01a04475-a5ba-7b18-bc16-191f2e63a5bf` at
  `2026-08-27T18:22:35.962Z`. EAS read-back confirmed production head, both
  platforms, runtime `1.1.0`, a clean tree and exact source commit `b1314ba`.
- No native EAS build or store submission was needed because the installed iOS
  and Android beta binaries already use compatible runtime `1.1.0`. OTA
  download/application and the physical recommendation/RoadTrip matrix remain
  unverified. Force-close and reopen the production app up to twice to apply the
  OTA. Roll back by republishing production group
  `4c1fcb12-53c4-4696-90ff-3ad047597e40` if required.

## Regional discovery release

- Source and Git: implementation commit
  `3d897dea01f9af32565e3da69f4c573406a7aa35` passed PR `#249` and merged to
  clean `main` as `4319c86a3f9dff786c5bf9489c14c194084695bc`.
- Scope: the client now requires a persisted selection from eight travel regions,
  exposes an accessible pixel-matched Hebrew atlas selector, and filters home,
  search, community, routes, maps and destination discovery to the active region.
  The server owns the region contract, persists authenticated selections and
  rejects unsupported region identifiers. The final review also fixed map
  refresh on region changes, cleared stale home rails after failed refreshes and
  prevented unclassified local search history or favorites from crossing the
  selected-region boundary.
- Firestore and data: 48 required composite indexes were deployed to the
  production `eur3` database and independently reached `READY`. The guarded
  classification backfill first reported 121 eligible documents without writes,
  then updated 121 documents after authorization: 15 countries, 48 destinations,
  32 catalog records, 24 recommendations and two routes. A final dry run found
  all 121 current and zero remaining changes.
- Functions: exactly 15 Node.js 22 v2 Functions were deployed to
  `europe-west1`: `saveRecommendation`, `publishRecommendationDraft`,
  `saveRoute`, `publishRouteDraft`, `getPersonalizedRecommendations`,
  `getMapRecommendations`, `getPersonalizedRoutes`, `searchDestinations`,
  `setDiscoveryRegion`, `onDestinationCatalogSync`,
  `onCountryDestinationCatalogSync`, `previewDestinationReassignment`,
  `startDestinationReassignment`, `getDestinationReassignmentJob` and
  `onDestinationReassignmentJobWritten`. Independent inventory confirmed all 15
  `ACTIVE`; the post-deploy log query returned zero recent error lines.
- EAS Update: the production project environment now contains
  `EXPO_PUBLIC_REGION_DISCOVERY_ENABLED=true`. Preview group
  `bb382a52-a7fb-4c30-b81c-14cb53a83e47`, Android update
  `01a04561-f717-7897-b748-c8fdeb546f09` and iOS update
  `01a04561-f717-7999-9948-52b982b02f7c` were built from the clean merge source.
  Those exact artifacts were republished to production group
  `13f33be0-9aba-4c24-8ad2-4ba93a431bd5`, Android update
  `01a04563-9588-79ef-a6df-025b012318c3` and iOS update
  `01a04563-9588-7296-b65e-99f238cbae6f` at
  `2026-08-27T22:42:29.384Z`. EAS read-back confirmed branch `production`, both
  platforms, runtime `1.1.0` and exact source commit `4319c86a`.
- Validation: the full client suite passed 907 tests in 168 suites; the full
  Functions suite passed 688 tests with 22 intentional skips and zero failures;
  Firestore Rules emulator coverage passed 22/22. Changed-scope validation,
  admin Web export/verification, iOS release configuration/export, Functions
  production audit, final diff checks and every required PR check passed. Browser
  smoke tests at 390x843 and 1440x1000 verified all eight buttons, selection,
  replacement, reload persistence, centered desktop layout and zero console
  errors.
- No replacement native EAS build or App Store/Google Play submission was needed
  because this release changes JavaScript, assets and compatible backend contracts
  only; the installed beta binaries already target runtime `1.1.0`. OTA download,
  application and regional end-to-end behavior on physical iOS and Android devices
  remain unverified. Force-close and reopen the production app up to twice to
  apply the OTA. Roll back by republishing production group
  `3016e5a7-5f03-4abd-8277-db1e43f48f4d` if required.

## Region selector polish release

- Source and Git: implementation commit
  `49318a4` passed PR `#251` and merged to clean `main` as
  `0c10dc73b4b7ad78b025acf321615f95d47b8277`.
- Scope: the native selector now extends edge-to-edge beneath transparent system
  bars while keeping the skip action reachable below the top safe inset. Press
  feedback follows each region image's alpha shape with a white outline instead
  of showing a rectangular highlight. Community and Routes now expose the active
  region through a compact accessible globe action beside the existing page title,
  without adding header height; Home retains its full region preview control.
- Validation: five focused client suites passed 51/51 tests, changed-scope
  validation passed, `git diff --check` passed and every required check on PR
  `#251` passed. Browser checks at 390x843 exercised the selector and both compact
  header actions, confirmed the expected layout and navigation, and found no
  console errors. Physical-device safe-area and press-effect behavior remain
  unverified.
- EAS Update: preview group `41776324-c1db-4c5d-832e-cb1ccc3d3b7d`, Android
  update `01a04724-d7b4-741a-92d2-f23975db81f8` and iOS update
  `01a04724-d7b4-7cb7-960a-4dcc4f7abbc9` were published at
  `2026-08-28T06:53:11.988Z`. Those exact artifacts were republished to production
  group `b363be1d-63b2-4ea9-86e2-67bf3923b01c`, Android update
  `01a04728-4cd2-7278-bf57-8d555e2e1c2d` and iOS update
  `01a04728-4cd2-7c6d-a464-3f0af1fe74b6` at
  `2026-08-28T06:56:58.578Z`. EAS read-back confirmed branch `production`, both
  platforms, runtime `1.1.0` and exact source commit `0c10dc73`.
- No Functions, Firestore indexes or Rules, native EAS build, App Store submission
  or Google Play submission changed in this release. The existing beta binaries
  already use runtime `1.1.0`; force-close and reopen the production app up to
  twice to apply the OTA. Roll back by republishing production group
  `13f33be0-9aba-4c24-8ad2-4ba93a431bd5` if required.

## Region selector contour correction release

- Source and Git: implementation commit `414dadf` passed PR `#253` and merged
  to clean `main` as `f5ba91fe5848fac31bff7eda36e9c19b0b2f9233`.
- Scope: the selector uses a clean reference background without the baked-in
  skip label, exposes cancellation only when changing an existing selection,
  and renders independent alpha-aware white contour assets for all eight
  regions. The Israel pin, Madagascar, Sri Lanka and the Australia/New Zealand
  islands are included in their corresponding contour feedback.
- Validation: 15 focused selector tests passed, changed-scope validation passed,
  admin Web export/verification and iOS release configuration/export passed,
  `git diff --check` passed and every required check on PR `#253` passed. Browser
  validation at 390x843 exercised the selector flow. Automated image checks
  confirmed transparent crop bounds and placed at least 95% of contour pixels
  within 9px of a detected source edge. Physical-device safe-area and contour
  rendering remain unverified.
- EAS Update: preview group `dae40722-4fce-41cd-93a5-2f305d356ac4`, Android
  update `01a04776-7fc1-7eb6-a4dc-794a458d6f02` and iOS update
  `01a04776-7fc1-7064-918a-a12cc9f148bb` were published at
  `2026-08-28T08:22:23.425Z`. Those exact artifacts were republished to
  production group `a83997fb-1e7a-49be-8f4a-224892133b7d`, Android update
  `01a04777-c1ca-7df1-9dab-d4ec52088da9` and iOS update
  `01a04777-c1ca-79c1-8723-e755e1b386f9` at
  `2026-08-28T08:23:45.866Z`. EAS read-back confirmed branch `production`, both
  platforms, runtime `1.1.0` and exact source commit `f5ba91fe`.
- No Functions, Firestore indexes or Rules, native EAS build, App Store
  submission or Google Play submission changed in this release. The existing
  beta binaries already use runtime `1.1.0`; force-close and reopen the
  production app up to twice to apply the OTA. Roll back by republishing
  production group `b363be1d-63b2-4ea9-86e2-67bf3923b01c` if required.

## Destination resolution v3 backend release

- Source and Git: implementation commit
  `c91a2d0e60bd5016a0d117a18993f873fa6c0b15` passed PR
  [#258](https://github.com/doric2000/PlanLi/pull/258) and merged to `main` as
  `eaf9937f0214fbe894123096b8341006970173fc`. The idempotence, Hoi An and
  Vlorë correction commit `df54d06` passed PR
  [#259](https://github.com/doric2000/PlanLi/pull/259) and merged to clean
  `main` as `404fa28782a6a01ea9cbf3780457f5df0888d459` at
  `2026-08-28T13:37:30Z`.
- Scope: recommendations and RoadTrips now use the same canonical destination
  resolver, retain verified place-to-destination bindings through drafts and
  publication, bias RoadTrip place search toward its selected destination, and
  keep local PlanLi results usable when Google fails. Directly selected cities
  can remain provisional instead of being rejected solely because they are not
  yet in the reviewed registry. The researched registry contains 252 entries;
  Vlorë is an approved `city_hub` named `ולורה`, distinct from the Albanian
  Riviera, and its narrower city geometry wins for places inside the city.
- Functions: exactly 11 Node.js 22 v2 Functions were deployed from clean merge
  `404fa287` to `europe-west1`: `searchPlaces`, `resolvePlaceSelection`,
  `resolveRecommendationDestination`, `saveRecommendation`,
  `saveRecommendationDraft`, `publishRecommendationDraft`,
  `getCurrentRouteDraft`, `saveRoute`, `saveRouteDraft`, `publishRouteDraft`
  and `updateDestinationPolicy`. Independent Cloud Run read-back confirmed the
  ready revisions `searchplaces-00026-gov`,
  `resolveplaceselection-00030-sew`,
  `resolverecommendationdestination-00042-hij`,
  `saverecommendation-00047-fim`, `saverecommendationdraft-00007-gej`,
  `publishrecommendationdraft-00013-vat`,
  `getcurrentroutedraft-00005-loj`, `saveroute-00047-zuj`,
  `saveroutedraft-00009-sar`, `publishroutedraft-00013-ger` and
  `updatedestinationpolicy-00004-zop`. Their ready-transition window was
  `2026-08-28T13:41:38.691887Z` through `2026-08-28T13:41:53.910531Z`.
- Registry and data: the guarded registry readiness migration initially wrote
  267 documents and its Vlorë-aware geometry follow-up wrote one document; the
  final dry run reported 252 automatic profiles, zero blocked or incompatible
  profiles, zero legacy patches and `totalWrites: 0`. `Nam Hoa Lu` was merged
  into canonical Ninh Binh by completed job
  `dra_nO05TymjP4IagjnZH55slCYxwTah`. Two exact Hoi An recommendations were
  moved out of Da Nang under audit `location_repair_hoi_an_20260828_v1`.
  The mistaken Vlorë-to-riviera job
  `dra_YdpWKOLkobQkM_TiZgIxvLsvH3oj` was rolled back: Hotel Liro, one route and
  four active stops now reference canonical Vlorë destination
  `AL/dst_g99_bYzJWzH2iMhbwibL`; the stale provider claim was removed under
  audits `location_repair_vlore_city_20260828_v1` and
  `location_repair_vlore_claim_20260828_v1`. The unused materialized Albanian
  Riviera catalog document was removed; its reviewed registry entry remains
  available for legitimate future use.
- Validation and observability: 36 focused registry/migration/repair tests,
  direct recommendation and RoadTrip coverage, `npm run validate:changed`, the
  review-agent pass and every required check on PRs #258 and #259 passed. The
  final canonical audit found 252 trusted profiles, zero registry issues,
  reassignment candidates or ambiguities. The live audit at
  `2026-08-28T13:45:08.873Z` inspected 869 Firestore documents and all 124
  Functions and found zero invalid location references, names, orphan sources,
  counter mismatches or failures. Post-deploy Cloud Run logging returned zero
  `ERROR` entries.
- No EAS Update was published for iOS or Android by explicit release scope, so
  the client-side search-bias and picker changes in PR #258 are merged but are
  not yet delivered to installed beta apps. The compatible runtime remains
  `1.1.0` and the latest production OTA group remains unchanged. No native EAS
  build, TestFlight/App Store or Google Play submission, Hosting, Firestore
  Rules/index, Storage, IAM or dependency change accompanied this release.
