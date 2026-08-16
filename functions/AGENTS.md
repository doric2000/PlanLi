# PlanLi Functions Agent Guide

Applies to `functions/**` and supplements the repository guide.

## Runtime and backend boundaries

- Node.js 22 is required. Confirm the active runtime before Functions, emulator,
  scripts, or Firebase CLI work; unsupported-runtime results are not authoritative.
- Functions are v2 in `europe-west1` with `minInstances: 0` unless an approved
  scaling change says otherwise. Firestore is in `eur3`.
- Every callable declares exactly one access level: `public`, `signedIn`, or `active`.
- `active` requires an eligible verified token, current profile/legal versions,
  and completed preferences.
- Business writes validate auth, verification, ownership/role, fields, sizes,
  references, and timestamps before the first mutation. Keep writes idempotent
  and rate-limited where retry or abuse is possible.
- Return structured `details.reason` values and bounded response shapes. Never
  expose credentials, stack traces, provider errors, reporter identity, or private fields.

## Data, moderation, and deletion

- Private user data stays in `users`; approved public fields are synchronized to
  `publicProfiles`. Client business writes remain disabled.
- Content statuses are `active`, `moderation_hold`, `suspended`, or `deleting`;
  public queries filter to active content.
- Reports use deterministic target hashes and keep reporter identity private.
- Three unique reporters within 24 hours auto-hold posts only; comments and
  profiles await administrator action.
- Admin access uses one custom claim mirrored in the moderation admin collection.
- Destructive admin actions require recent auth, a validated reason, self-action
  prevention, last-admin protection where applicable, and append-only audit.
- Suspension disables Auth, revokes refresh tokens, marks the private profile,
  removes the public profile, and hides existing posts/comments. Unsuspension
  never silently republishes content.
- Account/content deletion removes children, favorites, notifications, and media
  before parents and remains resumable because Firestore does not cascade.
- List/read callables stay side-effect free; repairs belong in explicit maintenance
  scripts, triggers, or scheduled functions.

## Places, destinations, and media

- Client place selection is preview-only; the server revalidates provider IDs,
  resolves country, and applies the existing geopolitical policy.
- Map Ariel, Judea and Samaria, East Jerusalem, and the Golan Heights to `IL`;
  exclude Gaza. Preserve the place → city → reverse geocode → local borders →
  nearest-border fallback order.
- Currency/region comes from REST Countries with the pinned local fallback;
  scheduled synchronization may update only those approved metadata fields.
- Destination IDs remain stable hashes. Core identity errors block approval;
  provider/media/cache issues remain warnings unless policy states otherwise.
- Destination deactivation removes the catalog entry and holds linked content
  for review; it never silently republishes that content later.
- External providers and datasets use bounded timeouts, bounded results, and safe
  caching where repeated admin requests would otherwise redownload data.
- Clients upload JPEG sources only to owned staging paths. `prepareMedia` strips
  EXIF/GPS and creates immutable WebP variants.
- Destination media uses the canonical pipeline and active EU bucket. Never write
  to rollback storage.

## Tool routing and live state

- Load the relevant official Firebase skill before changing Auth, Firestore,
  Storage, Functions, Hosting, Rules, or Crashlytics behavior.
- Use Firebase MCP for authenticated project/deployed state after confirming account,
  project, and repository. Prefer read-only inspection first.
- MCP/CLI access does not authorize deployment, production writes, migrations,
  IAM changes, rule broadening, or destructive cleanup.
- Inspect installed Firebase Admin, Functions, client SDK, and emulator versions
  before version-sensitive changes.
- Never point tests or exploratory scripts at production data.

## Functions validation ladder

Run commands from `functions/` under Node 22.

```powershell
node --test relevantService.test.js relevantPolicy.test.js
```

### Level 0

Documentation or Codex configuration only: no Functions tests or emulators.

### Level 1

- Run only directly affected service/policy tests.
- Use a focused Functions emulator harness only when pure tests cannot prove the
  callable boundary.

### Level 2

- Run related backend test groups.
- Firestore or Storage Rules changes require `npm run test:rules:emulator`.
- Shared callable, auth/claim, trigger, or multi-service changes require their
  nearest integration coverage.
- Media changes require upload/display/delete smoke coverage without production data.
- Run one base-branch `/review`; add a security diff review only for sensitive paths.

### Level 3

- Run the full Functions suite with `npm test`.
- Run relevant Rules/emulator checks and read-only audits when the changed data
  boundary requires them.
- Migrations must pass dry-run before any separately authorized `--apply`.
- Dependency audits apply when dependencies/lockfiles change or for release readiness.

## Deployment gate

Deploy only when explicitly authorized and only from the appropriately updated
target branch. Before deployment, verify Node 22, Firebase identity/project,
branch/commit, affected targets, parameters/secrets, and rollout order. Deploy only
the affected Functions/Rules/Hosting targets, then check logs and runtime health.

Never treat a successful local test, commit, merge, export, or MCP read as evidence
that backend behavior is live.
