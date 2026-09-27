# City guide implementation — 2026-09-27

Status: implementation on `feat/city-guide-inline-map`, authorized for commit,
PR, merge and both-platform production OTA on 2026-09-27. Actual publication IDs
and resulting deployment state are recorded in README after release. No native
build or backend deployment is required by this change.

## Approved design

- Figma file `tBs3j3G9lD12Q1qlpaLpSK`, page `248:221`, viewport `250:1055`, full layout `254:1767`.
- [City prototype](https://www.figma.com/proto/tBs3j3G9lD12Q1qlpaLpSK?node-id=250-1055&page-id=248%3A221&scaling=contain&content-scaling=fixed).
- Removed 19 duplicate heading expansion controls across this page's variants.
  Each inline map keeps its own single 44×44 expansion control. The full map uses Back.
- Original Figma city design remains on page `182:2`.

## Behavior

- Hero uses the destination's existing large media and attribution policy.
  Quick weather/currency facts and language, calling code and airport information
  are expanded in the city page. Missing values are omitted instead of becoming zero.
- City overview, recommendation feed, route feed and map each have independent loading
  and failure states. Existing overview responses that omit coordinates can be enriched
  from the existing public destination document without delaying the useful information.
- Inline map shows real recommendation markers; one button opens the interactive map.
  Selection, categories, search, retry and search-in-visible-area stay in the city context.
  Returning inline keeps the last searched map region. No user-location permission is requested.
- Map responses are compact previews. Selecting a marker resolves the canonical
  recommendation before enabling share, favorite, likes/comments or add-to-trip.
  Failed, inactive or blocked content cannot enable those actions.
- Recommendations/routes retain independent search and filter drafts. Existing taxonomy,
  kosher/accessibility filters, card actions, detail routes and public links are reused.
  The city filter omits destination selection; other filter callers retain their defaults.
- Feed rendering starts with six results, with a local reveal-more action within the
  existing server response limit of 30. Map results keep the existing service limits.
- Native camera initialization waits for positive host and matching native map layout.
  Uses existing Google Maps on mobile and the existing MapLibre runtime on Web.
  No dependencies, app versions, runtime configuration, backend contracts or rules changed.

## Validation

Focused Jest coverage and relevant consumers passed:

- `LandingPageScreen`, `destinationStyles`, `destinationViewModel`.
- `useDestinationData`: independent overview/coordinate loading, stale city responses,
  fallback missing-value handling, retry and invalid route parameters.
- `useCityDiscovery`: fixed city scope, debounce, account/city request races, blocked/hidden
  items, retry, disabled and cancelled requests.
- `CityMapCanvas`, `cityMap`, `CityMapSection`: finite geometry, native readiness ordering,
  one expand control, selection/return, query versus tile errors, canonical selection
  gating and moved-map search persistence.
- `ProgressiveDiscoveryFilter`, `RecommendationsFilterModal`, `ActionBarSharing`,
  recommendation/route photo navigation.
- The validation planner's additional consumers: app/community navigation, map mode,
  main tabs, preference bootstrap, drawer presentation and route authentication.

Local React Native Web preview exercised the actual city components, navigation,
shared cards, filters and action rows at widths 390 and 320, including a long city name,
map selection/expansion/return, route-specific filtering, empty results and map-query
failure/retry. Auth, callable data and writes were mocked; maps used OSM fixture tiles.
This is not proof of live Firebase data, production MapTiler configuration, native
Google Maps rendering, native share sheets or physical iPhone/Android behavior.
Existing shared Web warnings about nested card buttons/direction styles and duplicate
shared style keys remain outside this change.

Logs and the preview harness are ignored under `.codex_tmp/validation/city-guide-*`.
Screenshots and the rollback manifest are under the local Desktop folder
`PlanLi-Figma-City`. The desktop screenshots contain synthetic example facts.

Android emulator execution remains waived. Before release, physical device checks
should cover map tiles and pins, fast city changes, modal back/Android hardware back,
keyboard/search, full-map share/add-to-trip/comment dialogs, font scaling, photo credits
and safe areas. Live city and map queries still require production read verification.

## Rollback

The clean pre-implementation base is
`3076b0f36ab9588399442bb275a569bbabad7cfb`.
The local `implementation-checkpoint.json` records exact changed/new paths. On a user
rollback request, inspect later work first, restore only this task's tracked changes
from that base and remove only its listed new files if they contain no later work.
Do not reset, stash or restore unrelated files. No rollback control exists in the app UI.

An eventual OTA is a separately authorized workflow; use the repository release runner
and update README release records only once actual release state changes.
