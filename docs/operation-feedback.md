# Operation feedback and background media

This implementation adds an app-wide Hebrew activity banner and **הפעילות שלי**
in the profile drawer. Progress survives leaving the originating screen. Outcomes
remain in a private, per-account journal, with retry/edit controls where recovery
is safe. Ordinary likes and favorites stay quiet on success.

## Two delivery stages

Existing binaries use the JavaScript queue for media upload, processing and save.
The root profile-photo provider owns avatar work independently of the profile
screen. Avatar preparation uses a 768px square JPEG. The uploading indicator covers
processing and the final profile save as well as bytes sent.

A binary containing `client/modules/planli-transfers` uses background file transfers
and private server jobs. The native module is optional at runtime, preserving OTA
compatibility with older binaries. The local emulator client deliberately exercises
the JavaScript path; backend smoke separately exercises the real background-job
callables and triggers against the demo project.

1. Prepare and copy selected JPEGs into durable native storage; persist an immutable
   operation ID and manifest locally.
2. Register the owned intent through `startBackgroundOperation`.
3. Open authenticated Firebase Storage resumable sessions with App Check; give only
   their session URLs and owned files to the native transfer module.
4. Storage finalization triggers media preparation and the canonical business save.
   The server records a receipt before acknowledging completion.
5. Reconcile receipts on return and publish through the existing notification
   pipeline, subject to notification preferences and permission.

iOS uses a background `URLSession` and its AppDelegate completion handler. Files
remain readable after the device has been unlocked once. Android 14+ uses
user-initiated JobScheduler transfers; older versions use a foreground WorkManager
worker. Android displays an ongoing upload notification. Both retain
transfer status for recovery. System interruption, force-stop, revoked credentials,
and lost connectivity require reconciliation and sometimes an explicit retry;
uninterrupted execution is not promised after a force-stop.

The app must stay active for preparation and handoff. After handoff, native transfers
and server processing can proceed while it is suspended. See the official
[Apple background-session API](https://developer.apple.com/documentation/foundation/urlsessionconfiguration/background(withidentifier:))
and [Android transfer lifecycle](https://developer.android.com/develop/background-work/background-tasks/uidt).

## State and recovery

- Banner outcomes receive eight seconds of foreground visibility. Viewing Activity,
  switching apps, or the personalization Undo notice pauses that timer. Failures
  remain until acknowledged. Multiple outcomes receive separate visibility.
- Byte progress uses measured transfer progress. Preparation, processing, and saving
  remain indeterminate.
- Substantial saves, comments, reports, profile/preferences, notification settings,
  password changes, and deletions use the journal. Passwords, auth tokens, payloads,
  raw provider errors, and session URLs never enter it.
- A timed-out non-idempotent save becomes uncertain and is not automatically replayed.
  The avatar queue compares the saved media asset on restart before repeating a save.
- Background manifests live under `system/operations/jobs/{id}/items/{itemId}`.
  Callables enforce account eligibility and ownership; workers recheck revocation
  and use transaction receipts and leases. Concurrent edits fail instead of
  overwriting newer content. Account deletion fences workers and removes job children.
- Failed source files remain available for an explicit retry or discard. Resolved
  acknowledged local history is bounded to 200 entries per account and 30 days;
  unseen outcomes and unresolved failures remain. Server success receipts expire
  30 days after acknowledgement; unseen results remain available; discarded jobs are removed after one day.
- Native session credentials are held by iOS URLSession or encrypted with Android
  Keystore. Native source files are excluded from backups and removed on completion
  or explicit discard. Prepared server assets are protected while referenced by a job.

## Release requirements

These are source changes. Implementation does not deploy Functions/indexes, create
an EAS build, send an OTA, or change a live release.

Before enabling the native path in a separately authorized release, deploy the
changed indexes and Functions, including existing service consumers and account/media
cleanup, then build/install a binary containing the local module. The new endpoints
are `startBackgroundOperation`, `getBackgroundOperations`, `retryBackgroundOperation`,
`acknowledgeBackgroundOperation`, `discardBackgroundOperation`, and `reportBackgroundTransferFailure`; the workers are
`onBackgroundMediaUploaded`, `onBackgroundOperationWritten`, and
`maintainBackgroundOperationsScheduled`. Preserve the existing EU bucket, runtime
service accounts, region and App Check enforcement. No Rules or IAM broadening is required.

Required device evidence includes screen navigation during uploads, lock/unlock,
app switching, connectivity loss, manual retry, cold restart, account switching,
several completions, and notification taps. Physical iPhone background execution
requires a separately authorized EAS Development Build; Windows cannot validate it.
The canonical README release record must be updated by that release workflow.

## Local validation

Focused client checks cover queue persistence, foreground visibility, concurrent
history actions, account changes during media work, legacy recommendation edits,
navigation, notification taps, and profile-photo recovery. Backend checks cover
immutable admission, ownership, leases, interrupted transfers, lost responses,
acknowledgement retention, and publication-claim cleanup without touching a newer
draft. Existing media/profile/content/deletion consumers were checked separately.

A browser fixture rendered the actual banner and Activity components at 390px
width with controlled upload, failure, success and multiple-outcome states. It
exercised navigation, dismissing one outcome to reveal the next, and pausing the
foreground timer. This is UI evidence, not evidence of native transfer delivery.

The local Android debug APK, including the Kotlin transfer module, compiled and
was installed on the dedicated demo emulator. Firebase Emulator Suite smoke checks
exercised avatar upload/finalization/processing/profile save and recommendation
upload/publication through the new server jobs, alongside existing ownership
rejections. Native transfers are disabled in this synthetic demo client, so these
checks do not establish native upload delivery while the phone is locked.

`npm run test:android -- --flows=publish` passed prepare, seed, backend smoke,
APK installation and JavaScript bundling. Its device flow failed in the existing
Expo developer-menu Close step before reaching the app assertions. The failure
screenshot retained the developer menu; device logs also showed a System UI ANR
under host memory pressure. The publication-to-Activity device flow remains
unverified; its failed runtime receipt was retained without a passing override.

The automated `codex review --uncommitted` check was interrupted because installed
CLI 0.151.0 cannot use its configured model. The diff received a manual review;
an automated review result is unavailable. Physical iPhone execution, native
lock/unlock transfers and live App Check remain unverified.
