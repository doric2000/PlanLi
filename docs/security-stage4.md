# Stage 4: controlled launch operations

Status: deployed; **final verification pending, not closed**. Owner: Doric.
Source: merged PR #455, `9290939390ea3502e3307bf65904da37cfa46aac`.
No alternate operator is designated until their infrastructure access is verified.

## Acceptance and blockers

- The owner attested on 2026-09-30 that MFA is active for Google, GitHub, Expo
  and Apple, including GitHub writers `baruhifraimov` and `OFEKJAN`, and that
  recovery methods are available. This is an owner attestation, not direct
  inspection of each security screen. Google project/billing human administration
  and GitHub repository collaborators were inventoried read-only. The owner also
  confirmed that he is the sole Expo publisher and Apple signing/key operator.
  Expo/Apple membership scope is owner-attested, not independently inventoried.
- The five existing monitoring controls and 22 production quotas were read back.
  Stage 3 App Check email-delivery evidence remains valid for those two paths.
  Four new provider-usage alerts are enabled; a tagged 80% incident opened at
  2026-09-30T16:25:07Z and the owner confirmed email receipt.
- The billing account contains two additional active projects. The owner
  explicitly requested no changes to them. Their future Maps consumption is not
  bounded by PlanLi's counter. Read-only quota inspection found each allows
  175,000 Autocomplete and 125,000 Place Details requests per day, far above
  the shared free allowances. These are ceilings, not observed consumption.
  The owner subsequently approved paid Maps use **within the same ILS 75 total**,
  including more than ILS 15 if justified. There is no separate fixed ILS 15 cap.
  The owner authorized the free-aware implementation and quota expansion.
  The tool supports `free-plus-paid-ils` and retains `full-price-ils` for stress
  testing. Zero free usage is not the expected billing assumption or launch plan.
  Sibling costs and settings remain outside this PlanLi-only budget and unchanged.
- Remaining release gates: mobile provider/draft/save smokes, live counter increments,
  Places quota expansion/read-back and a final 30-minute observation. See the live
  deployment checkpoint below; implementation/forecast sections retain their context.

## Provider admission contract

`functions/providerUsagePolicy.js` classifies reviewed transport requests.
`providerUsageService.js` transactionally reserves each possible billed SKU before
each network attempt, including retries and token-refresh retries. Transactions
finish before the network call. Failed or uncertain attempts are never refunded.
Counters contain SKU, period, project, approval hash, baseline, limit, reservations
and threshold flags/last-reservation time; no user IDs, places, request bodies or credentials.
The collection is `system/runtime/providerUsage`. Existing private Rules apply.

The billing month uses Pacific midnight, including DST. The last minute of a
month blocks new provider attempts so bounded in-flight requests cannot cross
into an unreserved billing month. Admission rechecks this after the transaction.
A missing next-month allocation fails closed; there is no automatic zero baseline.
Unknown origins, fields and expensive unreviewed options also fail closed.

| Transport | Reserved SKU(s) per attempt |
| --- | --- |
| Autocomplete | Autocomplete, even if a later session discount might apply |
| Selection details with Essentials fields | Details Essentials |
| Details containing displayName/containingPlaces without a session | Details Pro |
| Pro details with a session | Pro **and** Enterprise + Atmosphere, covering invalid/reused and valid termination |
| Reverse Geocoding v4 | Geocoding |
| Basic Routes, at most 10 intermediate points | Routes Essentials |
| Reviewed basic Routes with more than 10 intermediates | Routes Pro |

Bilingual requests reserve separately. Route chunks reserve separately. Unused
Text Search remains blocked; maintenance scripts do not bypass the guard.
The per-user limits remain unchanged; project daily/minute changes are applied
only after guard read-back, except the early Routes-only tightening. This counter bounds Google
provider attempts, not all Cloud spending or repeated denied-transaction cost.

Errors retain known callable codes with terminal `details.reason` values
`provider_monthly_limit_reached` and `provider_budget_unavailable`, plus
`retryable:false` and a public reset time when known. Local and background publish
flows preserve draft/intent and suppress retry. Browsing, Auth, favorites and
existing-content reads do not invoke the provider counter.

Sources verified 2026-09-30: [Maps pricing](https://developers.google.com/maps/billing-and-pricing/pricing),
[session billing](https://developers.google.com/maps/documentation/places/web-service/session-pricing),
[SKU classification](https://developers.google.com/maps/billing-and-pricing/sku-details),
[billing-month reset](https://developers.google.com/maps/billing-and-pricing/overview),
[Routes billing](https://developers.google.com/maps/documentation/routes/usage-and-billing).

## Monthly allocation and rollout

Run `node scripts/providerUsageAllocation.js --manifest <ignored-reviewed-json>`.
It is read-only by default. The manifest must name the exact production project,
billing account, period, observation timestamp, rollout deadline, evidence SHA256,
the full-price budget/evidence block, and all seven SKU rows. The budget block
contains `totalMicros:75000000`, `otherServicesReserveMicros`,
`otherServicesForecastMicros`, `forecastEvidenceSha256`, `priceEvidenceSha256`
and `pricesCheckedAt`. The reserve must cover the forecast. Each SKU row contains:

- `projectUsedUpperBound`: proven upper bound on prior PlanLi usage this month
  (whole-account usage can be used as a conservative upper bound if complete);
- `reportingAndRolloutReserve`: upper bound for delayed reporting and unmetered
  traffic until **every** consuming deployment serves the new guard;
- `limit`: total admitted monthly units including prior usage;
- `unitPriceMicros`: reviewed full-price ceiling per unit in micro-ILS, at least
  the buffered Catalog floor in `providerUsageBudget.js`.

The selected accounting mode is `free-plus-paid-ils`. The manifest includes
`freeUsage` with matching account and month, an evidence hash, an observation no
more than 24 hours before rollout, and `sharedUsageForecastAcknowledged:true`.
Each SKU adds `assignedFreeUnits`, `otherProjectsUsageUpperBound` and
`sharedUsageReserve`; their sum cannot exceed its shared free allowance, and
PlanLi receives at most 90% of that allowance. The latter reserve covers forecast
uncertainty and reporting gaps; it is not a cap on sibling projects.
`scripts/providerUsageBudget.js` prices the positive excess of the greater of
limit or historical baseline over assigned free units. The sum of all SKU overages
plus the non-Maps reserve must fit ILS 75. Lowering a limit cannot hide prior use.
Reviewed runtime count maxima are independent of free allowances, permitting
10,850 Autocomplete and up to 1,040 Atmosphere requests. The selected allocation
uses 1,030 Atmosphere to cover the larger counter cost. Full-price mode remains
available as a stress scenario. Neither mode changes counters retroactively.
Unproven usage values are not zero. Apply requires
the exact dry-run manifest/state hashes and typed confirmation; expired evidence,
concurrent changes and replacement allocations are refused. All seven documents
are created atomically. Re-running an identical manifest reuses counters without
resetting reservations. Independent read-back verifies the result.

Before deployment, prepare the current and upcoming month if rollout spans the
boundary, review current ILS prices, and bound PlanLi's historical and unmetered
rollout usage. Reconcile usage again after rollout. Missing allocation evidence
still blocks release; never deploy first and silently disable existing search.
Changing the split for future allocations requires a new forecast and reviewed
manifest. It is not automatic borrowing from live Cloud billing, which is delayed.

After approval: publish client messaging to both platforms and Hosting, create
the reviewed counters, then deploy explicit provider consumers in small batches:
`searchPlaces`, `resolvePlaceSelection`, `resolveRecommendationDestination`,
`saveRecommendation`, `publishRecommendationDraft`, `saveRoute`,
`publishRouteDraft`, `computePrivateTripRoute`, `onBackgroundOperationWritten`.
The background worker is required because it can publish after a client leaves.
Scheduled maintenance only reschedules jobs and needs no redeploy. Revalidate
this list against the final source before release; do not deploy all Functions.

Rollback preserves counters and lower quotas. Do not restore an unguarded
provider transport. Keep affected external operations blocked until repaired;
preserve Auth, Rules, App Check, ownership and existing-content access.

## Monitoring and response

`node scripts/securityMonitoringPlan.js --project planli-f0b12 --app-check-rollout --provider-usage`
previews the five existing policies plus four new policies. It requires the live
App Check rollout option, preserves current controls, rejects drift and verifies
state/manifest hashes before apply. Structured `provider_usage_control` events
contain no request data. Threshold events occur once at/above 80%/95% after admission,
including a baseline already over a threshold;
they are best-effort logs, not a transactional notification outbox.

| Event | Doric's response |
| --- | --- |
| 80% | Review account-wide usage and allocation; stop plans to expand distribution |
| 95% | Stop audience expansion; identify which provider flows are approaching denial |
| Exhausted | Confirm planned denial and draft recovery; never reset the counter |
| Counter unavailable | Identify DB/IAM/configuration failure; keep provider calls blocked and repair |
| App Check rejection | Correlate deliberate probes and known-good clients; roll back only a proven failing group |
| Server 5xx / provider 429 | Inspect serving revision and affected flow; stop expansion and apply focused repair |
| New service-account key | Identify the actor/change; investigate unauthorized credentials and revoke only after verification |
| Cloud budget threshold | Check actual/forecasted spend and service breakdown; stop expansion before exceeding ₪75 |

Test new delivery with an explicitly tagged synthetic log event after alert
activation; do not generate a real server error, credential, quota exhaustion or
billing charge. Confirm receipt and exclude the test from the observation window.
This proves operational email routing, not receipt of a real billing-budget email.
The existing ₪75 budget is an alert, not a cap. See
[Google budget limitations](https://docs.cloud.google.com/billing/docs/how-to/budgets).

## Cost and capacity model

`node scripts/providerUsageForecast.js` produces reproducible 31-day scenarios.
Public ILS SKU prices were read from the Cloud Billing Catalog on 2026-09-30 for
the actual billed Firestore, Functions and Belgium Storage SKUs. Source catalog:
[Cloud Billing API](https://cloud.google.com/billing/docs/reference/rest/v1/services.skus/list).
The model conservatively subtracts no free-tier/CPU credits, includes the counter
(five transaction reads and one write per admitted SKU), and adds 20% uncertainty.

The moderate scenario assumes 200 DAU, 40 images/day at 200 KiB each, 200 document
reads, 10 writes, 40 function calls averaging 0.35 CPU seconds and 0.5 GiB, plus
10 publications/day with three images each, 15 GiB additional storage and ₪10
for fixed/other services. It models roughly ₪45/month, **not measured 200-user
behavior**. The ₪10 allowance includes scheduler/secrets, baseline storage,
PITR/backups, logs, API/network overhead and build artifacts; it is an assumption,
not an independently enforced cap. Current prelaunch billing is not a load test.

At 200 images/day of 600 KiB, 800 reads and 80 calls/user/day, the model exceeds
₪345/month. Image size/cache-hit ratio, callable CPU, denied requests and regional
egress mix must be measured during controlled rollout. No quota or budget increase
is implied by the 200-user target. Heavy-usage scenarios block audience expansion.

The full-price stress scenario reserves ILS 46 for the modeled non-Maps cost (about ILS 45.26,
including counter overhead and the existing 20% uncertainty allowance). It leaves
up to ILS 29 for Maps. An illustrative empty-month workload mix allocates ILS 28.70
to 496 Autocomplete, 124 Essentials, 124 Pro, 124 Atmosphere, 62 Geocoding,
124 Routes Essentials and 62 Routes Pro attempts. The modeled total is ILS 73.96.
This permits at most 62 bilingual Pro session resolutions/month before retries
and extra lookups, not 62 guaranteed publications. Existing-place reuse and
browsing have different capacity. Historical usage further reduces new capacity.
The mix is synthetic, has not been seeded, and is not a promise of 200 creators/day.
It deliberately excludes known free usage and is not the recommended launch
capacity. Use the free-aware analysis below for the expansion decision.

The ILS 46/29 split is a current planning outcome, not a permanent policy. A
verified smaller Cloud forecast can leave Maps more than half the total; a larger
Cloud forecast reduces Maps capacity or blocks audience expansion. Google Cloud
costs are still estimated and monitored, not hard-capped by this request counter.

Full paid prices were retrieved from the ILS Cloud Billing Catalog effective
2026-09-30T07:00:00Z. The allocation tool uses the highest paid tier, adds 10%
pricing/FX headroom, rounds up to integer micro-shekels, and ignores free tiers and
volume/session discounts. Floors per attempt are: Autocomplete 9,250;
Essentials/Geocoding/Routes Essentials 16,342; Pro 55,562; Atmosphere 81,708;
Routes Pro 32,684 micro-ILS. A session attempt reserves both possible Pro and
Atmosphere units as described above. Prices must be checked within 24 hours of
the rollout deadline; material price changes require new conservative ceilings.
The headroom is a planning safeguard, not a guarantee against provider price
changes, taxes or unmetered services. No live allocation or deployment is implied.

## Free-aware quota expansion implementation (2026-09-30)

Read-only Cloud quota verification matched all 22 configured controls. A separate
Routes read found 3,000 Compute Routes requests/minute and a daily value of
9,223,372,036,854,775,807 (effectively unlimited). Routes is absent from the current
22-control manifest. Source-level application limits were inspected separately;
they are not additional Cloud quotas. The authorized Routes-only phase was then
applied and verified at `2026-09-30T15:58:33.699Z`: 300/day and 30/minute. Its
manifest SHA256 is `18cc520bbc14d83292621a9c438b61b687c2ea78ac27648feb54b432f5cd215e`.
Places expansion remains pending monthly-guard rollout; no sibling quotas changed.

| Scope | Current limit | Conditional proposal |
| --- | --- | --- |
| Project Autocomplete | 300/day, 30/minute | 350/day, 60/minute; 10,850/month |
| Project Place Details, all billed tiers | 150/day, 30/minute | 300/day, 60/minute, subject to each SKU monthly limit |
| Project reverse Geocoding | 300/day, 30/minute, also aggregate caps | Retain daily/minute caps; 9,000/month |
| Project Compute Routes | 3,000/minute; effectively unlimited daily | Add 300/day, 30/minute; 9,000 Essentials/month |
| User Google logical budget | 30/minute, 120/24 hours | Retain; no separate hourly Google limit exists |
| Unused Text Search, Nearby, Google media, other geocoding methods | 0 | Retain |
| reCAPTCHA | 300/day, 60/minute | Retain pending actual sign-in/App Check capacity evidence |
| Auth default requests | 60/minute; custom token/SMS disabled | Retain |

The aggregate and reverse-Geocoding quotas overlap; they do not provide 600/day.
User logical costs are autocomplete 1, bilingual details 2, locality resolution 3,
full raw resolution 5, and each route chunk 1. A nominal autocomplete + bilingual
details + locality flow uses 6 units (up to 20/day/user before extra attempts).
User windows start at the first request. These are not Google billable-SKU units.
Provider callables have maxInstances 1 and concurrency 4. Each resolution context
is bounded to 10 transport attempts, with at most two ordinary attempts per call.

Other application limits: logged-in public reads 240 weighted units/minute, guest
reads 120/minute, global public reads 1,200/minute; guest-session issuance 20 per
network prefix/10 minutes and 300 globally/10 minutes. Per user: favorites,
reactions and notification mutations each 120/minute; comments 30/10 minutes;
draft saves 120/10 minutes; content deletions 20/hour; reports 20/day; block
mutations 60/day; push registrations 10/hour and at most 5 active devices.
Unsplash has a separate global 45-request/hour budget. These controls remain
unchanged and must not be confused with a Google Maps hourly allowance.

The account-wide billing report read on September 30, reporting through September
29, showed the following. Reporting can lag; it is not a live remaining-credit
guarantee, a zero-baseline seed, or a forecast of the sibling projects' next month.

| SKU | Shared monthly free allowance | Reported account usage |
| --- | ---: | ---: |
| Autocomplete Requests | 10,000 | 192 |
| Place Details Essentials | 10,000 | 82 |
| Place Details Pro | 5,000 | 110 |
| Place Details Enterprise + Atmosphere | 1,000 | 10 |
| Geocoding | 10,000 | 18 |
| Routes Essentials | 10,000 | 33 |

Free allowances are real. Different Details tiers have separate allowances;
valid Pro session termination is billed as Atmosphere under Google's session
rules, while reused/invalid sessions can be Pro. The current guard reserves both
possibilities conservatively; this is not a claim Google bills both for one call.
The existing 150/day Details quota alone does not guarantee free operation:
4,650 Atmosphere requests in a 31-day month would exceed its 1,000 free allowance.

An illustrative combined allocation uses 90% of each free allowance for PlanLi,
leaving 10% as shared-use headroom. This is a planning assumption, not a verified
exclusive grant: sibling projects remain unmodified and can exceed that headroom.
Within a fresh 31-day allocation, the final model reserves ILS 47 for the moderate
non-Maps workload, including all counter operations (modeled ILS 46.05668):

| SKU | Monthly request/reservation ceiling | Assigned free allowance | Buffered modeled paid ILS |
| --- | ---: | ---: | ---: |
| Autocomplete | 10,850 | 9,000 | 17.11250 |
| Details Essentials | 9,000 | 9,000 | 0 |
| Details Pro | 4,500 | 4,500 | 0 |
| Details Atmosphere | 1,030 | 900 | 10.62204 |
| Geocoding | 9,000 | 9,000 | 0 |
| Routes Essentials | 9,000 | 9,000 | 0 |
| Routes Pro | 4,500 | 4,500 | 0 |

Modeled Maps cost is ILS 27.73454 and combined reserved total ILS 74.73454, using
the buffered ILS prices above. The same ILS 28 is shared across all SKU overages,
not available separately to each. This supports at most 515 bilingual Pro-session
resolutions under the current conservative two-Atmosphere-reservation accounting,
before retries/other consumers; it is not 515 guaranteed publications. Daily
300 Details is a burst ceiling and cannot be sustained for every expensive SKU.
The monthly guard must stop requests when the relevant SKU allocation runs out.

The budget check, runtime count maxima, cost model and operator state fingerprint
have been updated and tested. Before applying, bind the allocation to fresh
account evidence and a reporting/rollout margin. If sibling consumption exceeds
the assigned reserve, stop expanding traffic and revise the remaining allocation
without resetting usage; do not silently reuse the previous credit assumption.
Historical usage must reduce the current month's
available capacity. Unknown future sibling usage is uncertainty to track, not a
reason to describe observed free usage as zero. The non-Maps forecast and delayed
account billing still prevent promising an absolute ILS 75 invoice ceiling.
The earlier arithmetic in `free-aware-capacity-analysis.json` is superseded by
`free-aware-forecast.json`, which includes the incremental counter workload.
At 15:52:23Z, read-only Monitoring API data for the month showed 235 Autocomplete,
228 GetPlace, 28 Geocoding (including failed requests) and 40 ComputeRoutes calls
in PlanLi. The two sibling projects returned no series for the queried services.
This is lagged transport telemetry, not SKU billing or proof of future zero usage.
No live allocation was created.

## Completion evidence

Free-aware amendment receipts: 14 budget/allocation/forecast tests, eight quota
planner tests, eight runtime admission tests, four transport tests and two real
Firestore emulator tests passed. One existing malformed-counter fixture was
updated from the formerly prohibited 10,000 limit to 10,851, above the newly
reviewed maximum. Quota previews identify exactly four Places expansions and two
Routes reductions; the Routes phase is separately constrained to reductions.

Ignored receipts live under `.codex_tmp/validation/security-stage4/`. Pure tests
cover 200 synthetic concurrent requests, month/DST rollover, multiple SKUs,
uncertain attempts, failure closure and thresholds. Firestore emulator evidence
covers independent clients and denied anonymous/authenticated client reads/writes.
Client tests cover terminal copy, retained draft controls and background errors.
The final read-only review inspected the 32-file candidate inventory with SHA256
`d050e7312d4d8e96fb094457e76e6fd468d2a14d1bd8258c88e58b1381a2175d`.
It found two P2 client contract gaps: preview recovery ignored terminal errors,
and private-trip routing mislabeled budget denial. Both were corrected in
`useExactPlaceSelection` and `TripService`, with focused regression tests.
No second broad review or backend rerun was needed for these client-only fixes.
The subsequent owner-approved paid-budget policy changes only allocation/model
tooling, not the admission transaction or client behavior. Its separate focused
receipts are `paid-budget-tests.log` (nine passing tests) and
`paid-allocation-emulator.log` (atomic create/reuse/no-reset passed). The final
tooling diff was inspected for arithmetic bounds, missing/expired evidence and
historical-usage accounting. No client export or broad backend suite was repeated
for this tooling-only policy amendment.

Validation receipts: 26 policy/transport/operator tests, 130 consuming-service
tests, 239 transitive backend tests, two Firestore emulator tests, and 67 client
tests in six suites passed. The final preview/trip check passed 69 of 71 tests;
the first planner test timed out and the next encountered an unmounted renderer.
Both affected planner tests passed on a focused rerun without code or timeout
changes. The other 24 planner tests and the direct hook/service tests had passed.
The final admin export verified all 32 local asset references. Chrome smoke at
desktop and 390-pixel width showed complete Hebrew terminal banner messages;
the isolated fixture preserved edit controls and omitted retry. This used real
components with synthetic context, not production or native-device evidence.

Record final review, actual allocation, exact deployments/OTA IDs, platform tests,
alert delivery and observation times in README before closing this stage.

Stage 5 remains open: backup/restore drill, deep SecureStore migration/restore,
admin sign-out control, acknowledgement burst/backoff and final launch gate.

## Live deployment checkpoint — 2026-09-30

PR #455 was merged as `9290939390ea3502e3307bf65904da37cfa46aac`. Hosting and
both mobile platforms were released before the provider Functions. This checkpoint
supersedes earlier candidate/not-deployed descriptions; final smoke, quota and
observation gates below remain open.

Hosting release `1790785071371000`, version `a05d7c90c6acf93e`, became live at
16:17:51Z. The public HTML matched the reviewed export, HTTP 200 and 32 asset
references passed. The owner completed fresh admin/TOTP login; overview,
destinations, content search and route details rendered successfully. The hosted
admin entry does not expose the mobile Places search flow, so that live provider
smoke is performed on mobile. No admin content mutation was used as a test.

OTA candidate `a351fe63-9056-4967-a9c3-f32bc54b2642` was inspected, then those
exact assets were promoted as production group
`84716ba6-7100-4277-bb6e-87f29fcabc1e` at 16:58:18Z. Both public delivery hashes
were independently verified. Runtime/channel are `1.4.0` / `production`, with
unchanged Android 1.1.0 build 12 and iOS 1.1.3 build 34. Device application remains
unverified until the owner completes the post-update smoke. The previous verified
group is `545d5795-a7e6-43ab-98ab-4534b9dd547f`; no new native build was made.

All nine Functions were independently ACTIVE at 17:05:57Z. Node 22, callable
App Check environment enforcement and capacity settings remain
unchanged. Eight callables retain maxInstances 1/concurrency 4; the background
worker retains 3/1. The other 137 deployed Functions kept their revisions.

| Target | Verified serving revision |
| --- | --- |
| searchPlaces | `searchplaces-00032-goj` |
| resolvePlaceSelection | `resolveplaceselection-00040-fod` |
| resolveRecommendationDestination | `resolverecommendationdestination-00056-gen` |
| saveRecommendation | `saverecommendation-00064-yot` |
| publishRecommendationDraft | `publishrecommendationdraft-00030-fip` |
| saveRoute | `saveroute-00060-fiv` |
| publishRouteDraft | `publishroutedraft-00026-qoq` |
| computePrivateTripRoute | `computeprivatetriproute-00003-wal` |
| onBackgroundOperationWritten | `onbackgroundoperationwritten-00004-wob` |

### Reviewed allocations and accounting evidence

Current/next-month records were created atomically and independently read back.
September manifest SHA256 is
`1c3010fd1695e4520619c762294539b4eb38988f67d64c20a6ccb9b723056c8b`;
October is `85b0ac39818a10e93b13b1aff7cee21d578a42e21e19dfdfadf5b16c7606f043`.
Telemetry was refreshed at 16:30:58Z for all three billing-account projects.
Its documented 1,800-second ingest delay no longer overlapped the old unlimited
Routes quota. September includes every observed attempt (even failures), counts
all GetPlace calls against every possible Details SKU, and adds one full unchanged
daily project quota for delayed reporting plus rollout. Prior usage was not zeroed.

| SKU | September baseline including rollout reserve | Monthly limit |
| --- | ---: | ---: |
| Autocomplete | 535 | 10,850 |
| Details Essentials | 378 | 9,000 |
| Details Pro | 378 | 4,500 |
| Details Atmosphere | 378 | 1,030 |
| Geocoding | 328 | 9,000 |
| Routes Essentials | 340 | 9,000 |
| Routes Pro | 340 | 4,500 |

October had not started; its zero prior-use baseline is bounded by the manifest's
September 30 20:00Z rollout deadline, before October 1 07:00Z Pacific midnight.
The same monthly limits apply. Future sibling usage remains a forecast with 10%
shared free headroom, not an enforced account-wide bound. Both sibling projects
remain unchanged. Before November 1 07:00Z, Doric must review fresh prices, account
usage and forecasts and explicitly prepare November; missing records fail closed.

The allocation CLI originally constructed a custom access-token credential that
Firebase Admin's Firestore client does not support. It now reuses the repository's
Application Default Credentials initializer. The active ADC identity was verified
as the authorized operator; no credential was created, copied or printed. Seven
focused tests and live read-only reuse for both allocations passed. Dry-run/apply
hash gates and counter preservation are unchanged. The reviewed creation used the
same exported allocation executor with that initializer, and verified all records.

### Delivered monitoring and remaining gates

The five previous alert policies were preserved and four provider policies enabled.
The initial synthetic log produced no proven incident. A second tagged synthetic
event against an existing revision opened incident `0.od8nmlr4isfn` at 16:25:07Z
under policy `12940691982399578384`; the owner confirmed the email arrived.
This verifies the new operational delivery path without creating real exhaustion,
a server failure or service-account key. It does not prove a billing-alert email.
The ILS 75 project-filtered Cloud budget and existing thresholds were read back.

No Functions WARNING-or-higher logs were found from 16:58:30Z through the first
post-deploy check at 17:05:57Z. This alone does not prove a successful provider call.
Mobile search/selection, draft recovery and existing-item save results, counter
increments and routing smoke remain pending. Places expansion is still held at
the old daily/minute values until guarded positive-call evidence is available.
After expansion, verify all 24 quota controls and observe for 30 minutes before
closing. The synthetic alert must be excluded from incident assessment.
