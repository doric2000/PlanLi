# PlanLi Agent Guide

Repository-wide guidance for PlanLi. A closer `AGENTS.md` supplements and
overrides this file for its subtree. Keep temporary incidents, deployment state,
and release notes in `README.md` or the current task—not in agent guidance.

## Project and scope

PlanLi is a Hebrew-first, RTL-first, photo-centric travel application.

- `client/`: Expo/React Native for iOS, Android, Web, and the hosted admin UI.
- `functions/`: Firebase Functions, scheduled jobs, scripts, and backend tests.
- `server/`: local Google Places proxy for Web development.
- Root Firebase files: Firestore/Storage rules, indexes, CORS, and lifecycle data.
- `README.md`: operational source of truth for setup, deployment, and release state.

Read `client/AGENTS.md` for client work and `functions/AGENTS.md` for backend
work. Prefer existing feature boundaries, services, helpers, and style tokens.

## Durable architecture and security

Use one production schema. Do not create permanent versioned branches, duplicate
schemas, bucket fallbacks, or temporary client-write paths.

```text
users/{uid}
publicProfiles/{uid}
recommendations/{id}/{likes|comments}/{id}
routes/{id}/days/{dayId}/stops/{stopId}
routes/{id}/{likes|comments}/{id}
trips/{id}
countries/{countryId}/destinations/{destinationId}
users/{uid}/favorites/{sha256(target.path)}
users/{uid}/notifications/{notificationId}
users/{uid}/blockedUsers/{blockedUid}
system/**
```

- `users` is private; `publicProfiles` contains approved public fields only.
- Destination IDs are stable hashes; names and provider IDs are attributes.
- Likes, comments, route days, and stops stay in subcollections, not arrays.
- Business writes go through callable Functions; client access remains least privilege.
- Public queries expose only active content, destinations, and public profiles.
- `system/**`, private profiles, favorites, notifications, and jobs are private.
- Firestore does not cascade-delete children; deletion must remain complete and resumable.
- Never weaken Auth, Rules, Storage, App Check, ownership, or role checks to pass a flow.
- Secrets belong in Secret Manager or ignored environment files. Never commit keys,
  tokens, service-account JSON, credentials, production data, or audit output.

Preserve these deployment boundaries unless an approved task changes them:

- Firestore database: `eur3`.
- Functions: v2, `europe-west1`, Node.js 22, `minInstances: 0` by default.
- Active media bucket: `planli-f0b12-media-eu` in `europe-west1`; the former US
  bucket is rollback-only.

## Tools, MCP, and skills

Use the smallest relevant capability; more tools are not automatically better.

- Firebase work: load the applicable official Firebase skill, then use Firebase MCP
  for authenticated project or deployed state. Inspect code first for local behavior.
- Expo/EAS work: inspect installed versions, use Expo MCP for project/build state,
  and use official Expo documentation when no applicable Expo skill is installed.
- Hosted admin/Web behavior: use the browser skill to exercise the rendered UI.
- GitHub PRs/checks: use the GitHub plugin when available.
- Codex configuration: use official OpenAI documentation or the OpenAI Docs skill.
- Use a security diff review only for Auth, Rules, Storage, admin authorization,
  deletion, secrets, or an explicitly requested security review.
- Use `/review` once for the selected diff scope; it does not replace tests or runtime QA.

Before environment-dependent Firebase or EAS work, verify the account, project,
repository, and intended environment. MCP access never authorizes deployment,
production writes, IAM changes, migrations, builds, submission, or deletion.

## Change discipline

Canonical workspace:

```text
C:\Users\doric\Documents\PlanLi\PlanLi
```

Before editing, inspect the Git root, status, branch, and worktrees. Preserve all
unrelated work. Do not stash, reset, rewrite, move, or delete it without explicit
authorization. Do not create extra worktrees or clones as a workaround.

- Diagnose before editing and make the smallest root-cause change.
- One topic per branch; do not mix refactors, upgrades, or formatting sweeps.
- Inspect installed versions before changing version-sensitive APIs.
- Do not upgrade dependencies unless required by the task and reviewed.
- Migration/IAM scripts stay dry-run by default and require explicit apply authority.
- If a check hangs or fails, diagnose it; do not repeatedly rerun heavy commands.

## Risk-based validation

Choose the lowest level that covers the changed boundary. State the chosen level.

### Level 0 — documentation/configuration

For Markdown, `AGENTS.md`, and secret-free Codex configuration only:

- inspect the diff, instruction sizes, and configuration syntax;
- run `git diff --check` and Git status checks;
- do not run application tests, exports, emulators, `/review`, or remote builds.

### Level 1 — focused change (default)

- Run only directly affected tests.
- Exercise the changed runtime path when practical, especially UI async/error states.
- Review the diff manually; no separate `/review` is required.

### Level 2 — subsystem or cross-boundary change

- Run related test groups and the relevant export/emulator/runtime check.
- Run one `/review` against the base branch after tests.
- Apply the subsystem-specific triggers in the nested `AGENTS.md`.

### Level 3 — release

- Run full affected suites, relevant emulators/exports, and critical runtime smoke flows.
- Run one `/review`; add a security diff review only when the change is sensitive.
- Remote builds, deployment, and store submission still require explicit authorization.

Tests passing alone do not prove runtime behavior. Report what was actually exercised
and what remains unverified. Do not invent lint/typecheck commands absent from scripts.

## Git order

Never work directly on `main`. Use `feat/`, `fix/`, `refactor/`, `test/`, `docs/`,
or `chore/` branches and Conventional Commits.

1. Inspect root, status, branch, worktrees, and unrelated changes.
2. Fast-forward a clean `main`, then create the topic branch.
3. Implement one topic and run its validation level.
4. Review the final diff for regressions, secrets, debug code, and generated files.
5. Stage explicit paths only; never use broad `git add` in a mixed worktree.
6. Run `git diff --check`, `git status --short`, and `git diff --cached --name-status`.
7. Commit, push, open a PR, or merge only when each action is authorized.
8. Never rebase, reset, stash, force-push, bypass checks, or merge conflicts implicitly.

Implementation authorization alone does not imply deployment, EAS build, OTA,
TestFlight/App Store submission, IAM changes, migrations, or destructive live work.

## Deployment and completion

Repository state is not deployment state. Before an authorized release, read
`README.md`, verify project/branch/commit/live state, and use the safe dependency
order. Deploy backend or Hosting only from the appropriately updated target branch.

Treat the `README.md` current environment status and release record as mandatory
release outputs. Without waiting for a separate reminder, update them whenever an
authorized workflow changes the app version, native build, EAS build/submission,
EAS Update, TestFlight/App Store status, deployed backend, or installed tester
state. Record the source commit, app version and build number, runtime/channel,
provider IDs, timestamps, review state, installed/tested state, and OTA group when
known. Mark unverified values explicitly instead of retaining a stale value. A
release task is not complete until this record reflects the resulting live state;
this documentation requirement does not itself authorize a build, submission,
deployment, migration, or other release action.

Final reports should be short and evidence-based:

- changes and root cause;
- validation level, checks, and runtime behavior exercised;
- anything not verified;
- exact Git and deployment/release state.

Do not call work live, deployed, released, or verified beyond the available evidence.
