# iOS OTA native compatibility

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
