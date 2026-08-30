# Security incident response

This runbook applies to PlanLi production and staging. It does not authorize a
deployment, IAM change, credential rotation, data migration, or deletion. Record
the exact project, UTC timestamps, affected resource IDs, immutable inventory
hashes, and read-back evidence before and after every authorized action. Never
copy access tokens, private keys, user content, or production data into the
repository or an incident report.

## Triage and severity

- **Critical:** confirmed credential use, public private-user data, admin
  takeover, or active unauthorized writes. Contain immediately and suspend the
  affected release path.
- **High:** exploitable authorization bypass, public protected storage, or an
  externally reachable injection path without confirmed abuse. Block release
  and contain the affected surface.
- **Medium:** a missing production control such as App Check, MFA, a restricted
  key, or an alert that materially increases exploitability or time to detect.
  Block public launch until fixed and verified.
- **Low:** defence-in-depth or disclosure with no demonstrated privilege/data
  impact. Fix or record an explicit owner acceptance and review date.

Open an incident timeline as soon as a Critical or High signal is credible.
Preserve Cloud Audit Logs, Cloud Run request/error logs, Auth events, App Check
metrics, Storage access evidence, EAS update/build identifiers, and the exact Git
commit. Use UTC and distinguish observations from inferences.

## Containment order

1. Identify the exact project, app, service account, key ID, secret version,
   function revision, bucket, ruleset, Hosting version, EAS group, and time
   window. Do not act on a display name alone.
2. Capture a read-only inventory and a SHA-256 of any affected object/document
   name list. Do not download user content unless investigation requires it.
3. Apply the smallest reversible containment first: deny public access, disable
   a credential, remove one IAM member, pause a rollout, or republish a known
   safe OTA group. Do not delete evidence during containment.
4. Read the resulting live state independently, exercise a focused smoke test,
   and inspect the following error window. A successful command is not proof of
   applied state.
5. Eradicate the root cause in source and configuration, add a regression test,
   deploy through staging, and only then remove obsolete credentials or data
   under separate irreversible authorization.
6. Recover gradually, monitor for recurrence, notify affected users when legal
   or privacy review requires it, and record the final live state in `README.md`.

## Credential and key rotation

PlanLi Functions use runtime service identities and ADC. User-managed service
account keys are prohibited. If one appears, first verify that no active
revision or approved operator workflow uses it, disable that exact key ID, run
core/media smoke tests and inspect logs, then request separate authorization to
delete it. Additions of user-managed keys must page the production operator.

For Google Maps API keys, create and verify a least-privilege replacement before
disabling the old key: restrict it to the exact API and Android package + signing
certificate, iOS bundle ID, or approved Web origins as applicable. Server-side
Places and Geocoding calls use OAuth/ADC and must not fall back to an API key.

For Secret Manager, add a new version without logging its value, deploy only the
consumers that bind that secret, verify read-back and runtime behavior, disable
the superseded version, and delete it only after the rollback window and a
separate irreversible approval. Revoke sessions or refresh tokens when the
rotated value could have authenticated a user or operator.

## Required production signals

Before public launch, production must have a verified notification channel and
enabled alerts for at least:

- creation of a user-managed service account key;
- sustained Cloud Run/Functions 5xx failures;
- abnormal App Check rejection after enforcement begins (keep the policy
  disabled before enforcement so expected missing tokens do not page);
- quota exhaustion or unusual billable Maps usage;
- the project billing thresholds recorded in `README.md`.

Exercise notification delivery with a harmless test policy or documented
console test. A configured but unverified channel does not satisfy the gate.

## Closure checklist

An incident is closed only when containment and root-cause fixes are deployed,
live read-back matches intended state, focused regression/smoke tests pass, the
post-change log window is clean or explained, credentials and affected sessions
are rotated where necessary, and follow-up owners/review dates are recorded.
Release remains blocked while any Critical/High/Medium finding is open or
untested.
