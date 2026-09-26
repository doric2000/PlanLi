# OTA native compatibility

## Installed iOS runtime 1.4.0 baseline (2026-09-26)

The owner confirmed TestFlight 1.1.3 (34) is installed and opened a shared trip
from WhatsApp (initial read failed; manual retry succeeded). The baseline now
binds EAS build `1ff27c70-6a66-4daf-b58d-bb8a3d092091`, source
`1eae24ccf94072490d766202f2ad4f9478d2ce22`, production channel/runtime 1.4.0 and
fingerprint `976661b4a04d2165ecd571430564b16b5f86fc13`. The signed IPA independently
confirmed its version, runtime, channel and `applinks:planli.cc` entitlement.
The earlier build-30 optional-module exception is removed for this baseline;
future updates must match the new binary or undergo a separate native review.
These facts supersede the older installed-iOS references below. They do not
establish complete device acceptance or installation of Android build 12.

The first build-34 OTA preflight stopped before upload: archive fingerprint
`c878899fdb9cb021ab9be0955745927dbc7e5caa` differed from the installed binary.
The detailed provider comparison showed dependency paths resolving outside the
archive through its junction, and the Firebase plist using CRLF instead of the
installed build's LF (`add4349d42ce5679ab2e3801de30069757de245e`). The generated
Expo configuration, app assets and local native module hash were unchanged.
This baseline now requests a physical copy of the existing dependencies and
hash-bound LF normalization for that plist. The older baseline's junction/CRLF
behavior remains the default. No dependency upgrade or fingerprint exception is
introduced; publication still requires the installed build's exact fingerprint.

## Android demo metadata review for the iOS map OTA (2026-09-20)

Merged PR #423 added only the `android-demo` build profile to `client/eas.json`.
The CRLF metadata digest is now `a2f077ce45880541cc6d5d16440dc18c54977b57`.
Comparing the parsed file after removing that profile with production OTA source
`5edb740` proved every existing profile/configuration identical. Executing both
versions of app.config.js with the same production OTA environment also produced
identical Expo configuration. The demo condition is false on production iOS,
and the WorkManager fix changes Android source only; iOS module source is unchanged.
All six optional-module fallback source hashes still match the existing receipt.

Production-environment fingerprinting of source `6c5fcbe0ebb38f38c521adaf618e3182262a5c99`
produced `f9c26614b2ebac29b63ee6df9d097175b6cfa036`. EAS comparison against the
previous reviewed hash `f5fac23f11fb1f2c0b1adbaf545b164644c461d3` found exactly
two changed inputs: the EAS metadata above and the new
`scripts/androidDemoConfig.js` (SHA-1 `3a23738e2edd4fe1e658b9585e74418d87216620`).
The helper returns null when the isolated demo flag is absent and rejects it in
production or on iOS. Every other fingerprint source, including the generated
Expo configuration, iOS native module and dependencies, is identical.

The optional-delta receipt now accepts exactly this reviewed hash and retains
all six fallback-source hashes. The installed build/fingerprint, source archive
verification and unknown-fingerprint rejection stay intact. No runtime or native
dependency was changed to make this comparison pass.

The release client checks passed (137 related test files). Native configuration
checks passed, while Expo Doctor reported 19 newly recommended patch versions.
The package manifest and lockfile are identical to deployed source `5edb740`;
the fingerprint comparison also proves unchanged native dependencies. These
upgrade recommendations remain unresolved and are not a passing build-readiness
receipt. This OTA retains the installed dependency set; no package-check override
or dependency upgrade was introduced.

## Android OTA compatibility

Android releases use the same guarded commands with explicit `--platform android`;
the default remains iOS. The Android baseline is Google Play internal-test build
`b0648036-61d6-4af6-b659-442a22b603dc`, version `1.1.0 (10)`, runtime `1.3.0`,
channel `production`, native fingerprint `ffa38603c423e70296ac74e695750ff8d59701db`.
EAS build metadata and its message bind the archived source to
`890d70110de37ad1814b79c7c1b2106e42b74a54`. Before the first Android OTA, the live
production inventory for Android runtime 1.3.0 was empty. Only an empty inventory
allows the guard to use this reviewed embedded source for ancestry; later releases
must contain the latest Android OTA source. iOS releases cannot take this fallback.

For source `dfb83069703ea3459b57c1dd4a1fc015df3097f3`, production-environment
fingerprinting produced `acae1d5dac2ec822e7b09bcb8ebdac44dfe66220`. Comparing both
explicit hashes through EAS found exactly three changed top-level inputs:
`modules/planli-transfers/android`, its addition to `expoAutolinkingConfig:android`,
and `expoConfig`, whose only change was the iOS-only marketing version `1.1.1`.
No other dependency, Android permission, native configuration or source changed.

The Android optional-module review binds the same foreground-fallback source
hashes as iOS. The real optional bridge and availability service are tested for
both platforms with the native module absent. Build 10 cannot enable native
background transfers; the foreground queues remain in use. This is a reviewed
optional delta, not an exact native match or proof of physical-device behavior.
Unknown fingerprints or changed fallback source still stop publication.

```powershell
npm run release:eas-candidate -- --platform android --apply --message '<summary>'
npm run release:eas-production -- --platform android --preview-group '<candidate-group>' --message '<summary>'
npm run release:eas-production -- --platform android --preview-group '<candidate-group>' --message '<summary>' --apply --confirm 'PUBLISH PRODUCTION <12-char-HEAD>'
```

Candidate export, immutable manifest download and production republish are scoped
to Android. No iOS update is republished. The first Android OTA has no previous
OTA group; an authorized rollback must target the embedded build for Android
runtime 1.3.0. Subsequent rollbacks use the preceding verified Android group.

## Findings from the repeated warnings

The reviewed events were OTA candidates for the same installed TestFlight
1.1.1 (30), not three newly compiled binaries. There are two evidenced causes:

- Navigation candidate `20c6c374-a1e8-4d2c-bd49-af8413844992` differed only in
  LF/CRLF bytes in `client/.gitignore`, `client/eas.json` and
  `client/GoogleService-Info.plist`. Git archive applies checkout newline settings;
  the installed build had been fingerprinted with Windows CRLF metadata.
  Correcting those archive-only bytes produced candidate
  `23109828-9705-4ba1-8790-ab883d31e2f5` with the installed build's fingerprint.
- Community candidate `65908052-d5e3-4dbf-be40-5cab871957fd` already had the
  correct metadata bytes. Its two fingerprint deltas were the new optional
  `modules/planli-transfers/ios` directory and that module's registration in
  `expoAutolinkingConfig:ios`, introduced by PR #371. This was a real native
  source addition. The module is absent from build 30 and its existing
  JavaScript fallback was verified before the OTA was promoted.

The preceding profile-transitions and badge/avatar release records show matching
fingerprints. The available evidence does not establish three identical failures.

The recurring process defects were duplicated, ignored release helpers, native
comparison only after candidate upload, and a release-readiness path list that
missed `client/modules/**`. It was also possible to compare the wrong inputs:
installed EAS CLI 22.6.0 handles mixed `--build-id` and `--update-id` flags as
one first operand, then compares it to the local project. Its own example is
misleading. Use two explicit fingerprint hashes for a server-to-server comparison.
The same CLI prints environment-loading notices before `fingerprint:generate
--json` output. The guard accepts a complete terminal JSON value after those
notices and rejects malformed results without printing environment output.

## Guarded workflow

`npm run preflight:eas-native` is a dry run: no Metro export, EAS update, native
build or store submission. It creates an immutable Git archive from the committed
source, restores only the three verified metadata files to their baseline CRLF
bytes, verifies every tracked archive blob allowing UTF-8 LF/CRLF normalization,
verifies EAS identity/build metadata,
and computes the iOS fingerprint with the production environment. Native metadata
content changes are rejected; normalization never conceals an actual edit.
The archive command explicitly pins Git's CRLF conversion for this installed
baseline, so machine-local `core.autocrlf`/`core.eol` settings cannot change it.
Archive depth and dependency-junction layout are stable, preserving fingerprint
paths. Untracked root configuration and local environment files never enter the
archive and are left untouched in the shared workspace.

For an authorized release from synchronized, tracked-clean `main`:

```powershell
npm run release:eas-candidate -- --apply --message '<release summary>'
npm run release:eas-production -- --preview-group '<candidate group>' --message '<release summary>'
# Only after production release authorization:
npm run release:eas-production -- --preview-group '<candidate group>' --message '<release summary>' --apply --confirm 'PUBLISH PRODUCTION <12-char-HEAD>'
```

The candidate command runs the native guard before calling `eas update`, then
compares EAS's published fingerprint to the preflight result. Production promotion
independently validates the candidate fingerprint and environment against the
installed baseline before republishing. Unknown hashes, missing metadata, wrong
builds, changed fallback source, or fingerprint changes during upload block the
workflow. Existing commit lineage, artifact and explicit-apply checks remain.
The preflight does not replace affected tests or physical iPhone verification.

Use these tracked commands instead of copying `.codex_tmp` release scripts or
running unguarded `eas update`. Do not set `EAS_SKIP_AUTO_FINGERPRINT`, introduce
fingerprint ignores, or change the runtime just to silence a mismatch. The legacy
standalone lineage-only `preflight:eas-production` remains strict about root
configuration; the two release commands use the verified archive workflow.

## Installed baseline and narrow optional-module review

The checked-in `config/eas-ios-native-baseline.json` binds project
`04731493-708f-4c82-b417-6ea815ea912e`, build
`b16eca67-6291-4520-82b6-10cb1af190f5`, build number 30, production channel,
runtime 1.3.0 and fingerprint `0b5dd5996352ba381e65fc1a036a28eae3000516`.

The reviewed optional delta is exactly
`f5fac23f11fb1f2c0b1adbaf545b164644c461d3`, assessed for source
`7c420beef68f9b61c41f9bf544e5891af99ba29e` during the Community release.
Server fingerprint comparison showed no other native changes. The actual module
bridge and availability service were executed with an absent native module:
the optional import returned null and background transfers were disabled. The
85-suite/731-test iOS readiness run covered legacy recommendation and avatar
queues. Physical iPhone native-transfer testing did not occur.

This review is bound to hashes of the optional bridge, availability service,
operation provider, Activity screen and both publishing queues. A change to any
of those files invalidates the review even if the native fingerprint stays the
same. Unknown fingerprint changes are never automatically added to the record.
The guard reports `reviewed-optional-module`, not `exact`, and does not activate
the unavailable native feature. The real fingerprint remains visible in EAS.

The fallback-source receipt was renewed for feedback-state commit
`45be111b01f3154af4b1bb859d4b8090f9474f69`. The reviewed changes only persist
the server attempt number, retain an acknowledged result, advance the local
feedback attempt on an explicit retry, and move dismissal behind the existing
store action. They do not call or enable `PlanLiTransfers`. A focused test loads
the real optional bridge with `requireOptionalNativeModule` returning `null` and
verifies that `backgroundTransfersAvailable()` remains false on iOS. The
recommendation and profile-photo suites continue to execute their foreground
fallbacks with background transfers unavailable. The production fingerprint
remains the already-reviewed optional delta
`f5fac23f11fb1f2c0b1adbaf545b164644c461d3`; no new native input is accepted by
this receipt.

The fallback-source receipt was renewed again for operation-recovery commit
`2781d29609b31878b6aab7974e87c1cae3326528`. Its `ActivityScreen` change only
uses the existing callable retry for a server operation whose local publishing
job is absent and maps retry failures to the existing safe error copy. Its
recommendation-publishing changes classify authentication recovery as manual and
keep accepted background edits retryable after the local job is gone. Neither
change imports, calls or enables `PlanLiTransfers`; entries backed by a local
publishing or profile-photo job keep their existing foreground paths. The real module bridge
was loaded with `requireOptionalNativeModule` returning `null` on both iOS and
Android, and `backgroundTransfersAvailable()` remained false. Activity history,
background service, recommendation publishing and profile-photo fallback suites
also passed. The focused receipt is five suites / 55 tests. Both production
fingerprints remain their already-reviewed optional deltas; no new native input
is accepted by this renewal.

When an authorized native build replaces build 30, inspect its source,
fingerprint, environment and installed/tested status, then update the baseline
and retire the old optional-module assessment in a reviewed change. Enabling
native background transfers still requires the separately authorized backend
rollout and native binary described in `operation-feedback.md`.

## Validation and limits

Focused tests cover LF/CRLF normalization, rejection of real metadata changes,
archive exclusion and tamper detection, local-module OTA triage, stale fallback
reviews, build identity/runtime checks, and rejection before candidate upload
and production promotion. No app dependency, runtime, native build or app UI
changes are required for this tooling fix.

Expo's [runtime compatibility documentation](https://docs.expo.dev/eas-update/runtime-versions/)
explains why equal runtime strings alone do not establish compatibility.
The [fingerprint documentation](https://docs.expo.dev/versions/latest/sdk/fingerprint/)
describes the native-input comparison. No automatic fingerprint runtime policy
was enabled for existing installations.
