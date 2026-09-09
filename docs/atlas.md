# Atlas and global discovery

The approved Atlas replaces the existing RegionSelector route. Reference: https://www.figma.com/design/tBs3j3G9lD12Q1qlpaLpSK?node-id=66-316 . Photos remain flat cards above a rotating Three.js sphere. The layout, photos and original region IDs follow the approved local v4 design.

## Runtime and assets

React Native renders the header, region preview, accessible choices and confirmation. Only the globe is hosted in react-native-webview 13.16.1 on iOS/Android; Web uses a sandboxed iframe with the same document. The document contains pinned Three.js 0.180.0, local geographic data, Assistant Bold and eight photo thumbnails. It makes no external requests. Messages are scoped per renderer instance and accept only readiness, error, interaction and a validated region selection. No credentials or user data enter the renderer.

Edit client/src/features/region/globe/runtime.js and run npm run build:atlas from client/. Commit the regenerated document.generated.js with its source. npm run verify:atlas checks reproducibility. esbuild is a development dependency. The approved WebP assets are in client/assets/atlas; sources.json retains photo provenance. Photo credits are intentionally absent from the UI. Natural Earth land geometry is retained in world-land.json. Font and Three.js license notices remain in their packages; the generated script preserves bundled license comments.

The document is reused across selections; small messages update its state. Drawing stops on blur/background, resources are disposed on unmount, and reduced-motion disables automatic spin and inertia. Failure or a 15-second active-screen initialization timeout shows a static approved globe and keeps all native region controls usable. Retry creates a fresh renderer.

## Selection contract

Previewing a region never persists it. Confirm commits either {mode: 'region', regionId} or {mode: 'global', regionId: null}. No previous selection is represented by mode: null, which remains distinct from global. Global is the initial preview, not an implicit saved preference. Existing choices are restored when opening the screen. Changing an existing choice supports cancel; required first selection accepts either region or global.

Local storage version 3 reads versions 1 and 2 from the existing key. Writes, including sync acknowledgements, are serialized. An acknowledgement clears only its matching pending choice. One account request is sent at a time so a late earlier request cannot overwrite a newer global choice. Guest choices persist locally and can sync after sign-in; transient sync failures remain pending for foreground retry.

The signed-in setDiscoveryRegion callable preserves legacy {regionId} requests and accepts {mode: 'global'}. It writes schemaVersion: 2, mode, regionId and server selectedAt under the existing private users/{uid}.discoveryRegion field. Global is not a geographic region ID and is never written onto countries, recommendations or routes. No content backfill, new index or Rules change is needed.

Global requests omit regionId across Home, recommendation feed/map, routes and destination search. Existing sort, visibility and blocked-user policies and bounded query limits still apply. Switching scope clears explicit destination filters; query text and other filters are retained. Home local search, selected-scope labels and publication banners recognize global.

## Validation and release boundary

Run the focused Atlas screen, bridge, storage/provider, PreferenceSetupGate, Home/search, recommendation/map, routes and publication-banner tests. Functions coverage includes discoveryRegionPreferenceService, discoveryRegionFiltering and discoveryRegions. Validate the actual screen in Web and package the native JavaScript/assets. Browser evidence does not establish iPhone WebView behavior.

Adding WebView requires a new native development binary before physical iPhone validation. This implementation does not authorize an EAS build, OTA, backend deployment or store submission. A future release must deploy the backward-compatible callable first, assign a runtime compatible with the new native module, and ship a matching binary. Do not publish this JavaScript as an OTA to the existing binary without WebView. Until the callable is deployed, global works locally and its account synchronization remains pending. Record live state in README only after a separately authorized release.

### Local validation receipt — 2026-09-09

- Focused client coverage passed for the Atlas screen, bridge/runtime input, selection storage/provider, preference gate, Home search, recommendations/map, destination options, route auth, publication banner and shared typography. The final review regressions add successful/failed account-switch synchronization, accessible click, keyboard, tap deduplication, drag and inactive-renderer cases.
- Three focused Functions files passed (13 tests): discoveryRegionPreferenceService, discoveryRegionFiltering and discoveryRegions.
- Actual React Native Web Atlas was exercised at 390×844 and 320×568 using an ignored local harness: all eight regions, globe drag and direct photo selection, global selection, confirmation and reload persistence. At 320px there was no horizontal overflow; the preview/region chips remain scrollable and the confirmation stays visible. Navigation/account calls are harnessed; this is not a signed-in production smoke test.
- iOS JavaScript/asset export succeeded (one Hermes bundle, local Atlas images and five Assistant font weights). The subsequent review fixes affect input events and the synchronization loop; focused regressions cover those changes. This is packaging evidence, not an EAS build or physical iPhone WebView validation.
- Atlas bundle reproducibility and Git whitespace checks passed. One static Codex review found two issues; both were fixed and covered by focused regressions.
- Initial environment gaps: Expo's dependency check listed 12 pre-existing patch-level mismatches. The authorized release subsequently aligned these patches and passed compatibility checks. npm audit reported 8 pre-existing moderate advisories, with no high or critical findings. Admin Web export cannot run locally without EXPO_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY, so no fresh admin export verification or admin runtime receipt is claimed.
- At the initial implementation checkpoint, work remained uncommitted on the pre-existing docs/hoi-an-release branch and no native build or release had been performed. The subsequent authorized local Android build and validation are recorded below. Unrelated recommendation-service edits and the untracked root app.json were preserved.

### Local Android development check — 2026-09-09

The user subsequently authorized local Android emulator testing and Metro. A new
x86_64 development APK with WebView 13.16.1 built successfully and was installed
on PlanLi_E2E_API34 / emulator-5580. README records the exact source, native-input
signature, APK hash, installation time and local-only environment.

The focused Maestro Atlas flow passed in 432.7 seconds: confirm Europe, reopen,
drag the actual WebView globe (which pauses automatic rotation), preview global,
cancel and recover Europe, then confirm global and restore it from Community.
A subsequent ADB hierarchy check and screenshot verified the synthetic
recommendation rendered in the actual global feed. The signed-in local callable
also returned and persisted global mode with schemaVersion 2. The existing demo
backend was attached, so these are observed results rather than a reusable
fresh-backend receipt. The initial Android System UI ANR required dismissal;
this does not establish unattended startup reliability or production performance.

Native verification also corrected the Atlas image fill style to the supported
React Native 0.86 StyleSheet.absoluteFill API. The removed absoluteFillObject
would otherwise leave native image layers without absolute positioning. Globe
photos, hero images, RTL labels and the fixed confirmation button were visually
inspected. Small screens scroll to reveal the full hero and region chips.

Metro was initially left running on port 8081 for manual inspection with local
synthetic services. The task's Metro and emulator were subsequently stopped for
the authorized release dependency alignment; demo backend services were preserved. No EAS build, OTA, production callable deployment, store submission,
commit or new branch was performed. Physical iPhone verification remains pending.

### Authorized native release readiness — 2026-09-09

The user authorized PR, merge, production backend deployment and Android/iPhone
distribution through the existing testing tracks. Marketing version stays 1.1.0;
runtime becomes 1.3.0 because WebView requires new native binaries. Final release
readiness passed for both platforms after twelve required Expo SDK 57 patch
alignments: 189 client suites / 1,118 tests, native package/configuration checks,
Expo Doctor and dependency compatibility. Thirteen focused backend tests, twelve
configuration security checks and Atlas reproducibility also passed. The final
static review found no actionable issues. The previous Android UI proof predates
these native dependency patches; physical iPhone and final store-artifact UI
validation remain unverified. Live provider state is recorded in README.

### Final dependency Android confirmation — 2026-09-09

After Expo patch alignment and the runtime 1.3.0 change, the authorized local
development APK was rebuilt and installed on the dedicated Android 14 AVD.
The Atlas Maestro scenario passed in 287.443 seconds (320.384 seconds including
CLI startup), completing at 15:25:41Z. It covered actual globe dragging, cancel,
global confirmation and restored global scope. Europe and global screenshots
were inspected. The app remains version 1.1.0 (local build 1), with its separate
.e2e package and OTA disabled. README records the exact native signature and APK
hash. Metro and the visible emulator remain running for manual inspection.
The existing demo backend was attached; this is not a fresh-backend reusable
receipt or proof of the signed store artifacts on a physical device.
