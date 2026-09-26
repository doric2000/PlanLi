# OTA native compatibility

## Repeatable release preparation

The default entry point is `npm run release:ota -- --platform all --message "..."`.
It prints a read-only plan; `--apply` performs an authorized release. Both mobile
platforms are selected unless one is explicitly requested. The application-input
digest skips an already-current platform, excluding tests, documentation and store
submission metadata. Store track, EAS channel and runtime are checked separately.

The runner unions the affected checks since each platform's actual deployed source,
prepares each dependency/metadata layout once, then verifies native compatibility.
It exports/publishes a candidate once per preparation group, inspects each immutable
bundle once and automatically republishes the exact group to production. Promotion
checks the public manifest's asset hash without downloading/exporting it again.
There is no merge-triggered release and no additional paid service.

Each apply prints an ignored release journal path. Resume with the same platform,
message, `--apply --resume <journal>` and unchanged source/environment. Pending
provider writes are recovered by their unique message before any retry; an unknown
result blocks a duplicate write. Journal inputs and production lineage are checked
again. Project/account production-variable metadata and relevant local environment
inputs are hashed without saving their values; changes invalidate resumable native
proofs and stop promotion. Stage durations, EAS read counts and export counts are retained beside it.
Historical single-platform wrappers remain available for investigation.
The exclusive OTA lock is never automatically deleted as stale: after a process
crash, verify its recorded PID has ended before removing that exact lock file.
Ordinary reported failures release the lock and retain the resumable journal.

Use the tracked wrappers and the repository-pinned EAS CLI. They set the public
production Firebase project before CLI startup and use `--environment production`
for fingerprinting/export. The parent environment matters in CLI 22.6 even when
the server environment is selected. Build 34 also requires physically local
dependencies and the baseline's exact LF/CRLF metadata bytes. Do not substitute a
junction, run a raw update from the checkout, or alter native inputs to hide a mismatch.

Prepare dependencies once per source commit. Candidate/dry-run results include
`sourceRecord`; pass it as `--source-record` during promotion or a retry. Reuse
rejects a foreign archive, changed HEAD, dirty tracked files, changed dependency
locks, changed installed-build baseline, wrong dependency layout, or altered
tracked archive content. Legacy records must be prepared again. Account, live
lineage, native fingerprint and immutable published-artifact checks still run;
the receipt saves the archive/copy, not those checks. Each CLI phase reports its
duration without printing environment values.

Run affected release readiness once against the deployed source and retain its
receipt. A Git push/merge or network retry does not require repeating successful
tests when their inputs are unchanged. Native preflight is included in candidate
apply, and production verification is included in promotion apply; separate dry
runs are useful for investigation but are not required stages of an authorized
release. Do not pre-export the iOS bundle before EAS packages the candidate.

On a compatibility failure, retain the archive/proof and compare the two explicit
fingerprint hashes once. Correct the evidenced input difference, rerun its focused
check, then retry with the verified source record if still valid. A real native
change requires its own reviewed build; unknown fingerprints remain blocked.

References: [Expo environment variables](https://docs.expo.dev/eas/environment-variables/)
and [update deployment](https://docs.expo.dev/eas-update/deployment/).

## Installed runtime 1.4.0 baselines (2026-09-26)

### Production submission metadata review

Source `58a259bf502b` changes only `submit` in `client/eas.json`; the build and
CLI configuration are identical to native source `1eae24ccf94072490d766202f2ad4f9478d2ce22`.
One prepared source/dependency tree generated both platform fingerprints under
the production environment. Provider build sources were downloaded once per
platform and compared with `@expo/fingerprint` from the installed lockfile.

| Platform | Installed build fingerprint | Reviewed submission fingerprint |
| --- | --- | --- |
| Android 12 | `64d77fc362e400f5754e05a9886052a2e88eeb45` | `a288be2d72f7efe12ed7ecd2e82040eb464ac3a0` |
| iOS 34 | `976661b4a04d2165ecd571430564b16b5f86fc13` | `766de533788a9b3cca6a0c632845ba913b5391c2` |

Every hashed source except `eas.json` matched, including generated Expo config,
autolinking, native modules and dependencies. Its CRLF SHA-1 changed from
`a2f077ce45880541cc6d5d16440dc18c54977b57` to
`413a9149c95916c51f6fd0146417137c1980345b`. Provider sources also contained
unhashed directory entries (`android`, `patches` on Android; `patches` on iOS).
Expo's installed `hash/Hash.js` excludes sources with a null/missing hash from the
aggregate. Replacing only the `eas.json` source hash in each new fingerprint
reconstructed its installed build hash exactly. This proves those empty entries
do not account for any native change.

The baseline review binds each exact fingerprint pair and the normalized SHA-256
of the submission config. Unknown fingerprints or changed config remain blocked.
Generated Gradle/CMake directories are excluded from dependency copying; all
hashed dependencies still matched the installed binaries in this comparison.
The review required two fingerprint generations and one source comparison per
platform, no native build, bundle export or upload. Ignored evidence is saved as
`submission-{android,ios}-{fingerprint,build-source,review}.json` in validation logs.

### iOS build 34

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

That archive then matched build 34 exactly. The first uploaded candidate
`e48a6ecc-0f25-44d5-996c-794787b772c8` was withheld: CLI 22.6 passed `env: undefined`
to its update fingerprint calculation. The only hashed difference was the Expo
configuration losing the production Associated Domains/intent filters because
`EXPO_PUBLIC_FIREBASE_PROJECT_ID` was absent in the parent environment. The
guarded runner now pins that public production identity before CLI startup;
server production variables still supply the exported bundle. No SDK, native
configuration or fingerprint allowlist was changed.

Reusing the same blob-verified archive through the tracked candidate/release
functions, with every account, lineage, native and artifact check enabled,
produced candidate `2a90c1c7-69f4-4677-b587-80bd85732579`. Its fingerprint matches
the installed build exactly both before and after upload. Production group
`f54aca26-f3fa-4015-afc6-b733f179cff3` has the identical launch bundle and was
independently served by the public production endpoint on September 26.

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

## Historical Android build 10 compatibility

This review is retained as history, not the current release target. The current
Android target is build 12 / runtime 1.4.0, reviewed above, and `release:ota`
defaults to both platforms. Build 10 users need the store update; the new fixes
are not backported to runtime 1.3.0. The former Android baseline was Play build
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
npm run release:eas-production -- --platform android --source-record '<returned sourceRecord>' --preview-group '<candidate-group>' --message '<summary>' --apply --confirm 'PUBLISH PRODUCTION <12-char-HEAD>'
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
or LF bytes, verifies every tracked archive blob allowing UTF-8 LF/CRLF normalization,
verifies EAS identity/build metadata,
and computes the iOS fingerprint with the production environment. Native metadata
content changes are rejected; normalization never conceals an actual edit.
The archive command explicitly pins Git's CRLF conversion for this installed
baseline, so machine-local `core.autocrlf`/`core.eol` settings cannot change it.
Archive depth and the baseline-specific dependency layout are stable, preserving
fingerprint paths. Untracked root configuration and local environment files never enter the
archive and are left untouched in the shared workspace.

For an authorized release from synchronized, tracked-clean `main`:

```powershell
npm run release:eas-candidate -- --apply --message '<release summary>'
# Only after production release authorization:
npm run release:eas-production -- --source-record '<returned sourceRecord>' --preview-group '<candidate group>' --message '<release summary>' --apply --confirm 'PUBLISH PRODUCTION <12-char-HEAD>'
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
