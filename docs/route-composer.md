# One-page route composer

The route editor uses the existing Assistant typography, PlanLi colors, shared
`FormInput`, `RtlChoiceGroup`, `SingleDestinationPicker` and embedded
`TravelMediaComposer`. A new route starts with one day. Selecting an area starts
server autosave; there is no separate opening action. One day and one stop are
expanded at a time, with a sticky day rail and a keyboard-aware publication footer.

## Alignment with recommendations

| Field or behavior | Shared convention |
| --- | --- |
| Typography, colors and text direction | Existing style tokens and RTL inputs |
| City / area | Shared bilingual, global creation search; discovery filters still respect their selected region |
| Name and description | Required route name and description; optional stop description |
| Price | `POST_BUDGETS`, the same required label/helper, optional exact-price note |
| Optional information | Shared “פרטים נוספים, רק אם רלוונטי” wording |
| Photos | Same inline picker, pager, crop and reorder controls; optional, maximum three per stop and 40 per route |
| Route-specific information | Transportation, difficulty, pace and seasons retain the existing taxonomy values |

Recommendation contact/category fields and route day/timing fields retain their
different meanings. Existing category/facet values on edited routes are preserved.

## Draft and publication contract

- `day.title` is optional (maximum 120 characters). Day identity is independent
  of position. Missing titles remain compatible with existing routes.
- Private `stop.editorState` retains unfinished location queries and raw timing
  input. Publication still rejects incomplete locations, invalid times, missing
  required fields, empty days and routes with fewer than two useful stops.
- Private `mediaOrder` retains interleaved local/remote photos. Publication assigns
  uploaded assets by their selected slot, independent of upload completion order.
- Moving a stop rebinds its durable media manifest. Previous manifest locations
  recover an interrupted move. Duplicate legacy stop IDs receive a new ID only
  when necessary in the destination day.
- `savedLocationDayId` / `savedLocationStopId` locate the original stop within the
  same owned route's active revision. The server still verifies the saved place;
  these hints do not authorize arbitrary locations or other routes.
- Existing optimistic versions, save-request deduplication, draft recovery and
  background publication remain in use. Failed saves keep the local form intact.

Backend support must be deployed before distributing a client using these fields.
The subsequent iPhone distribution request authorizes that release; preparation
and remaining gates are recorded below. No migration is required.

## Focused validation

Client coverage: route composer/validation, inline stop form, durable route media,
media publication, itinerary, shared destination picker, recommendations and tour
consumers. Backend coverage: route draft and publication services, including
stable IDs, title bounds, moved source references and private location bindings.

The Android scenario is `npm run test:android -- --flows=route`. It creates a
three-day route with a photo, switches days, checks a focused publication error,
adds a day title and publishes through local Firebase callables. It uses only
`demo-planli-e2e` and the existing local debug app.

The user authorized restarting local services, and the debug APK was rebuilt
and installed. Follow-up runs reused that binary. The constrained AVD now uses
540x960 at 240dpi (360dp wide), two cores and 30 Hz software rendering. Its
incompatible Pixel 6 camera-cutout overlays are disabled. A focused Maestro
check passed developer-menu dismissal and app entry. Staged startup reached
the route editor and exercised title, area search/selection, description,
keyboard dismissal and price selection. It then failed on a transport selector
that used a value instead of the shared choice component's numeric index;
transport, difficulty, pace and season selectors were corrected. The corrected
YAML has syntax validation only. The memory guard also stopped backend services
after two samples below 0.9 GiB. No passing route Android receipt is claimed.
Native photos/crop, three-day publication, enlarged text and the remaining
device acceptance states still need verification. All owned helpers were stopped.

The CLI review completed using a supported per-run review model. Its media-count
finding was fixed: prepared uploads no longer retain a stale local-media count
when saved for background publication. A restored recommendation-backed stop
also retains its original recommendation ID. The four focused follow-up suites
passed 96 tests, including the 40-photo boundary and restored-stop regression.
Backend/draft/media and earlier shared-picker checks remain recorded separately;
they do not establish Android UI acceptance.

The subsequent review fixes pass 50 focused client tests and 124 backend tests:
the route now passes `visible` to the real embedded photo composer, and trusted
existing media missing URLs can be retained during an authorized administrator
edit. Existing-media bindings and canonical storage metadata are still checked;
new or substituted foreign media is rejected. The client regression renders the
actual photo composer inside the stop editor and selects a photo. Six focused
runner/Metro tests and PowerShell/YAML syntax checks also passed.

## iPhone release preparation (2026-09-09)

Candidate: `feat/route-composer`, based on `b3562a1`, with the reviewed
composer, review fixes and local test tooling. Preserve the unrelated untracked
root `app.json`; it is excluded from release input. The release helper now pins
iOS version 1.1.1 and runtime 1.3.0, including rejection of the previous runtime.
The missed Metro integration expectation now matches the one-worker local profile.

Read-only EAS checks confirmed account `doric2000`, project
`04731493-708f-4c82-b417-6ea815ea912e`, production channel, and completed iOS
build `b16eca67-6291-4520-82b6-10cb1af190f5` / build 30 / runtime 1.3.0.
Native configuration and locked dependencies are unchanged from its verified
source `263fccd283fa86ef9b52077232a8dbdfc02ab6cb`. The readable production
Firebase, App Check and Sentry environment check passed. No runtime 1.3.0
production OTA group existed at this readback; the embedded build is the baseline.

`npm run validate:release -- --kind ota --platform ios --base
263fccd283fa86ef9b52077232a8dbdfc02ab6cb` passed: 568 client tests in 80 suites,
244 backend tests and three Metro configuration tests. Twenty focused release
guard tests passed separately. Tests ran with Jest in-band and a 2 GiB Node heap
limit, without Android/Firebase emulators. Device photo/crop and full publication
acceptance remain pending; these checks do not claim iPhone runtime evidence.

Git commit/push/PR/merge and the ordered distribution are now authorized.
Release from the verified merged source.
Deploy the affected Functions first: `saveRouteDraft`, `publishRouteDraft`,
`saveRoute`, `saveRecommendation`, `publishRecommendationDraft`, `saveTrip` and
`updateProfile`. The last four retain the shared existing-media fix consistently
across its callers. Verify deployed inventory and errors, then package one iOS
candidate using the production environment, verify its immutable bundle, and
promote the identical artifact to the production channel for runtime 1.3.0.
Retain the embedded build as rollback baseline. Record the resulting source SHA,
Functions revisions, update group and physical-device status in README.

PR [#357](https://github.com/doric2000/PlanLi/pull/357) merged as
`3b4473c60e9bce43660513426c4a0c4ec4ce4c30` after all applicable CI checks passed.
The archived source matches all 1,073 tracked Git blobs. Seven affected Functions
were deployed and independently verified at `2026-09-09T20:58:30.123Z`:

| Function | Active revision |
| --- | --- |
| saveRouteDraft | saveroutedraft-00012-sos |
| publishRouteDraft | publishroutedraft-00023-meb |
| saveRoute | saveroute-00057-nap |
| saveRecommendation | saverecommendation-00060-buk |
| publishRecommendationDraft | publishrecommendationdraft-00026-yux |
| saveTrip | savetrip-00031-xil |
| updateProfile | updateprofile-00035-bug |

All are ACTIVE, Node.js 22 v2, minInstances 0 and serving the latest revision.
Secret bindings and media bucket matched the pre-deploy inventory. Three
unauthenticated route probes returned HTTP 401, and the error scan found no
Error-severity entries since the pre-deploy snapshot.

The iOS candidate group `cf42a744-579c-4217-971b-a36c2dbd52f3` was published with
environment `production`, then promoted without rebuilding to production group
`8112578f-96f8-4eb9-861c-00e3ccb5a42e`, update
`01a087ff-11cd-722a-97ea-6e2263711124`. At `2026-09-09T21:08:00.518Z`, the
immutable manifest, authenticated bundle download and public production-channel
manifest verified the exact iOS update, runtime 1.3.0 and source commit above.
Both bundles matched the 10,578,996-byte local artifact, SHA-256
`65bb3605ac73854de3288fe45fae2a2f6cd7f9139a90852dd7e0d0773e9638da`.
The environment was independently read from full channel metadata because
EAS CLI 22.6 `update:view` omits that field. Native fingerprint
`0b5dd5996352ba381e65fc1a036a28eae3000516` matches the existing iOS build 30.

No native build or Apple submission was performed. The iPhone must have
TestFlight 1.1.1 (30); opening online downloads the update for a subsequent
restart. Physical-device installation and route photo/crop/publication acceptance
remain pending. Android and runtime 1.2.0 delivery were not changed.

## Route editor usability release (2026-09-10)

PR [#359](https://github.com/doric2000/PlanLi/pull/359) merged as
`872642e261eb52eb5b3fb248caa04bd4e0925481` after all applicable CI checks passed.
The update adds explicit completion and collapse actions, one main editing scroll
surface, RTL day tabs, a separate bounded stop sorter and destination-scoped,
searchable PlanLi recommendation selection. Draft text and media remain mounted
when switching modes.

Release readiness against the previous deployed source `3b4473c` passed:
604 client tests in 87 affected suites and 14 Firestore index tests. Final review
found no actionable issues. A 360x740 React Native Web harness exercised scrolling,
RTL, collapse/focus, sorting arrows, recommendation search, selection and cancel.
The CLI review attempt was unavailable because its installed version does not
support the selected model; a direct review was completed instead.

Six new recommendation indexes were deployed with the exact
`--only firestore:indexes` target to `planli-f0b12` / `(default)` / `eur3`.
At `2026-09-10T05:54:51.388Z`, independent inventory verification found
all six READY and all 128 previous indexes preserved (134 total).

The iOS OTA is available on channel/environment `production`, runtime `1.3.0`:
group `619dddfc-7bd4-4efe-a432-98d75e16f61d`, update
`01a089e5-b9ed-7ee6-891f-8d6c19ea2399`, published `2026-09-10T05:58:49.069Z`.
Candidate group `d0cfaff3-d836-4425-8b35-a007e4f49064` used the production
environment on staging. The identical artifact was promoted without rebuilding.
At `2026-09-10T05:59:18.016Z`, the immutable manifest, authenticated
launch bundle and public production-channel manifest matched the source and update.
Bundle: 10,597,800 bytes; SHA-256
`35cd5abed54ba7554a78f94badae914b14f86fc9e69affabd62c603708667b04`.

The release archive matched all 1,078 tracked Git blobs and excluded the unrelated
untracked root `app.json`. Only verified source-commit metadata and a one-worker
export limit were supplied to EAS archive mode; account, project, production
environment, lineage, native compatibility and artifact checks were retained.
Node used a 2 GiB heap limit without an emulator or parallel heavy tests.
Native fingerprint `0b5dd5996352ba381e65fc1a036a28eae3000516` matches existing
iOS TestFlight 1.1.1 (30), EAS build `b16eca67-6291-4520-82b6-10cb1af190f5`.

Physical iPhone download/application, touch dragging, keyboard, enlarged text,
gallery/crops and end-to-end route publication remain unverified. No new native
build, Apple submission/review, Android OTA, Functions, Rules, Hosting, IAM or data
mutation accompanied this release. The previous runtime-1.3.0 production group
`8112578f-96f8-4eb9-861c-00e3ccb5a42e` is the rollback baseline.
Open TestFlight 1.1.1 (30) online, then force-close and reopen up to twice to
download and apply the update. See [current environment status](../README.md#current-environment-status).

Verified new indexes:

| Index ID | Fields | State |
| --- | --- | --- |
| `CICAgLix04EK` | `status`, `publicationGate.destinationApprovalVerified`, `facets.interests` | READY |
| `CICAgNi6rIIK` | `status`, `publicationGate.destinationApprovalVerified`, `search.prefixes` | READY |
| `CICAgPiQxIgK` | `destination.countryId`, `destination.cityId`, `status`, `publicationGate.destinationApprovalVerified`, `stats.likeCount` | READY |
| `CICAgNiE2YwK` | `destination.countryId`, `destination.cityId`, `status`, `publicationGate.destinationApprovalVerified`, `createdAt` | READY |
| `CICAgPjfxJoK` | `destination.countryId`, `destination.cityId`, `status`, `publicationGate.destinationApprovalVerified`, `facets.interests` | READY |
| `CICAgLioy50K` | `destination.countryId`, `destination.cityId`, `status`, `publicationGate.destinationApprovalVerified`, `search.prefixes` | READY |
