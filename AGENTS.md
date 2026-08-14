# PlanLi Agent Guide

**Mandatory startup rule:** read this entire file at the beginning of every new chat and every new task before planning, changing files, or running repository-changing commands. Do not rely on memory, a previous chat, or a compacted summary. If this file changes during a task, reread it before continuing.

Keep changes focused, preserve unrelated user work and supplied assets, and update this guide when an architectural or workflow rule changes. These rules apply to the main agent and every delegated agent.

## Project map

PlanLi is a Hebrew-first, RTL-first, photo-centric travel app.

- `client/`: Expo/React Native app for Web, Android, and iOS.
- `functions/`: Firebase callable functions, triggers, scheduled jobs, maintenance scripts, and tests. Use Node.js 22.
- `server/`: local Google Places proxy used by Web development.
- Root Firebase files: Firestore/Storage rules, indexes, targets, CORS, and lifecycle configuration.
- `README.md`: operator runbook for local startup, audits, migrations, deployment, and temporary rollback deadlines.

Use the existing feature structure, hooks, services, shared components, and style tokens before adding abstractions. Keep feature code in `client/src/features`, shared services in `client/src/services`, and all `StyleSheet.create` definitions in `client/src/styles`. Visible UI is Hebrew unless the surrounding surface is intentionally English; preserve RTL layout, safe areas, test IDs, and navigation route names.

## Canonical data model

There is one production schema, with no permanent `v1`/`v2` compatibility branches:

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
system/**
```

- `users` is private. `publicProfiles` exposes only approved public identity/profile fields and is synchronized by the server.
- Destination IDs are stable hashes. Names, ISO codes, and provider IDs are attributes, never document IDs.
- Likes and comments are subcollections; do not add `likedBy` arrays. Parent `stats` counters are server-maintained.
- Favorites use a deterministic key and server-built preview so a tab loads with one query. Source triggers refresh previews and delete favorites when their source disappears; the scheduled repair handles rare misses.
- Routes keep days/stops in subcollections; do not grow unbounded arrays in the parent document.
- `system/**` is server-only. Do not create ad-hoc migration or synchronization collections.

## Backend and security boundaries

- Firestore is in `eur3`; Functions run as v2 functions in `europe-west1` with `minInstances: 0`.
- Business writes go through callable Functions. The client must not directly write recommendations, routes, trips, favorites, reactions, comments, notifications, public profiles, or destination catalog documents.
- Every write validates authentication, email verification where required, ownership/role, allowed fields, document sizes, referenced paths, and server timestamps. Keep operations idempotent and rate-limited.
- Public reads expose only active content, destinations, and public profiles. User documents, favorites, notifications, jobs, and `system/**` remain owner/server-only.
- Deletion must remove subcollections, favorites, notifications, and media before the parent. Firestore does not cascade-delete subcollections. Account deletion remains a resumable server job.
- Place selection is preview-only on the client. The server revalidates Google Place IDs and resolves the country. Israel policy maps Ariel, Judea and Samaria, East Jerusalem, and the Golan Heights to `IL`; Gaza is excluded. Fallback order is place, city, Google reverse geocoding, local borders, then nearest border.
- Country currency/region comes from REST Countries with the pinned `countries-list` fallback. Scheduled synchronization may update only `currencyCode` and `region`.
- Secrets belong in Google Secret Manager or ignored local `.env` files. Never commit API keys, service-account JSON, credentials, tokens, migration state, audit output, or production data. Local Admin scripts use Firebase CLI/ADC; Cloud Functions use the dedicated keyless core/media service accounts.
- App Check enforcement remains off only during the first private Development Build and preview validation. Configure valid Web/Android/iOS providers and private debug tokens before public release.
- Authentication has one client state machine in `AuthProvider`: `loading`, `guest`, `emailVerificationRequired`, `accountSetupRequired`, `preferencesRequired`, and `ready`. Protected client actions call `requireCapability`; do not add screen-local auth redirects or parse server error text.
- Guest-facing login, registration, and password-reset screens live in the nested `Auth` tab navigator so the bottom tab bar remains available. External entry points use `openAuthFlow`; do not restore duplicate root-stack auth screens.
- Every callable Function declares exactly one access level: `public`, `signedIn`, or `active`. `active` requires an eligible verified token, current profile-details and legal-consent versions, and completed travel preferences. Ownership and admin checks remain service-local.
- Travel preferences may be written only after the current profile details and legal consent are complete and password-email accounts are verified. A display name may be changed once after initial account setup, only with a verified email, and the server records the consumed change in `users/{uid}.profileManagement.displayNameChangedAt`.
- Current auth/legal versions are duplicated intentionally in `client/src/constants/authPolicy.js`, `functions/authPolicy.js`, and `storage.rules`; update all three plus the in-app and hosted legal drafts in one focused change. Existing users are gated lazily, without a backfill.

## Media and Storage

- Active media bucket: `planli-f0b12-media-eu` in `europe-west1`.
- The former US bucket is read-only rollback storage. Never write to or delete it until the rollback period documented in `README.md` has ended, `npm run audit-live` reports zero references, and the user explicitly authorizes deletion.
- Clients upload JPEG source files only to user-owned staging paths. `prepareMedia` strips EXIF/GPS data and creates immutable WebP `large`, `feed`, and `thumb` variants directly from the source.
- Details/heroes use `large`; full-width cards and edit previews use `feed`; grids, maps, favorites, and avatars use `thumb`.
- Preserve cached rendering, bounded list mounting, and the three-image carousel window. Do not prefetch complete feeds or carousels.

## Task startup and workspace

- The one canonical workspace is `C:\Users\doric\Documents\PlanLi\PlanLi`. Before any task, run `git rev-parse --show-toplevel` and confirm it resolves to this folder, then inspect `git status --short --branch` and `git worktree list`.
- Always work in that existing `PlanLi` folder. Never run `git worktree add`, create a linked worktree, clone/copy the repository, or create a sibling task folder. An alternative folder is forbidden as a workaround for branch conflicts, dirty files, parallel work, or convenience. Only a new, explicit user instruction that names the exception for the current task can override this rule.
- Do not enter or modify any previously created alternate PlanLi worktree. If `git worktree list` shows another worktree, report it and continue only in the canonical folder; do not remove it without explicit authorization.
- Before starting a topic, check whether the current branch, an open PR, or unmerged commits belong to an unfinished topic. Finish the mandatory closure sequence below before starting new work. A new request does not silently authorize mixing topics in one branch.
- Create or switch to a correctly named topic branch in the same canonical worktree before making changes. Keep one topic per branch and one branch per topic.
- If the existing worktree contains unrelated or uncommitted changes, preserve them in place and work around them. If the required branch operation cannot be completed safely without moving, stashing, overwriting, or mixing those changes, stop and ask the user for direction; do not create another folder as a workaround.
- Fetch the target branch when network access is available. Synchronize a clean local `main` with `git pull --ff-only`; if histories diverge, stop and diagnose instead of creating an implicit merge commit.
- Do not rebase, reset, stash, force-push, or rewrite another task's work without explicit user authorization. Never bypass branch protection or required checks.

## Change discipline

- Diagnose before editing and keep focused fixes focused. Do not rewrite unrelated user changes in a dirty worktree.
- Do not combine opportunistic refactors, dependency updates, formatting sweeps, or unrelated bug fixes with the active topic. Record them for a later topic after the current PR is merged.
- Reuse existing validation helpers and service boundaries. Add tests for changed behavior and security rules.
- Migration and IAM scripts are dry-run by default. Require explicit `--apply`; retain checkpoints/rollback data until post-migration audit passes. Never deploy, migrate live data, delete rollback data, or broaden IAM without explicit user authorization.
- Pin backend dependencies that affect data interpretation. Review lockfile and audit changes; do not apply unverified major upgrades merely to silence an audit warning.
- Do not introduce a second schema, bucket fallback, or client write path as a temporary shortcut.

## Validation

Run the smallest relevant set first. Target the exact test files that cover the changed behavior and expand only when the change is cross-cutting, the targeted tests expose a wider regression, or release preparation explicitly calls for a full pass. Do not run full suites, exports, emulators, audits, or native builds by default for a focused JavaScript or service change. Commands are PowerShell and must run from the shown directory.

Focused client changes, from `client/`:

```powershell
npm.cmd test -- --runInBand __tests__\RelevantScreen.test.js __tests__\RelevantService.test.js
```

Use the full client suite only for shared runtime, navigation infrastructure, dependency, or release-readiness changes. Run an Expo export only when app configuration, native dependencies, assets, bundler behavior, or an entry point changed. Run the stylesheet-location scan only when components or styles changed.

Focused Functions changes, from `functions/`:

```powershell
node --test relevantService.test.js relevantPolicy.test.js
```

Use the full Functions suite only for shared callable infrastructure, multi-service changes, dependency changes, or release readiness. Rules changes require the relevant emulator tests. `audit-live` is read-only and runs only for data, favorites, counters, destination IDs, or Storage changes. Media changes require Web plus one relevant native export and an upload/display/delete smoke test. Migration scripts must pass dry-run before `--apply`. Dependency audits run when dependencies or lockfiles change, during release preparation, or when the task explicitly requests them.

Before every commit, from the repository root:

```powershell
git diff --check
git status --short
git diff --cached --name-status
```

Confirm only intended files are staged and scan staged content for secrets. Documentation-only changes do not require application tests, but still require the Git checks.

## Git conventions

- Do not work directly on `main`. Use `feat/<kebab-case>`, `fix/<kebab-case>`, `refactor/<kebab-case>`, `test/<kebab-case>`, `docs/<kebab-case>`, or `chore/<kebab-case>`.
- Use Conventional Commits, for example `feat(favorites): add canonical server preview`, `fix(storage): block US uploads`, or `docs(agents): document validation workflow`.
- Stage explicit paths; avoid `git add -A` in a mixed worktree. Never commit generated exports, caches, logs, local credentials, or migration reports.
- The user has issued a standing repository instruction to complete the Git lifecycle automatically whenever a topic is finished. For the focused changes of the current topic, this is standing authorization to commit, push, open a ready PR, wait for required checks, and merge without waiting for another `PR and merge` reminder.
- That standing authorization does not include deployment, app-store submission, live-data changes, migrations, destructive cleanup, force-pushes, protection bypasses, or unrelated changes. Those actions still require explicit authorization for the current task.
- Before a PR, fetch its target and inspect the complete commit list and diff against `origin/<base>`. Confirm that the PR contains only the intended task and search for an existing PR from the same branch.
- Open a ready-for-review PR for completed work. Use a focused summary, validation results, deployment or migration notes, security impact, and known limitations. Use a draft only when the user explicitly asks to publish incomplete work.
- Before pushing, verify the branch, staged paths, commits, and validation results. Report these after the operation or when requesting authorization.

## Mandatory topic closure gate

A topic is not complete, and work on a new topic must not begin, until all applicable steps below are complete:

1. Finish the scoped implementation and relevant tests. Review the entire working-tree and staged diff for unrelated files, generated artifacts, secrets, and accidental deletions.
2. Commit only the intended paths with a Conventional Commit, push the topic branch, and open a ready PR against the correct base.
3. Confirm the PR diff and commit list match the reviewed local diff. Resolve review comments and wait for every required status check to pass.
4. Merge the PR using an allowed repository merge method. Never merge a failing, conflicted, draft, or unexpectedly broadened PR, and never bypass protections merely to finish faster.
5. Confirm the PR is actually merged and closed. In the same canonical folder, switch to `main`, run `git pull --ff-only`, and verify that the merge is present, `git status --short --branch` is clean, and `git worktree list` still points work at the canonical folder only.
6. Report the PR link, merge result, final validation status, and exact deployment/release state. Do not say a fix is `live` merely because it is merged.

If credentials, conflicts, required checks, reviews, or GitHub availability prevent closure, the topic remains open. Report the blocker and do not start another topic unless the user explicitly cancels, supersedes, or authorizes an emergency exception. If the user sends a new topic while closure is pending, first state what remains and complete or unblock the existing lifecycle; never mix the new work into the open branch.

## Deployment and release truthfulness

- The active native development workflow is an installed, signed EAS Development Build using Metro; Expo Go is unsupported because the client includes native Google and Apple authentication. There is no active production, preview/internal-distribution, EAS Update/OTA, App Store, TestFlight, or Google Play release channel. Do not create or submit another build or update unless the user explicitly authorizes that named build or release.
- Merge first. Deploy backend, rules, indexes, or hosting only from the updated `main` branch and only when the user has explicitly authorized deployment for that task. Verify the selected Firebase project, region, deployed targets, and post-deploy health.
- Client code is not on a phone merely because it was merged or exported. State whether activation requires a Metro/Expo reload, an eligible over-the-air update, or a new store/internal build, and do not claim delivery until that step is actually complete.
- When a change requires both backend and client rollout, state and follow the safe order explicitly. A backend fix is not effective in production until deployed; a client fix is not effective for users until distributed.
