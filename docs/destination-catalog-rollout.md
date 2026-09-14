# Destination catalog rollout

## Failure and correction

The Ksamil incident `loc_uY_O-hk07Mo7` occurred on 2026-09-12 at
22:21:20 UTC. Venue selection had succeeded. A five-minute country registry
cache could predate the city created by the preceding recommendation. The
fallback then stored a boolean in `approvedExistingDestination` and read it as
a destination record, producing the misleading missing-Hebrew-name failure.

The fallback now keeps the destination record. Country registry mutations carry
an atomic revision token, checked before using each instance's cached registry.
Known registry paths resolve to existing public destinations, retaining stable
IDs and administrator-approved data.

## Selection and publication

1. The server verifies the selected venue and stores an owner-bound, expiring
   token. Coordinates and provider identity remain server-authoritative.
2. Classification uses the country registry, locality evidence, aliases, grouping
   policy and bounded geographic distance. Research-only centers do not authorize
   automatic nearest-city assignment. Ambiguous matches require user selection.
3. A verified containing locality missing a reliable Hebrew name asks only for
   name confirmation. The verified locality stays on the original venue token.
4. Clients opting into recovery retain the exact venue and map after a temporary
   classification failure. They can retry with the token or choose a destination.
   An unresolved destination cannot be confirmed or published.
5. Publication revalidates current country/destination policy, ownership and
   publication fences. Catalog approval does not bypass content moderation.

## Existing 3,000 candidates

`functions/data/worldDestinationCandidates.json` remains the research inventory.
The importer materializes it in the private registry, canonical country
destination documents and the public `destinationCatalog`. Existing destinations
are linked using stable identity or compatible names, country, kind and distance.
Existing registry decisions, destination records and recommendation IDs survive.

New source identities use `identity.source = planli_catalog` and the policy
`reviewed-catalog-v1`, with names, coordinates, public evidence and a catalog
digest. A Google destination ID is optional; no Google cache is invented.
Admin review, naming and identity-readiness consumers support this source.

The eight missing Sri Lanka centers are supplied by
`functions/data/reviewedDestinationCoordinates.json`, with explicit source URLs
and retrieval dates. Seven use Wikidata settlement coordinates; Hiriketiya uses
the coastal destination documented by ReiseCeylon. Existing reviewed/provider
coordinates supply other curated entries. No bulk Google enrichment is required.

The September 14 production apply created 2,961 destinations and linked 37
candidates to existing destinations, with zero conflicts. Existing restrictions
excluded `lk-sri-lanka-south-coast` and `il-wd-q165867`; both remain inactive.
Independent readback verified all 2,998 eligible bindings, a total active public
catalog of 3,012 destinations and all 50 recommendations active with valid
destinations. The README release record is authoritative for deployment IDs,
timestamps and current verification limits.

## Operation and validation

The importer is dry-run by default and writes its private plan/receipt only under
ignored `.codex_tmp`. Apply requires both the catalog digest and the reviewed
plan digest (including live identity/state fingerprints). Each destination uses a
bounded transaction that checks current status, identity binding and the country's
registry revision. Concurrent registry changes cause conflicts, not overwrite.
Restart by taking a fresh dry-run; existing identities are linked idempotently.
Never reactivate excluded destinations or overwrite administrative decisions to
achieve a numerical target.

Focused synthetic coverage includes catalog-only publication, immediate reuse of
a new locality, the stale-registry fallback, missing Hebrew confirmation,
owner-bound recovery, country/distance exclusions, import retries, inactive and
ambiguous identities, and concurrent registry changes. Native map testing has a
separate runtime receipt; synthetic tests do not establish physical iPhone or
production App Check behavior.

The production import exposed excessive memory retention in background airport
enrichment. The airport CSV parser now filters rows as they are parsed; its
public row-parser API and warm download cache remain compatible. The destination
creation trigger uses 512 MiB, concurrency 1 and at most three instances, retaining
zero idle instances and retries. A 14.6 MB source that failed with a 64 MiB heap
before the fix passes afterward. The new deployed revision processed real events
successfully without errors in the verified window. This background repair does
not alter destination identity, approval or content publication.

Android native validation reached the composer and displayed the provider fixture
after fixing developer-menu dismissal in the test bootstrap. The remaining
Maestro result-selector failure prevented completion of the map flow. Physical
iPhone selection, expanded map gestures and actual OTA application remain
unverified; the local callable and component tests do not establish those results.
