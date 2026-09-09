# Destination resolution and world catalog

Implementation and authorized production data repair, 2026-09-09. Application code requires a separate deployment; the data repair below is live.

## Root causes and behavior

- Google Places `viewport` was treated as a destination boundary. The South Coast
  seed actually used Southern Province, so an inland national park was captured by
  `canonical_geometry`. Provider-derived coverage now ranks user choices; only
  reviewed coverage can drive automatic containment.
- Provider policy approval disabled aliases together with geometry. Ella remained
  approved but could not match a locality alias. Verified aliases now work with a
  country and distance check even when automatic geometry is disabled.
- Little Adam's Peak has multiple provider identities. One returns Badulla as its
  locality. Reviewed POI membership links all three observed trail identities to
  Ella without making those IDs identities of Ella itself.
- Udawalawe National Park has its own stable registry ID and Hebrew name. It is
  distinct from Udawalawa town. The Southern Province override was quarantined;
  the importer cannot reactivate it by rerunning enrichment.
- Hebrew naming prefers administrator decisions, reviewed labels, country-scoped
  catalog aliases, and provider Hebrew. A transliteration is a suggestion requiring
  confirmation. Missing Hebrew does not mean that the place identity was not found.
- Exact-place forms expose **שינוי יעד** after successful resolution. They retain
  the place, form text and media, offer nearby approved destinations, and search
  the public catalog before provider results. Naming confirmation stays in the form.
- Expired choices are renewed and the user's destination is reapplied. Publication
  rejects stale automatic geometry bindings instead of silently changing the choice.
  Held recommendation edits also honor a newly confirmed destination. If a draft
  resends the unchanged destination reference, its held assignment is still
  revalidated. Pending changes use independent tokens, so cancelling cannot
  overwrite the committed selection. Copies retain the original expiry.
- Existing Auth, country policy, destination attestation, publication fences,
  content moderation and idempotency checks still govern publication.
- Catalog search results become selectable as soon as they arrive, even while
  the provider is still pending. The query is locked only while its choice is
  being committed. Late provider responses cannot replace a newer selection.
- Country document IDs and ISO codes remain distinct in suggestions, catalog
  filters and assignment audits. Hebrew and other Unicode aliases preserve their
  letters during lookup instead of collapsing into a country-only key.

Google documents a viewport as a display area, not an administrative boundary:
[Place resource](https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places).
Hebrew responses are not guaranteed for every name:
[Place Details](https://developers.google.com/maps/documentation/places/web-service/place-details).

## Catalog provenance and limits

`functions/data/worldDestinationCandidates.json` contains exactly 3,000 candidates
in 202 countries. All 252 original registry IDs are retained. Nine additional
Sri Lanka travel destinations and the separately reviewed national park are included.
The other 2,738 identities come from Wikidata entries with an English Wikivoyage
guide, an actual Hebrew label, an unambiguous country and coordinate, and an allowed
geographic type. Languages, countries, ancient sites and ambiguous identities are
excluded. No English label is silently transliterated into a verified catalog name.

The initial 252 entries retain their existing research sources; the additional
Sri Lanka labels reference travel and tourism sources. They are editorial candidates,
not claims of bulk Google verification. Wikidata's source data is
[CC0](https://www.wikidata.org/wiki/Wikidata:Data_access); guide links are references,
and no guide prose is copied.

The selection retains the original travel focus and adds worldwide coverage.
Wikimedia sitelinks rank coverage within geographic allocations, with country
balancing. They are **not a measurement of Israeli traveler popularity**.

| Region | Entries |
| --- | ---: |
| Europe | 1,000 |
| East and Southeast Asia | 430 |
| South and Central Asia | 350 |
| Latin America | 420 |
| US/Canada and associated territories | 300 |
| Africa | 300 |
| Oceania | 160 |
| Israel | 40 |

Source identity validation and provider approval are separate. The world catalog
supplies Hebrew names immediately after deployment. A candidate is never made
referenceable solely because it exists in this file. Google identity verification
and the existing policy approval still occur when resolving a destination, or in a
separately run enrichment/import. Bulk Google enrichment and production import have
not been performed in this task.

Research covered 41,192 Wikivoyage-linked IDs in 206 resumable public-data batches.
Snapshot SHA-256:
`c55d34562a6829911a2cc97110e87f65ab2252ee7d725abdde180ad469607ee1`.
Snapshots stay in ignored `.codex_tmp/destination-catalog/`. Reproduce locally:

```powershell
node functions/scripts/researchWorldDestinationCandidates.js --output .codex_tmp/destination-catalog
node functions/scripts/buildWorldDestinationCatalog.js .codex_tmp/destination-catalog functions/data/worldDestinationCandidates.json
node functions/scripts/seedCanonicalDestinationRegistry.js
```

The last command is a local dry-run and makes no provider or Firebase requests.
Provider enrichment accepts `--enrich --offset <n> --limit <n> --checkpoint <directory>`.
Use an ignored checkpoint directory; it can contain cached Google responses.
Enrichment requires a matching country, name, geographic type and (for researched
identities) coordinates. It never takes an arbitrary first search result. Valid
checkpoints are reused for 24 hours only when the candidate, project and policy
signature match. An ambiguous batch fails validation before writes.

`--apply` requires `--enrich` and an explicit checkpoint, plus separate operational
authorization. Imports create missing records transactionally and preserve existing
administrator decisions, stable IDs, inactive states and provider identities. A
partial import records its own outcome without replacing the total inventory count.
Every incoming primary and secondary Google identity is checked against both
persisted identity fields before creation. Eleven retained, country-qualified
labels now carry explicit provider aliases (for example Granada Nicaragua →
Granada); this does not relax country or provider-type checks.

## Existing content and rollout

`auditCanonicalDestinations.js` remains read-only, including when `--apply` is supplied
(it rejects that flag). It now reports individual recommendation assignments using
exact provider identity or reviewed membership, without trusting the current
destination's name as evidence. Review the affected recommendation individually;
do not merge the whole South Coast into the national park or move all Ella posts.
Use existing admin impact/assignment and publication-fence workflows for an authorized
repair. Preserve unrelated moderation holds; the audit never republishes content.

Deploy the affected Functions before the matching client update. Registry import,
existing-content corrections, backend deployment and client release are separate
authorized operations. Recheck the two reported Sri Lanka flows against deployed
code after release; local tests do not establish production behavior.

## Review and validation (2026-09-09)

The requested Codex review completed using CLI 0.153.4 and the configured model.
Five P2 findings were corrected: held edits skipping revalidation, cancelled
changes overwriting committed tokens, duplicate secondary provider IDs during
import, missing country-qualified aliases, and country-ID/ISO-code confusion in
assignment audits. Additional regressions cover Unicode alias collisions,
incremental catalog results, expired publication bindings and invalid coordinates.

The focused validation passed 225 backend tests and 80 client tests across six
client suites. A separate isolated demo Auth/Firestore/Functions run exercised
authenticated raw-place recovery, independent choice tokens, explicit destination
binding, original-token preservation and mismatched-place rejection. Only provider
transport was synthetic; the owned emulators were stopped afterward. The final
staged recommendation tests are also exercised without the unrelated media patch
in the shared workspace (86 tests passed).

Live follow-up found that delayed Firestore events could overwrite an active
recommendation's admin search projection with its earlier held status. The
recommendation projection now reads its current source inside a transaction;
delayed updates/deletions cannot restore obsolete status or resurrect deleted
content. All 10 focused projection/backfill tests passed, including three new
event-order regressions.

Rendered device/browser validation remains unverified. Local component and
callable tests do not prove the deployed client flow. No Functions, Hosting, OTA
or native build was deployed by this task.

## Authorized production repair

The production project and active operator were verified before writing. Provider
identities were checked through Google Places details and the application's
autocomplete path. All changes first passed a dry-run; the write manifest was
bound to a SHA-256 fingerprint and checked source versions transactionally.
Publication reused the existing destination-approval release service.

At 2026-09-09T05:56:38Z, both destination-held recommendations were released.
An independent reread confirmed all 42 recommendations active, each referencing
an approved destination present in the public catalog. Four destinations were
created and two existing destination identities/names were corrected:

| Recommendation/location | Corrected destination | Result |
| --- | --- | --- |
| Udawalawe safari | שמורת אודוואלווה | New destination; released from the incorrect South Coast assignment |
| Ha Long night market | האלונג | New city identity; released from the unapproved bay assignment |
| Ambewela railway station | נוארה אליה | New hub; corrected from Ella |
| Grunas Waterfall | ת׳ת׳ | New hub; corrected from Shkodër |
| Arugam Bay Beach | חוף ארוגם ביי | Corrected Hebrew name; preserved destination and provider IDs |
| Ha Long Bay | האלונג ביי | Corrected kind to natural feature and completed provider-policy approval |

The exact place IDs, coordinates, titles, descriptions and media were preserved.
The incorrect Southern Province/South Coast identity was retired only after
checking it had no remaining recommendations, routes or trips. Ella and its
Little Adam's Peak recommendation remain active. The admin view was reconciled:
two held cases referenced already absent recommendations, and two destination
reviews were stale; they were closed/refreshed without recreating deleted content.
The stale Ha Long recommendation projection was rebuilt from its live source.

The Grunas correction was cross-checked against the
[Albanian tourism authority](https://akt.gov.al/en/atraksionet/ujvara-e-thethit-ujevara-e-grunasit/).
The Ambewela grouping was cross-checked against
[Sri Lanka Tourism](https://srilanka.travel/index.php?hotel_type=2&route=travel%2Ftostay).
A recommendation whose title says Da Nang but whose selected address is Hanoi
retains its verified Hanoi location; no alternative place was invented from text.

The 3,000-entry research catalog remains separate from live availability: 2,748
additions and 252 retained candidate IDs. Bulk enrichment/import was not performed.
Production Text Search has an intentional quota of zero and requires separate
quota authorization before bulk enrichment. Existing autocomplete/detail quotas
were preserved. Operational receipts and the complete Hebrew additions report
remain in ignored local artifacts, not committed production records.

## PR validation follow-up

The initial remote run caught a rename regression fixture still expecting naming
policy v2; its expected version is now v3. Dependency audit also identified newly
reported advisories in existing locked packages. To satisfy the existing audit
without expanding exceptions, the repair updates Sharp to 0.35.4, MapLibre GL JS
to 6.4.1, Hono to 4.13.7 and js-yaml to 3.15.2. Only their required dependency
chains change. The existing, separately reviewed React Navigation exception is
unchanged; the client audit passes that policy and Functions has no advisories.

MapLibre's first patched version requires its ESM v6 distribution and WebGL2.
The application already uses its named Map/Marker APIs; its worker URL is now
explicit. A postinstall step prepares the worker, shared module and license as
same-origin, versioned Expo public assets. Generated vendor assets stay ignored.
The existing coordinate fallback remains available when the map cannot load.
The distribution's exports and worker URL, worker asset preparation, and actual
Sharp JPEG/WebP processing were exercised. Eighteen focused media/rename tests
passed using the patched Sharp installation in an isolated dependency directory.
Both map picker suites passed (three tests). A fresh consumer Web export with
the actual MapLibre 6.4.1 ESM distribution completed successfully; its versioned
worker/shared assets were included. This is a bundle/runtime API proof, not a
visual browser check. The connected UI tooling exposed no browser for rendering.

Upstream references: [MapLibre advisory](https://github.com/maplibre/maplibre-gl-js/security/advisories/GHSA-jrc7-96c5-q579),
[v6 migration changes](https://github.com/maplibre/maplibre-gl-js/releases/tag/v6.0.0),
[Sharp patch](https://github.com/lovell/sharp/releases/tag/v0.35.4),
[Hono patch](https://github.com/honojs/hono/releases/tag/v4.13.7),
[js-yaml patch](https://github.com/nodeca/js-yaml/releases/tag/3.15.2).
