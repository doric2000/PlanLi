# Trip map initialization investigation

Status on 2026-09-20: JavaScript correction prepared on
`fix/trip-map-initialization`, based on `8c205ea610afd119c675211e862b21750def242f`.
It has not been published or verified on a physical iPhone. Keep the incident open.

## Evidence and scope

[Sentry PLANLI-MOBILE-1A](https://planli-t2.sentry.io/issues/148116570/)
recorded `google_ios_3_points_tiles_pending` at `2026-09-20T09:03:34.223Z`
on TestFlight 1.1.2 (32). Native readiness was observed; tile completion was not.
The tester reported a blank map after timeout, including a one-stop day, while
Community rendered streets in the same installation. The precise native rendering
cause is still unproven.

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

Validation: the initial iOS OTA client-readiness check against production source
`dd72177d4739b2b84987c3f2ef68cfe80fa8b292` passed 91 suites / 634 tests, including
the native-event regression tests, Community, Web and trip-map consumers.
`git diff --check` also passed. The release review identified and corrected an
overlay regression for direct consumers; the added regression test and final
validation are recorded with the release in README. Backend checks are outside
this JavaScript change.

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

The production iOS group read back during this investigation was
`586f1ad9-7715-450a-8e12-9720d9b789e3` (recorded source
`dd72177d4739b2b84987c3f2ef68cfe80fa8b292`). Use the guarded staging/promotion
workflow after the source is committed and main is synchronized. Preserve the
unrelated root `app.json` and the concurrent Google Play README edits. Update
README with the actual source, group, runtime, binary and device outcome after
an authorized release; do not infer the applied update from the installed build.

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
