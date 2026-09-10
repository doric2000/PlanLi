# Home, Profile and drawer design refresh

Implemented on 2026-09-10 and merged through PR [#361](https://github.com/doric2000/PlanLi/pull/361), source `b6c46f1caead3c3a47a6f406f9c09a2c0b2f47f3`.
The iOS OTA was published to the user-selected production channel for TestFlight.
App versions, native dependencies, schema and backend remain unchanged; application on the physical iPhone is unverified.
No design switch or restore control exists in the app. Restore requests are made to Codex in chat.

## Source checkpoint

- Baseline commit: `0c6da2e431d84986c76c4c2c085d73912202005e`.
- Archive: `.codex_tmp/design-backups/home-profile-20260910/before.zip`.
- Manifest: `.codex_tmp/design-backups/home-profile-20260910/manifest.json`.
- SHA-256: `2ad71cf951cc399fcebebb05b54d251d052190a69d06e54d25ea72ff853fea86`.
- The verified archive contains the baseline client source, tests, dependency manifests and client guide. It excludes environment files and the unrelated untracked root app.json.
- The archive and preview are ignored local working artifacts. The baseline commit provides another source for comparison; this note makes the checkpoint discoverable in later Codex sessions.

## Restore only what the user requests

Examples: “תחזיר את הבית הקודם”, “תחזיר רק את התפריט”, or “תחזיר הכול”.
Before restoration, inspect the current diff and subsequent commits. Preserve all unrelated or later changes; do not reset, stash or replace the whole client tree. Compare the selected files against the checkpoint and reverse only this presentation change. Rerun affected checks and describe the result. Do not add a UI toggle.

| Surface | Existing files affected | Added presentation files |
| --- | --- | --- |
| Home | HomePlanningHubScreen, HomeDashboard | HomeRefreshDashboard |
| Profile | ProfileView, ProfileHeader, ProfileStatsCard, ProfileContentGrid | styles/profileRefresh.js |
| Drawer | RightDrawerNavigator, ProfileMenuList | drawer styles within styles/designRefresh.js |
| Shared presentation | PageHeader, SearchFilterRow | styles/designRefresh.js |

All feature files are under `client/src/features`, navigation under `client/src/navigation`, and shared components under `client/src/components`.
For a partial rollback, retain shared style exports still used by other refreshed surfaces. The new optional PageHeader and SearchFilterRow props preserve their prior defaults. Restore or adapt the corresponding presentation tests along with each selected surface.

## Implementation

Figma file `tBs3j3G9lD12Q1qlpaLpSK`: Home A `48:2`, full Profile `70:781`, right drawer `52:181`.

- Home: greeting and profile shortcut, white search field, three quick actions, selected-region photo with global-mode support, up to two actual saved destinations, existing draft continuation and protected route creation, recommendation and route rails.
- Profile: existing three-photo collage, full avatar circle with a separate camera target, wrapping name and status labels, preferences, counters and virtualized content tabs. Owner menu, public back/report, edit, refresh, empty and cached error behavior retained.
- Drawer: consistent 44px icon slots, 64px rows with a 12px gap, separate flexible text, notification badge and existing role-dependent actions.
- Scoped sand/navy/orange colors and Assistant typography; primary PageHeader geometry is unchanged. Feed-size images are used in Home rails, with existing thumbnail fallback.
- Existing Atlas, six-tab navigation and route builder remain connected. The future private trip planner and future navigation changes are outside this phase.

## Local review and validation

Browser preview: `http://127.0.0.1:8772/`; implementation harness under `.codex_tmp/validation/home-profile-preview/`.
It renders the actual Home/Profile/drawer components with synthetic data, local photos, a Noya sample portrait, navigation spies and native/service adapters. It is a visual development preview, not the real signed-in app.

Exercised in the browser: Home layout and search, global discovery action, Home/Profile navigation, drawer open/close, Profile route tab and route-tile navigation, Profile bio-editor open/cancel, 320px and 390px layouts, long names, avatar/camera separation and empty guest content. The browser check found and fixed intrinsic-size overflow in the new Home images.
Native Android and physical iPhone rendering, real network/auth flows and photo upload are unverified for this refresh. The iOS OTA was subsequently published as recorded below; physical installation/application is still unverified.

`npm run validate:changed` passed 16 affected suites / 120 tests, including Home search/cache/error handling, guarded route creation, Profile owner/public navigation and header/filter consumers. After the final Profile toolbar contrast/optional-action adjustment, both direct Profile suites passed again (18 tests). Logs: `.codex_tmp/validation/home-profile-refresh-validation-final.log` and `.codex_tmp/validation/client-related-tests-16.log`.

The checkpoint SHA-256, ZIP integrity and three primary screen files were verified (683 archive entries). The final diff was inspected locally. One automated `codex review` attempt could not start because the installed CLI does not support its configured model; this is not a passing automated review. No CLI update or model configuration change was made.

## iPhone OTA release

- Published: `2026-09-10T08:18:00.331Z`; verified delivery: `2026-09-10T08:18:42.568Z`.
- Production group: [514b2a9b](https://expo.dev/accounts/doric2000/projects/client/updates/514b2a9b-6ff8-49fb-bb5a-8acb9926aa1c); update `01a08a65-280b-7cd5-8b61-619d14adf0f5`.
- Candidate group: `fe0aa846-07d2-47a5-a7b1-94db167ff024`; exported once, then promoted unchanged.
- iOS only; channel/environment production; runtime 1.3.0; compatible with TestFlight 1.1.1 (30), build `b16eca67-6291-4520-82b6-10cb1af190f5`. Native fingerprint: `0b5dd5996352ba381e65fc1a036a28eae3000516`.
- Launch bundle: 10,611,820 bytes; SHA-256 `99fe37cdb38afea98c450c685663f39f889af760c9b95d11d5c866f3272166d7`; local and downloaded bytes match. The production manifest matches this update, and Home/Profile plus existing route-editor markers are present.
- Release readiness: `npm run validate:release -- --kind ota --platform ios --base 872642e261eb52eb5b3fb248caa04bd4e0925481` passed 16 suites / 120 tests. All applicable PR checks passed.
- Public App Store 1.1.0 (28), runtime 1.2.0, and Android runtime 1.3.0 delivery remained unchanged. No native build, Apple submission or backend deployment was performed.
- Whole-OTA rollback baseline: `619dddfc-7bd4-4efe-a432-98d75e16f61d`. For a partial design rollback, use the source checkpoint instructions above and publish a new verified iOS OTA only when authorized.
- Physical iPhone download/application and authenticated native flows are pending the user's test. Open PlanLi from TestFlight online, allow the update to download, then close and reopen if needed.

Local proofs: `.codex_tmp/validation/home-refresh-{source,candidate,production}-proof.json`, `home-refresh-delivery-boundaries.json` and `home-refresh-release-readiness.log`. These ignored files contain verification evidence, not production credentials.
