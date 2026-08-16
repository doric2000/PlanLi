# PlanLi Client Agent Guide

Applies to `client/**` and supplements the repository guide.

## Client architecture

- Expo SDK, React Native, React, navigation, and Firebase client APIs are
  version-sensitive. Inspect installed versions and existing patterns first.
- Feature code lives in `src/features`, shared services in `src/services`, and
  `StyleSheet.create` definitions in `src/styles`.
- Visible product UI is Hebrew unless intentionally English. Preserve RTL, safe
  areas, accessibility, stable test IDs, navigation route names, and 44px targets.
- Reuse shared components, hooks, providers, services, and tokens before adding
  new abstractions. Never expose raw provider, Firebase, callable, or network errors.

## Authentication and protected actions

Auth uses one `AuthProvider` state machine:

`loading` → `guest` / `emailVerificationRequired` /
`accountSetupRequired` / `preferencesRequired` / `ready`

- Protected actions use `requireCapability`; external entry points use `openAuthFlow`.
- Guest auth screens remain inside the nested Auth tab navigator.
- Active access requires verified eligibility, current profile/legal completion,
  and completed preferences; server checks remain authoritative.
- Display-name changes follow the single-change and verified-email policy.
- Keep auth/legal versions aligned with Functions, Storage Rules, and legal drafts.

## Admin, UI, and media behavior

- The admin console is the same responsive surface used on iOS and Hosting `/admin`.
- Async screens must handle relevant loading, empty, error, retry, success, and
  stale-response states. Unit tests alone do not establish responsiveness.
- Admin request and error state stays isolated per tab, action, and target. One slow
  operation must not freeze unrelated buttons or views.
- Long actions show immediate persistent progress and use a timeout aligned with
  the server. Never automatically retry destructive or non-idempotent mutations.
- After a mutation, update or refresh the affected target instead of the whole tab
  unless the operation genuinely changes the collection.
- Preserve cached rendering, bounded list mounting, and the three-image carousel
  window. Use the intended `large`, `feed`, and `thumb` media variants.

## Windows and iPhone workflow

The development computer is Windows and the available Apple test device is a
physical iPhone. Expo Go is unsupported because PlanLi uses native auth modules.

- Use the installed signed EAS Development Build with Metro:
  `npx expo start --dev-client -c`.
- Do not run local Xcode, CocoaPods, `npm run ios`, or iOS Simulator commands.
- JavaScript-only changes need a Metro reload, not a new EAS build.
- Native dependency, app-config, entitlement, icon, splash, or signing changes need
  an explicitly authorized cloud EAS Development Build installed on the iPhone.
- Use EAS logs for native build failures; local Xcode logs are unavailable.
- EAS Maestro/iOS Simulator workflows are optional, remote, paid-plan dependent,
  and never a default or blocking gate.
- Production/TestFlight builds and EAS Submit can run from Windows, but require
  separate release authorization.

## Tool routing

- Expo/EAS: use Expo MCP for current project, credentials, builds, and workflows.
  If OAuth or MCP is unavailable, state it and use EAS CLI plus official Expo docs.
- Firebase client behavior: load the relevant Firebase skill; use Firebase MCP only
  when live Auth/project/deployed state is necessary.
- Hosted admin/Web behavior: use the browser skill against the local export or
  deployed URL as appropriate. Do not use production admin mutations for testing.

## Client validation ladder

Run commands from `client/` and start with the narrowest relevant test:

```powershell
npm.cmd test -- --runInBand __tests__/RelevantScreen.test.js __tests__/RelevantService.test.js
```

### Level 0

Documentation or Codex configuration only: no client tests or exports.

### Level 1

- Run directly affected Jest tests.
- Prefer React Native Testing Library assertions through roles, labels, text, and
  stable test IDs rather than component implementation state.
- For UI changes, exercise the changed loading/error/success path in Web/admin or
  on the iPhone when practical.

### Level 2

- Run related test groups.
- Admin UI/assets/entry/bundler changes require `npm run export:admin-web`,
  `npm run verify:admin-web`, and browser smoke testing.
- Native config/dependency/assets/bundler/entry changes require an iOS export.
- Shared navigation/auth/runtime changes require the related navigation/auth groups.
- Run one base-branch `/review` after checks.

### Level 3

- Run the full client suite with `npm.cmd test -- --runInBand`.
- Run applicable admin and iOS exports plus critical iPhone/browser smoke flows.
- Request an EAS build only for a native/release need; do not build for JS-only work.

Do not add a new E2E framework for a focused fix. The existing remote Maestro smoke
workflow is on-demand only and cannot replace manual physical-device coverage.
