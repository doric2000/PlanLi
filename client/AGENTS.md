# PlanLi Client Agent Guide

This file applies to `client/**` and supplements the repository guide.

## Tool routing

- Read installed Expo, React Native, React, Firebase client, and navigation versions before changing version-sensitive APIs.
- For Expo configuration, Development Builds, EAS Build, EAS Workflows, or native modules, use an applicable installed Expo skill first and then Expo MCP to inspect or validate real project state. If the Expo skill is unavailable, state that and use official Expo documentation plus Expo MCP.
- For Firebase client Authentication, callable Functions, Storage, or Firestore behavior, use the relevant official Firebase skill first. Use Firebase MCP for live project state when available; repository code alone is not evidence of deployed configuration.
- For the hosted admin console or React Native Web behavior, use the browser skill to exercise the rendered UI. Unit tests and `/review` do not replace a runtime check.
- Never expose raw provider, Firebase, network, or callable error messages. Map structured reasons to safe Hebrew copy.

## React Native and admin validation

- Prefer React Native Testing Library tests that operate through roles, labels, text, and stable `testID` values. Avoid implementation-state assertions.
- Every async screen must cover loading, empty, error, retry, success, and stale-response behavior where relevant.
- Admin tabs must keep request state isolated. Admin mutations must keep pending/error state scoped to the exact action and target; a slow action must not freeze unrelated tabs or buttons.
- Long callable actions need immediate persistent progress, a timeout aligned with the server limit, and a safe warning that the server operation may still finish. Do not automatically retry destructive or non-idempotent actions.
- After a successful admin mutation, patch or remove the affected item, or refresh only that target. Do not reload an entire tab unless the operation changes the whole collection.
- Preserve RTL, Hebrew copy, safe areas, accessibility roles/states, disabled styling, and 44px minimum targets.

## Efficient test ladder

Run the smallest useful checks from `client/`:

```powershell
npm.cmd test -- --runInBand __tests__/RelevantScreen.test.js __tests__/RelevantService.test.js
```

- Run the admin export and asset verifier for admin UI, assets, entry-point, or bundler changes.
- Run an iOS export for native configuration, assets, dependency, or entry-point changes.
- Run the full client suite only for shared runtime/navigation/dependency changes or release readiness.
- The EAS Maestro workflow is an explicit, on-demand iOS gate. Do not trigger a paid/remote build without authorization.

## Review gate

For non-trivial changes, inspect the final diff as a skeptical senior React Native engineer. Then use `/review` (or the equivalent base-branch diff review) for regressions, stale state, races, navigation/auth edges, platform differences, and accidental extra requests. `/review` is diff analysis only; perform the targeted runtime flow separately.
