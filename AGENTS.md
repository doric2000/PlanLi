# PlanLi Agent Guide

Repository-wide instructions for PlanLi. Treat applicable `AGENTS.md` files as authoritative. A closer `AGENTS.md` overrides this file for its subtree. If subsystem-specific rules grow, move them to `client/AGENTS.md` or `functions/AGENTS.md` instead of expanding this root guide.

Keep this file for durable architecture, safety, and workflow rules only. Temporary incidents, deployed versions, release/App Check state, and one-off task notes belong in `README.md` or the task context.

## Project map

PlanLi is a Hebrew-first, RTL-first, photo-centric travel app.

- `client/`: Expo / React Native for Web, Android, and iOS.
- `functions/`: Firebase callable functions, triggers, scheduled jobs, scripts, and tests. Node.js 22.
- `server/`: local Google Places proxy for Web development.
- Root Firebase files: Firestore/Storage rules, indexes, targets, CORS, and lifecycle config.
- `README.md`: operator source of truth for startup, migration, rollback, deployment, and current release state.
- Native testing uses an EAS Development Build with Metro. Expo Go is unsupported because native Google/Apple auth is included.
- The admin console is the same responsive client surface used on iOS and Firebase Hosting `/admin`.

Prefer existing feature structure, hooks, services, shared components, and style tokens.

- Feature code: `client/src/features`
- Shared services: `client/src/services`
- `StyleSheet.create`: `client/src/styles`
- Visible UI is Hebrew unless intentionally English.
- Preserve RTL, safe areas, test IDs, navigation route names, and accessibility behavior.

## Canonical data and security model

One production schema only. Do not introduce permanent `v1`/`v2` branches, duplicate schemas, bucket fallbacks, or temporary client-write paths.

```text
users/{uid}
publicProfiles/{uid}
recommendations/{id}/{likes|comments}/{id}
routes/{id}/days/{dayId}/stops/{stopId}
routes/{id}/{likes|comments}/{id}
trips/{id}
countries/{cty_hash}/cities/{city_hash}
users/{uid}/favorites/{sha256(target.path)}
users/{uid}/notifications/{notificationId}
users/{uid}/blockedUsers/{blockedUid}
system/**
```

- `users` is private; `publicProfiles` exposes only approved public fields and is server-synchronized.
- Destination IDs are stable hashes. Names, ISO codes, and provider IDs are attributes, never document IDs.
- Likes/comments are subcollections; never add unbounded `likedBy` arrays. Parent `stats` are server-maintained.
- Routes keep days/stops in subcollections; never grow unbounded parent arrays.
- Favorites use deterministic keys and server-built previews; source triggers refresh/delete them and scheduled repair handles rare misses.
- Posts/comments use `active`, `moderation_hold`, `suspended`, or `deleting`; public queries must filter `status == active`.
- `system/**` is server-only. Moderation/audit/review jobs live under `system/moderation/**`; provider retry state stays under `system/runtime/destinationJobs/**`.

Backend boundaries:

- Firestore: `eur3`.
- Functions: v2, `europe-west1`, `minInstances: 0` unless an approved scaling change says otherwise.
- Business writes go through callable Functions. The client must not directly write recommendations, routes, trips, favorites, reactions, comments, notifications, public profiles, or destination catalog documents.
- Every write validates auth, required email verification, ownership/role, allowed fields, sizes, referenced paths, and server timestamps. Keep writes idempotent and rate-limited.
- Public reads expose only active content, destinations, and public profiles. Private user data, favorites, notifications, jobs, and `system/**` remain owner/server-only.
- Never weaken Firestore, Storage, Auth, or App Check protections merely to make a failing flow pass.
- Firestore does not cascade-delete subcollections. Delete child data, favorites, notifications, and media before parents. Account deletion remains resumable.

## Auth, Places, moderation

Auth uses one `AuthProvider` state machine:

`loading` → `guest` / `emailVerificationRequired` / `accountSetupRequired` / `preferencesRequired` / `ready`

- Protected client actions use `requireCapability`; do not add screen-local auth redirects or parse server error text.
- Guest login/registration/password-reset screens stay in the nested `Auth` tab navigator. External entry points use `openAuthFlow`.
- Each callable declares exactly one access level: `public`, `signedIn`, or `active`.
- `active` requires an eligible verified token, current profile/legal versions, and completed travel preferences.
- Travel preferences require current profile/legal completion and verified password-email accounts.
- Display name may change once after initial setup, only with verified email; record `users/{uid}.profileManagement.displayNameChangedAt`.
- Auth/legal versions intentionally exist in `client/src/constants/authPolicy.js`, `functions/authPolicy.js`, and `storage.rules`; update all three plus in-app/hosted legal drafts together. Existing users are gated lazily without backfill.

Places:

- Client place selection is preview-only; server revalidates Google Place IDs and resolves country.
- Israel policy maps Ariel, Judea and Samaria, East Jerusalem, and the Golan Heights to `IL`; Gaza is excluded.
- Destination fallback: place → city → Google reverse geocoding → local borders → nearest border.
- Currency/region comes from REST Countries with pinned `countries-list` fallback; scheduled sync may update only `currencyCode` and `region`.

Moderation/admin:

- Posts/comments/public profiles share one report flow. Reports use a deterministic target-path hash and never expose reporter identity to clients.
- Three unique reporters within 24h auto-hold posts only; comment/profile reports await admin action.
- Blocks are private/server-written and filter content, comments, and notifications for the blocking user.
- Admin uses one `admin` custom claim mirrored in `system/moderation/admins/{uid}`. Destructive admin actions require recent auth, reason, self-action prevention, last-admin protection, and append-only audit.
- Suspension disables Auth, revokes refresh tokens, marks the private profile suspended, removes the public profile, and hides existing posts/comments. Unsuspension never republishes automatically.
- New destinations enter the quality queue. Core identity errors block approval; other provider/media/cache issues remain warnings. Deactivation removes the catalog entry and holds linked content for review.

## Secrets, Firebase MCP, and version-sensitive APIs

Secrets belong in Google Secret Manager or ignored local `.env` files. Never commit API keys/private tokens, service-account JSON, credentials, migration state, audit output, or production data. Local Admin scripts use Firebase CLI/ADC; Cloud Functions use dedicated keyless core/media service accounts.

### Firebase MCP

For Firebase configuration, Auth, Firestore, Functions, Rules, Storage, Crashlytics, or project/deployed state, use Firebase MCP when it can establish real state instead of guessing from repository code or memory.

Before environment-dependent Firebase work:

1. Verify authenticated Firebase account.
2. Verify active Firebase project.
3. Verify repository/project directory.
4. Prefer read-only inspection first.

MCP access does not authorize deployment, production writes, migrations, destructive cleanup, IAM changes, rule broadening, or rollback deletion. Those require explicit authorization for the current task.

Do not hardcode temporary App Check, TestFlight, OTA, build, or deployment state here. For release/deployment tasks, inspect the live/current environment and read `README.md`.

### Version-sensitive implementation

Before introducing/changing framework APIs:

1. Inspect installed Expo, React Native, React, Firebase, and relevant package versions.
2. Inspect existing successful repository patterns.
3. Prefer established project APIs/abstractions.
4. If behavior is version-sensitive, unfamiliar, deprecated, or uncertain, use official docs or installed agent skills instead of guessing.

Do not upgrade dependencies unless the task requires it and compatibility impact is reviewed.

## Media and Storage

- Active bucket: `planli-f0b12-media-eu` in `europe-west1`.
- Former US bucket is read-only rollback storage. Never write to it. Delete only after the `README.md` rollback period ends, `npm run audit-live` reports zero references, and the user explicitly authorizes deletion.
- Clients upload JPEG sources only to user-owned staging paths.
- `prepareMedia` strips EXIF/GPS and creates immutable WebP `large`, `feed`, and `thumb` variants.
- Destination admin uploads use the same pipeline; a media-service callable copies variants to `destinations/{countryId}/{cityId}/{assetId}/` before deleting temporary copies.
- Details/heroes use `large`; full-width cards/edit previews use `feed`; grids/maps/favorites/avatars use `thumb`.
- Preserve cached rendering, bounded list mounting, and the three-image carousel window. Do not prefetch full feeds/carousels.

## Workspace and change discipline

Canonical workspace:

```text
C:\Users\doric\Documents\PlanLi\PlanLi
```

Before repository-changing work:

```powershell
git rev-parse --show-toplevel
git status --short --branch
git worktree list
```

- Confirm the canonical root and identify unrelated/uncommitted work before editing.
- Work only there unless the user explicitly names an exception.
- Do not create clones, sibling task folders, or additional worktrees as a workaround.
- If another PlanLi worktree exists, do not enter, modify, or remove it without explicit authorization.
- Never discard, move, stash, reset, overwrite, or rewrite unrelated user work without explicit authorization.
- If branch operations are unsafe because unrelated work is present, report the blocker.
- Diagnose before editing; make the smallest root-cause change.
- Reuse existing validation helpers, hooks, services, and boundaries before adding abstractions.
- Do not mix refactors, upgrades, formatting sweeps, or unrelated fixes into the active topic.
- Migration/IAM scripts are dry-run by default and require explicit `--apply`; preserve checkpoints/rollback data until audit passes.
- Pin backend dependencies that affect data interpretation; review lockfile/audit changes and do not apply unverified major upgrades merely to silence warnings.

## Bug and feature workflow

### Bugs/regressions

1. Reproduce the failure when possible, or establish it from logs/tests with enough evidence to trace.
2. Trace the relevant path end-to-end: UI/state → service → callable/backend → Firestore/Storage/Rules as applicable.
3. Identify the root cause and violated invariant before editing.
4. Add/identify a regression test that fails for the reported behavior when practical.
5. Make the smallest root-cause fix.
6. Run the regression test and nearest related tests.
7. Verify actual user-visible/runtime behavior when practical.
8. Review the final diff for adjacent regressions, stale state, races, fallbacks, unintended reads/writes, and unrelated edits.
9. If runtime behavior was not reproduced/verified, say so; never claim a fix solely because code/tests look correct.

For ambiguous Firebase errors, auth-state bugs, permission failures, or data-shape mismatches, inspect real Firebase state with MCP when useful before changing code/rules.

### Non-trivial features

1. Inspect architecture, current implementation, installed versions, and affected tests.
2. Define intended behavior and affected invariants.
3. Implement the smallest coherent vertical slice.
4. Add/update tests for changed behavior/security boundaries.
5. Run targeted validation.
6. Verify requested runtime flow when possible.
7. Perform a separate skeptical review of the completed diff.
8. Fix confirmed review issues only; do not broaden scope opportunistically.

For cross-cutting work, consider client state, backend access, data model, rules, migrations, backward compatibility, and iOS/Android/Web impact.

## Validation and Definition of Done

Start with the smallest relevant checks. Expand for cross-cutting/shared infrastructure, wider regressions, dependency/rules/data/storage changes, or release readiness.

Client, from `client/`:

```powershell
npm.cmd test -- --runInBand __tests__\RelevantScreen.test.js __tests__\RelevantService.test.js
```

- Full client suite: shared runtime/navigation/dependency/release changes.
- Expo export: app config, native dependencies, assets, bundler, or entry-point changes.
- Stylesheet-location scan: only when components/styles change.
- If repository-defined lint/typecheck scripts apply, run them; inspect `package.json` and do not invent script names.

Functions, from `functions/`:

```powershell
node --test relevantService.test.js relevantPolicy.test.js
```

- Full Functions suite: shared callable infrastructure, multi-service/dependency changes, or release readiness.
- Rules changes require relevant Firebase Emulator tests.
- `audit-live` is read-only and applies to data/favorites/counters/destination IDs/Storage changes.
- Media changes require Web + one relevant native export + upload/display/delete smoke test.
- Migrations must pass dry-run before `--apply`.
- Dependency audits run when dependencies/lockfiles change, for release prep, or when requested.

### Runtime verification

Tests passing does not prove the feature works. When possible, verify the actual flow and affected states: loading, empty, error, guest, authenticated, auth/setup gates, success, and retry/re-entry.

For native changes, consider both iOS and Android even if only one is executable locally. Use an existing E2E harness when available; do not add a new E2E framework for a focused fix without approval.

### Definition of Done

Before declaring implementation complete:

- requested behavior is implemented;
- architecture/security invariants hold;
- targeted tests pass;
- relevant lint/typecheck passes when defined/applicable;
- runtime behavior is verified where practical;
- affected loading/error/guest/auth states are considered;
- unintended Firestore reads/writes/callable changes are checked when relevant;
- iOS/Android/Web impact is considered when relevant;
- final working-tree diff is reviewed;
- unrelated edits, generated artifacts, secrets, debug code, and accidental deletions are absent;
- anything not executed/verified is reported explicitly.

For non-trivial changes, do one final review as a skeptical senior React Native/Firebase engineer: regressions, stale state, races, auth edges, rules/permission mismatch, data-shape drift, extra reads/writes, and platform differences.

## Git workflow

- Never work directly on `main`.
- Branch prefixes: `feat/`, `fix/`, `refactor/`, `test/`, `docs/`, `chore/`; use kebab-case.
- One topic per branch; never mix unrelated work.
- Use Conventional Commits.
- Stage explicit paths only. Never use `git add -A`, `git add .`, or `git add --all` in a mixed worktree.
- Never commit generated exports, caches, logs, credentials, migration reports, or audit output.
- Never rebase, reset, stash, force-push, rewrite history, bypass protections, or merge failing/conflicted work without explicit authorization.

Before commit:

```powershell
git diff --check
git status --short
git diff --cached --name-status
```

Confirm intended staged files and scan for secrets. Documentation-only changes skip application tests but still run these Git checks.

### External Git actions

Local implementation/validation can finish without a merged PR. Commit, push, PR creation, review submission, and merge are separate actions; perform only those explicitly authorized for the current task.

Before PR/push, verify branch, intended commits/files, validation results, full diff against the correct base, and whether a PR already exists from the branch. Synchronize clean `main` with `git pull --ff-only`; diagnose diverged history instead of implicitly merging.

A pending PR does not block read-only investigation/planning/discussion of another topic; it does block mixing that topic into the same branch.

## Deployment and release safety

Repository state is not deployment state. A change is not live because it is committed, merged, exported, or locally tested.

Before deployment/release:

1. Read current operator state in `README.md`.
2. Verify Firebase project/environment.
3. Verify branch/commit being deployed.
4. Inspect actual Firebase/EAS release state.
5. State safe rollout order for dependent backend/client changes.
6. Before public release, verify current App Check enforcement/providers and private debug-token handling for applicable platforms.

Explicit authorization is required before deploying Functions/Rules/indexes/Storage/Hosting, modifying live data, IAM changes, rollback deletion, EAS builds/OTA, TestFlight/App Store/Google Play submission, or destructive cleanup.

Deploy backend/rules/indexes/Hosting only from the appropriately updated target branch after authorization.

`client/scripts/exportAdminWeb.js` creates ignored output under `hosting/admin`; build immediately before Hosting deployment and never commit it.

Client code is not on a device merely because it was merged/exported. State whether activation requires Metro reload, OTA, internal build, TestFlight/App Store distribution, or another release step. Never claim production effect until activation/deployment actually occurred and health was checked.

## Final task report

Report:

- what changed;
- root cause for bug fixes;
- tests/validation and results;
- runtime behavior verified;
- anything not verified;
- security/data/deployment implications;
- exact Git state;
- exact deployment/release state.

Do not use `fixed`, `live`, `deployed`, `released`, or `verified` more broadly than the evidence supports.
