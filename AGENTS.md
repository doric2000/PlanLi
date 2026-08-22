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
notificationDevices/{tokenHash}
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

## Focused validation policy

Validate changed behavior and consumers, not the repository by habit.
`npm run validate:changed` covers `main...HEAD` plus working-tree changes.

- Documentation-only work gets diff, instruction-size, and relevant syntax checks;
  no application tests, exports, emulators, `/review`, or remote builds.
- Code work gets direct/transitive tests and the smallest practical runtime proof.
  For UI, cover only changed and relevant error, auth, or async states.
- Rules, indexes, exports, native configuration, and dependencies use their specific
  checks; they do not trigger unrelated suites.
- Full client and Functions suites are explicit release checks only. Commit, push,
  PR, merge, build, and infrastructure retry events do not require reruns.
- Reuse evidence only for an unchanged tested diff and scope; rerun invalidated checks.
- Review the final diff. Run `/review` once only for a final sensitive, shared-contract,
  cross-subsystem, or release diff; it does not replace runtime evidence.
- Keep output bounded: store noisy logs in ignored `.codex_tmp/validation/`, summarize
  passes, and inspect the relevant failure excerpt first.
- With no relevant test, add one for changed logic or report runtime evidence and the
  gap; never substitute an unrelated full suite.

Report what was exercised and unverified. Do not invent absent package scripts.

## Git order

Never work directly on `main`. Use `feat/`, `fix/`, `refactor/`, `test/`, `docs/`,
or `chore/` branches and Conventional Commits.

1. Inspect root, status, branch, worktrees, and unrelated changes.
2. Fast-forward a clean `main`, then create the topic branch.
3. Implement one topic and run the affected validation.
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
