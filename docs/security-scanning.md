# Security scanning

PlanLi's default security scanner is deterministic and does not call Codex, GPT,
or any metered AI service. It combines a pinned Semgrep release and PlanLi-specific
rules, a pinned Gitleaks release over Git history and the current working tree,
and `npm audit` over the locked dependency trees. GitHub additionally runs CodeQL with `security-extended`, the
dependency review action, Gitleaks, and the same PlanLi Semgrep rules.

The local gate emits merge commits as a separate diff against every parent, then
independently counts the unique commits that contain text additions and
requires Gitleaks to report at least that count. Gitleaks can also count some
deletion-only modifications and supported archives, so a larger reported count is valid. A merge-only
credential canary must be detected before any history result is trusted.

## Local commands

Run commands from the repository root:

```powershell
npm.cmd run security:preflight
npm.cmd run security:inputs
npm.cmd run security:diff -- --base <base-sha> --head <head-sha>
npm.cmd run security:full
```

`security:preflight` verifies the exact scanner versions and executes an
intentional command-injection canary, an ignored-`.env` credential canary, and a
credential canary that exists only in merge-conflict resolution history. The
preflight fails unless all canaries are detected. The other commands run
the preflight first and fail when the requested revision range or source
inventory is empty.

The input and full scans first inventory all in-scope source files, then use a
deterministic text prefilter to give Semgrep only files that can match the seven
PlanLi sink/invariant rules. The receipt records both counts and a SHA-256 digest
of the complete source inventory. CodeQL supplies the broader interprocedural
source-to-sink analysis in CI.

Every local run writes machine-readable JSON, SARIF, and a receipt under
`.codex_tmp/security-local/<run-id>/`. A successful scanner execution may still
exit non-zero: that is the expected security gate behavior when it found a code
issue, a secret, or a moderate-or-higher dependency advisory. Scanner errors are
recorded as `failed`; completed scans record `gatePassed` explicitly.

Every input/full/diff run also scans the current working tree—including
uncommitted source—and inventories ignored local `.env*` files and Firebase
debug logs outside `.git`, `.codex_tmp`, and `node_modules`. Reports retain only redacted rule/path/line
metadata. The committed
`.gitleaks.toml` allows only explicitly public Firebase/MapTiler client-variable
forms; deprecated Google Maps, Weather, server credentials, and any other
detected secret fail the gate even when Git never tracked the file. Use
`npm run security:local-env:cleanup` for a dry run that removes only PlanLi's two
known obsolete client variables; add `-- --apply` only after reviewing the names.
Retained migration and rollback directories are handled separately because
opaque object identifiers create thousands of generic false positives. Run
`npm run security:local-artifacts:cleanup` to create a credential-specific
dry-run manifest, then apply only with its exact `--manifest-hash`.

The Codex Security runner is intentionally not exposed as an npm command after two
headless canary runs failed to complete or produce canonical artifacts on Windows.
On 2026-08-29 the official Deep Scan was also unavailable because its managed
filesystem permission profile was missing. One subsequent official Standard/Diff
attempt stopped before creating a scan ID because the tool considered the selected
working-tree snapshot stale after `HEAD` changed. Neither failure is a successful
or clean Codex Security result.

## Frequency and scope

These tools are opt-in checks for relevant changes, not mandatory steps on every
commit, push, merge, EAS Build or EAS Update. Documentation-only changes require
new-commit secret scanning and relevant syntax/diff checks, without application
suites or CodeQL. A dirty tree alone is not a reason for a full scan.

GitHub keeps existing check names. CodeQL runs for source/analysis configuration
changes on PRs and main, plus weekly. Semgrep checks changed production source on
PRs and scans its full inventory weekly or manually. Gitleaks scans the new commit
range on PRs/main (including intermediate commits and merge-parent diffs), with
full history weekly. Dependency review runs on manifest, lockfile and Actions
changes. Audits run for changed dependency workspaces on PRs and all workspaces
daily; failures and the existing audit exception policy remain unchanged.

The always-running Security policy and PR validation results fail when a required
job fails or is cancelled, and accept jobs that are deliberately not required.
No branch-protection changes are made by this workflow change.

Local security:diff selects committed source from base..head; it does not include
unstaged source in its Semgrep target. Review the final working-tree diff explicitly.
Use a current-source scan when that sensitive diff needs it; reserve complete
history/dependency scans for explicit broad reviews and the scheduled CI runs.
