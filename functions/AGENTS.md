# PlanLi Functions Agent Guide

This file applies to `functions/**` and supplements the repository guide.

## Runtime and tool routing

- Node.js 22 is required. Confirm `node --version` before running Functions, emulator, or Firebase CLI commands; do not treat results from an unsupported runtime as authoritative.
- Use the relevant official Firebase skill before changing Authentication, Firestore, Storage, Functions, Hosting, or Rules. Use Firebase MCP for authenticated project/deployed state when available, after confirming account, project, and repository. MCP access never grants deployment, IAM, migration, or destructive-write authority.
- Inspect the installed Firebase Admin, Functions, client SDK, and emulator versions before changing version-sensitive APIs.
- Do not weaken access checks, Rules, recent-auth requirements, App Check, ownership, role checks, or validation to make a test pass.

## Callable and admin requirements

- Every callable declares exactly one access level and an explicit timeout when work can exceed the default client deadline.
- Validate all identifiers, reasons, booleans, roles, and allowed fields before the first external mutation.
- Destructive admin actions require recent authentication, a validated reason, self-action prevention, last-admin protection where applicable, and append-only audit.
- Keep list/read callables side-effect free. Scheduled or explicitly named maintenance functions perform scans and repair writes.
- Return structured `details.reason` values and bounded public response shapes. Never expose reporter identities, private user fields, credentials, stack traces, or provider errors.
- External datasets and providers need bounded timeouts, bounded results, and safe warm caching when repeated admin actions would otherwise redownload the same source.

## Efficient test ladder

Run focused Node tests first from `functions/`:

```powershell
node --test relevantService.test.js relevantPolicy.test.js
```

- Rules changes require the focused Firestore/Storage emulator tests.
- Callable integration behavior may use the Functions emulator harness when the changed boundary cannot be proven with service tests.
- Run the full Functions suite only for shared callable infrastructure, dependency changes, broad cross-service changes, or release readiness.
- Never point tests at production data or perform destructive live admin actions.

## Review gate

After targeted tests, review the base-branch diff for validation order, partial failure, idempotency, timeouts, retries, auth/claim edges, data-shape drift, excess reads/writes, and cleanup completeness. For Auth, admin, Rules, Storage, deletion, or other security-sensitive diffs, also run the applicable security diff review. `/review` does not establish deployed behavior; verify emulator/runtime behavior separately when practical.
