# Stage 3 App Check rollout

This runbook covers the reviewed 103-callable inventory and, in order, Firestore,
Storage and Firebase Authentication in `planli-f0b12`. Google Identity for iOS
(`oauth2.googleapis.com`) is excluded pending a separate compatible integration.
Do not deploy scheduled jobs, event triggers, Rules, Hosting or client binaries.

## Prepare once

Use Node 22 and a clean, reviewed topic commit. README release-status edits may
remain uncommitted during the rollout. Firebase CLI and gcloud must both use
`doric9@gmail.com`. Verify production provider configuration, installed clients,
and core/media Token Verifier IAM before applying. Preserve unrelated work in its
own branches. No actual tokens, private keys or account data belong in receipts.

```powershell
npm run security:app-check-rollout -- --snapshot .codex_tmp/validation/security-stage3/rollout.json
npm run security:app-check-rollout -- --manifest .codex_tmp/validation/security-stage3/rollout.json --batch canary
```

The snapshot fixes source, target order, previous revisions and service settings.
Retain it with its adjacent journal. Never overwrite a baseline or fabricate an
acceptance receipt. A journal lock indicates another process or an interrupted
operation: establish that no owner is running before removing only that lock.

## Apply, verify and accept one batch

```powershell
npm run security:app-check-rollout -- --manifest .codex_tmp/validation/security-stage3/rollout.json --batch canary --apply --confirm "APPLY PLANLI STAGE THREE APP CHECK"
npm run security:monitoring -- --app-check-rollout
```

The runner persists the enforcement flag and source marker in the ignored
production Functions environment, then uses exact Firebase CLI deployment
targets. It verifies runtime configuration and actual Cloud Run traffic. A CLI
failure is an uncertain outcome: inspect provider state and use `--verify`,
without `--apply`, instead of repeating the deployment. It cannot advance while
prior batches lack accepted runtime evidence.

Apply the monitoring dry-run's exact manifest/state hashes using
`--app-check-rollout --apply --project planli-f0b12 --manifest-hash <hash>
--state-hash <hash> --confirm "APPLY PLANLI PRODUCTION SECURITY MONITORING"`.
Refresh monitoring after each enforcement/rollback transition. The callable
filter includes only active enforced targets; the separate service metric covers
Firestore, Storage and Authentication DENY results. Missing channel verification
status is not evidence of failure or delivery: confirm an actual email.

For the canary, exercise guest issuance, reaction reads, favorites and admin saved
views on the intended platforms. Probe missing/invalid tokens without touching
real business data, correlate HTTP results with verification logs, and confirm
the generated alert arrives. Observe at least 15 minutes before acceptance.

Acceptance JSON contains `batch`, `manifestSha256`, `postStateSha256`, `checks`
and nonempty `receipts` naming actual evidence. Obtain hashes from the manifest
and runner output. Required checks are enforced by `assertEvidence` in the
runner; do not set a check true until it was exercised. All batches require
`positive`, `negative`, `logsReviewed`. Canary additionally requires `ios`,
`android`, `web`, `guest`, `emailReceived`.

```powershell
npm run security:app-check-rollout -- --manifest .codex_tmp/validation/security-stage3/rollout.json --batch canary --accept --evidence .codex_tmp/validation/security-stage3/canary-evidence.json --apply --confirm "APPLY PLANLI STAGE THREE APP CHECK"
```

Proceed through `public`, `remaining-1` through `remaining-9`, then `deletion`.
Deletion tests use only disposable accounts/content and require fresh-token and
replay-rejection proof. Client calls already opt into limited-use tokens.

## Product services

Proceed through `firestore`, `storage`, `authentication`, one at a time. Wait at
least 15 minutes after each applied state before acceptance and verify positive
and negative behavior, not only control-plane settings.

Storage requires a preflight evidence file passed with `--evidence` containing
the manifest hash, batch, `ios/android/web/uploadBeforeEnforcement` checks and
receipts. Include SDK and native background upload paths; after enforcement
prove upload, processing and display. Authentication similarly requires
`freshSignInBeforeEnforcement` plus all three platforms before apply; acceptance
also covers email, Google, Apple, admin TOTP and password reset.

## Stop and rollback

Stop on a reproducible legitimate-client rejection, new unexplained backend
errors, or failed alert delivery. Do not disable Auth, Rules, ownership or the
existing guest fresh-token check. Use the same manifest and exact affected batch:

```powershell
npm run security:app-check-rollout -- --manifest .codex_tmp/validation/security-stage3/rollout.json --batch canary --rollback --apply --confirm "APPLY PLANLI STAGE THREE APP CHECK"
npm run security:app-check-rollout -- --manifest .codex_tmp/validation/security-stage3/rollout.json --batch canary --verify
```

Functions rollback routes traffic to the exact pre-batch Cloud Run revisions,
preserving their code and environment; revisions are not deleted. Service
rollback restores the pre-batch enforcement mode. Read-back and an independent
client recovery test are required. Cloud Functions metadata may still describe
the newer revision after traffic rollback; actual traffic is authoritative.
The runner resolves the serving revision when recording a fresh baseline. It
uses Cloud Run v1 with the current `resourceVersion` and unchanged revision
template for traffic restoration; the v2 traffic PATCH returned a 409 in
preflight. Per-target journal entries let an interrupted rollback resume after
read-back, without repeating already completed requests. `--verify` also works
after interruption. Reconciling services must settle before retrying rollback.
Do not redeploy from the still-enabled local environment until the cause is fixed
and a fresh rollout is reviewed. Refresh alert scope against actual traffic after
rollback, and keep the journal for diagnosis.

Retire only the obsolete `moderateContent` endpoint after a fresh source/client
search and seven-day usage check. Use explicit project, region and endpoint
deletion; never a broad Functions delete. This is separate from content deletion.

## Close

Require all batch receipts, delivered alerts, Android continuity and a final
30-minute observation window. Record source/revisions, UTC times, installed
versions, excluded Google Identity enforcement, and remaining stage-2 checks in
README. Source tests and an applied flag alone do not close the launch gate.
