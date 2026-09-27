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

Final release review identified and corrected five edge cases: iOS guest actions
wait for the full-map dismissal before opening the shared authentication gate;
blocked map authors are resolved through bounded public reads; deletion invalidates
discovery/profile caches; searching the visible native map no longer refits its
camera; Web maps fit both latitude and longitude bounds. Focused regressions cover
these paths, Web map loading/cleanup and the optional action presentation guards.

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

Android emulator execution remains waived. Physical acceptance after the authorized
OTA should cover map tiles and pins, fast city changes, modal back/Android hardware back,
keyboard/search, full-map share/add-to-trip/comment dialogs, font scaling, photo credits
and safe areas. Live city and map queries still require production read verification.

## Rollback

The clean pre-implementation base is
`3076b0f36ab9588399442bb275a569bbabad7cfb`.
The local `implementation-checkpoint.json` records exact changed/new paths. On a user
rollback request, inspect later work first, restore only this task's tracked changes
from that base and remove only its listed new files if they contain no later work.
Do not reset, stash or restore unrelated files. No rollback control exists in the app UI.

The OTA is authorized for both platforms; the repository release runner records its
actual groups and prior production rollback groups in README after publication.


## Map presentation follow-up (2026-09-27, published)

The city hero now uses an unpadded full-bleed background layer with centered cover
cropping; safe-area and content padding belong only to its foreground. Use
StyleSheet.absoluteFill (the installed React Native no longer exposes
absoluteFillObject).

City and community recommendation pins share category-colored 44px circles,
with orange/navy selected state. Numbered itinerary stops are unchanged. The Web
city canvas shares the same appearance tokens; community Web remains its existing
external-map list fallback. The city category strip reads the complete recommendation
catalog (ten categories plus All), begins at the RTL start, preserves query/other
filters and clears subcategories when switching categories.

FullScreenModal owns a local SafeAreaProvider and all-edge SafeAreaView for city,
private/shared trip maps, exact-location previews and media gallery. Consumers
must not add parent-screen safe-area padding again. Headers remain in normal flow;
city selected cards scroll independently with a bounded height. Transparent sheets
are outside this change. Close/dismiss callbacks remain separate for iOS auth flow.

Validation: 287 affected tests passed on the first changed-validation pass; its
one failing hero geometry test caught use of the removed native style alias.
That alias was corrected and the hero/landing tests rerun. FullScreenModal has a
contract test; existing consumer tests cover Android close and iOS dismiss sequencing.
A local browser preview with mocked data exercised widths 320/390, full-bleed hero,
RTL category scrolling, final-category selection, map expansion, pin selection and
return. Browser safe-area values are fixtures, not native device evidence. Physical
iPhone notch, rotation, font scaling and keyboard acceptance remain unverified;
Android emulator remains waived. PR #450 merged; production OTA `545d5795-a7e6-43ab-98ab-4534b9dd547f`
was published for both platforms. Final release readiness passed all 288 tests
in 28 suites. No native build; see README for delivery evidence and rollback.

Rollback checkpoint: Desktop/PlanLi-Figma-City/map-presentation-checkpoint.json;
source 2aba1d9e57831345222e46e49a0e75d661e29845, production group
7811a506-b37d-422a-b25c-04fddde45686. Preserve later/unrelated work on rollback.
