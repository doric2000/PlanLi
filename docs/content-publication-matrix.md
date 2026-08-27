# Content publication matrix

This document is the acceptance map for the active public recommendation and
route flows. The dormant `TripService` flow is intentionally excluded.

## Result contract

| Server outcome | Stored status | Public queries | Owner profile | Client message | Retry |
| --- | --- | --- | --- | --- | --- |
| Published | `active` | Must appear in the matching feed, destination/profile query, and detail loader | Public grid | Published successfully | Same request returns the same ID and `active` outcome |
| Pending review | `moderation_hold` | Must never appear | Owner-only **בבדיקה** grid | Sent for review; not public yet | Same request returns the same ID and held outcome |
| Rejected | No committed publication | Must never appear | Draft/failed queue remains editable | Field-specific safe error | Stable request/media identifiers; no duplicate upload |
| Unknown legacy response | Read back is not assumed | Never claim visibility | Profile can be refreshed | Saved; status not verified | Privacy-safe diagnostic is captured |

Every save and draft-publish response carries `publicationStatus` and
`publiclyVisible`. Publication receipts preserve the same fields.

## Recommendations

| Axis | Cases that must work |
| --- | --- |
| Entry path | Guided create; guided catalog edit; legacy edit; draft resume/discard; autosave; failed-job edit/retry; restart recovery |
| Location | Exact place; city/region destination; manual pin |
| Destination source | Existing PlanLi destination; provider-backed new destination; expired exact-place token fallback |
| Location semantics | Destination strips exact place/pin; pin keeps only manual coordinates; exact keeps canonical place; provider IDs never become public content fields |
| Media | 1 and 5 images; prepared media reused on retry; canonical media retained on edit; invalid/foreign media rejected |
| Classification | All 10 categories and 166 subcategories; 1–3 matching subcategories; all 10 labeled Other choices publish immediately when text-safe |
| Budget/details | All 5 post budgets; optional contact/phone/link/price/accessibility; bidi-trimmed HTTP(S) link; event timing required only for events |
| Moderation | Safe content becomes active; unsafe/suspicious text becomes held; held content is never reported as public |
| Concurrency | Immutable draft version, save request ID, publish request ID, lost-response replay, stale-version rejection |

## Routes

| Axis | Cases that must work |
| --- | --- |
| Entry path | Create/edit; draft resume/discard; autosave; reorder-only edit; failed-job edit/retry; restart recovery |
| Stop type | Active PlanLi recommendation; exact place; city/region destination; manual pin; mixed types in one route |
| Destination source | Existing destination; provider-backed destination; unchanged trusted exact place; expired-token provider fallback |
| Limits | 1–60 days; at least 2 useful stops; up to 150 stops; up to 40 images; provider/destination/exact-place ceilings |
| Metadata | Every available season, difficulty, experience level, transport mode and pace; whole-route price required |
| Media | Route and stop media preserved through draft/revision activation; no duplicate upload on retry; failed prepared revision cleaned |
| Trust | PlanLi source is reloaded and must remain active; canonical destination IDs must match provider proof |
| Moderation | Safe route becomes active; unsafe route becomes held; held replay is a successful pending-review outcome |
| Revisions | Only the new revision activates; previous revision is superseded; lost responses replay the active revision |

## Cross-surface acceptance

- An `active` recommendation is discoverable in Community, destination results,
  its author profile and detail screen after the completion refresh.
- An `active` route is discoverable in Routes, its author profile and route detail.
- A held item is absent from every public query and appears only through the
  authenticated owner callable and the profile **בבדיקה** tab.
- Deleting/editing unrelated content, app restart, network loss and repeated taps
  cannot duplicate documents, revisions, counters, destination materialization or media.
- Logs and Sentry may contain only content type, location mode, operation,
  publication status and bounded error codes—not content text, provider IDs,
  coordinates, names, search text or media URLs.

## Verification layers

1. Generated taxonomy contract tests exercise every selectable ID.
2. Focused service tests exercise validation, destination materialization,
   moderation status and idempotent receipts.
3. Client tests exercise durable queue recovery, outcome-specific banners and
   owner-only pending content.
4. Preview smoke covers recommendation exact/destination/pin, labeled Other,
   route mixed stops, edit, restart and retry on iOS and Android.
5. Production verification compares callable outcome, stored status and public or
   owner-only visibility, followed by a bounded Sentry/Cloud Logging check.
