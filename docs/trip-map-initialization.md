# Trip map initialization investigation

Status on 2026-09-20: the JavaScript correction was merged in
[PR #420](https://github.com/doric2000/PlanLi/pull/420), source
`5edb740372b6e9c031aec39f22510bc9451e1b6c`, and published to iOS production group
`24b4da73-475d-40cb-856b-e361b90bcb13` at `2026-09-20T12:16:54.855Z`.
Public-channel delivery was independently verified. Subsequent Sentry events
confirmed that the iPhone applied this OTA, but the map still failed. Keep the
incident open until visible streets and markers are verified after the layout fix.

## Confirmed layout failure

After repairing Sentry access, issue
[PLANLI-MOBILE-1C](https://planli-t2.sentry.io/issues/148207399/) showed three
timeouts at 12:32:38, 12:32:50 and 12:33:04 UTC on 2026-09-20: inline, full screen,
and full-screen retry. Each mount identifies update
`01a0bebf-7a47-7a0c-81bb-8bb3a0336461`, runtime `1.3.0`, binary `1.1.2 (32)`.
All stopped at `layout_pending`; no positive host-layout event was recorded.

The trip styles still spread `StyleSheet.absoluteFillObject`, which React Native
[removed in 0.85](https://reactnative.dev/blog/2026/04/07/react-native-0.85#stylesheetabsolutefillobject-removed).
In the installed 0.86.3 runtime the spread silently yields `{}`. The empty host
therefore has no height, so its measured-layout gate never mounts the native map.
A focused regression using the actual installed StyleSheet failed with precisely
that empty object. Earlier tests injected positive layout events without checking
the host's real style, so they did not cover this failure.

The correction uses `StyleSheet.absoluteFill` for the trip host and loading/Web
overlays. The fullscreen editor header now occupies normal layout above the map;
its failure banner is positioned inside the remaining map area, rather than at
a fixed screen offset that overlaps tall iPhone safe areas. Existing camera,
readiness, retry and native provider behavior remains in place. No new native
build is needed for these JavaScript/style changes.

Validation of the correction: 41 tests passed across the real trip-map component,
card, editor and Web preview suites. Host geometry is asserted before any manual
layout event. Fullscreen failure/retry/close paths cover zero and 62-point top
safe areas. Installed react-native-web 0.21.0 also resolves the replacement fill
style to the same five positioning properties. These checks do not establish
native tile rendering on the physical iPhone.

## Evidence and scope

[Sentry PLANLI-MOBILE-1A](https://planli-t2.sentry.io/issues/148116570/)
recorded `google_ios_3_points_tiles_pending` at `2026-09-20T09:03:34.223Z`
on TestFlight 1.1.2 (32). Native readiness was observed; tile completion was not.
The tester reported a blank map after timeout, including a one-stop day, while
Community rendered streets in the same installation. These older events predate
the confirmed layout failure above and do not prove a separate native defect.

The previous trip map used an initial region before its native frame was known,
and requested camera fitting from tile-loaded callbacks. Repeated callbacks could
repeat fitting. Inline and modal maps also shared loading state; closing the
modal falsely marked the inline map ready. These are corrected independently of
whether they explain every device failure.

## Implemented behavior

- The non-collapsible host waits for positive dimensions before mounting Google
  Maps. Its native child uses flex layout and an explicit, finite initial camera.
- A camera command requires native readiness and matching positive host/native
  dimensions. It does not wait for tiles. Coordinate or size changes apply a new
  camera once; repeated tile events and marker selection do not fit again.
- The editor's initial map is bare. Markers and the route mount after a tile-loaded
  event. Direct consumers (shared trips, discovery and place picking) keep their
  existing immediate overlays. Native readiness alone never clears loading state.
- Inline, modal, day and retry instances own their state. Closing full screen
  unmounts its map. Late callbacks cannot complete a replacement instance.
- Timeout reporting pauses while hidden or backgrounded. Retry remains explicit;
  a genuine late tile event can recover an existing failed attempt. Stop editing
  and opening full screen remain available during a failure.
- Bounded diagnostic breadcrumbs include host/native dimensions, surface, retry
  number, point count, camera/tile stages and embedded/OTA identity. They exclude
  coordinates, stop names and user content. Existing Sentry app metadata identifies
  the binary build.

No backend, native dependency, native patch or runtime version changes are included.
The prior `fix/react-native-maps-fabric-ready-replay` branch remains preserved.
The Web map implementation is unchanged.

Validation: the final iOS OTA client-readiness check against production source
`dd72177d4739b2b84987c3f2ef68cfe80fa8b292` passed 91 suites / 635 tests, including
the native-event regression tests, Community, Web and trip-map consumers.
The release review identified and corrected an overlay regression for direct
consumers; all 55 focused tests passed after that correction. Applicable GitHub
checks and `git diff --check` passed. Backend checks are outside this JavaScript
change. Delivery and compatibility evidence are recorded in README.

## Delivery compatibility

The installed binary is build 32, EAS ID
`6ae60b3a-b0a6-4659-a054-68a044004a35`, source
`eb9770bc12c5accf16a8cb184e473d25d3f0b619`, runtime `1.3.0`, channel `production`.
The guarded OTA baseline still references build 30 and its reviewed optional
PlanLiTransfers delta. Do not silently replace that baseline with build 32: both
binaries share the runtime/channel.

The correction uses `initialCamera`, `setCamera`, `onLayout`, `onMapReady` and
`onMapLoaded` from the existing react-native-maps 1.27.2 contract. Build 32's native
event-replay patch does not change that contract. This source review does not
substitute for the guard's fingerprint check or device evidence. Publishing an
OTA does not remove a patch already compiled into a binary.

The guarded staging/promotion workflow passed from synchronized, tracked-clean
`main`. Staging group `f5613811-b540-4fbf-9e87-17cb85891c6f` and the production
group above contain the identical verified bundle. The prior production group
`586f1ad9-7715-450a-8e12-9720d9b789e3`, source
`dd72177d4739b2b84987c3f2ef68cfe80fa8b292`, remains the immediate rollback target.
The unrelated root `app.json` and concurrent Google Play README edits were
preserved. Record the actual applied OTA identity with the device outcome;
do not infer it from the installed binary build.

## Device acceptance still required

1. Record binary build, embedded/update identity and observation time. Open a
   one-stop day and a three-stop day. Require visible streets and correctly
   positioned markers; a missing spinner alone is not success.
2. Open and close full screen repeatedly, pan and zoom, select a marker, switch
   days, return from another screen, and change stop coordinates. Check both
   inline and modal views without camera loops or stale success states.
3. Background and resume during loading. Open offline, confirm stop editing and
   full-screen access remain available, restore connectivity and retry. Close
   during a retry; a late event must not affect the next opening.
4. Check Community streets/recommendations and the Web trip preview.
5. If blank rendering persists, inspect the measured host/native sizes and
   camera/tiles stages. Compare a bare map, viewport, markers and route separately
   on the same iPhone before changing native code or creating another build.

Automated tests drive native event order but cannot prove Google tile rendering.
The separate Google Play emulator session was left untouched; no Android or
physical-iPhone rendering success is claimed for this change.
