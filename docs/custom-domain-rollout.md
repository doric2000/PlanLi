# Custom-domain links rollout

Implementation branch: `feat/custom-domain-links`, based on `b6c40e9`.
This document tracks prepared source and the authorized rollout. README records
the current deployment state; source changes alone do not establish deployment.

## Contract

`functions/publicLinks.js` is the source for public URLs, app scheme, store links
and support address. After edits run `npm run sync:public-links`; CI/local
`npm run test:public-links` rejects drift in the generated client and browser copies.

| Use | URL | Access |
| --- | --- | --- |
| Private trip | `https://planli.cc/trip/<token>` | Existing signed-in gate; copy still requires active eligibility |
| Community route | `https://planli.cc/route/<routeId>` | Existing canonical route loader and Rules |
| Recommendation | `https://planli.cc/recommendation/<postId>` | Existing canonical document read and Rules |
| Email action | `https://planli.cc/__/auth/action` | Firebase-managed browser handler |
| OAuth callback | `https://planli.cc/__/auth/handler` | Firebase-managed browser handler |
| Support | `support@planli.cc` | Active Cloudflare forwarding to existing Gmail |

Landing pages expose no trip/content data and make no data requests. They contain
an explicit app-open button and store links. Without the app, install/update it,
return to the original message and open that link again. Deferred deep linking is
not implemented. Invalid links remain disabled. Query strings and fragments are
intentionally rejected; do not append tracking parameters to share URLs.

Legacy Firebase share URLs redirect to the canonical URL in the landing script;
old trip tokens and the existing `shared-trip` custom scheme remain valid. Older
binaries do not support the new route/recommendation scheme paths: update first.
Keep Firebase Hosting aliases, OAuth callbacks and infrastructure identifiers
available during migration. API, storage, App Check and EAS service endpoints are
provider infrastructure and must not be replaced with the public domain.

## Production observations and remaining prerequisites

Read-only inspection on 2026-09-21 found the custom Hosting domain active with a
valid certificate, and `planli.cc` already allowed by Auth and reCAPTCHA Enterprise.
The email action callback still points at `planli-f0b12.firebaseapp.com`; deployed
`createTripShare` still generates the `web.app` origin. A subsequent dry run of the
new Auth tool confirmed that callback state without modifying it.

There were no MX records for `planli.cc`. Before publishing the new support address:

1. In Cloudflare Email Routing, verify `planli.travel.il@gmail.com` as the destination.
2. Add the specific `support@planli.cc` forwarding rule. Apply Cloudflare's current
   required DNS records after checking existing SPF/DKIM; preserve Firebase mail
   sender records and keep a single valid SPF record rather than adding duplicates.
3. Send a test from an unrelated mailbox, verify receipt and Reply-To behavior,
   and verify reply delivery. Replies still originate from the Gmail mailbox;
   forwarding alone does not authorize sending as `support@planli.cc`.
4. Record DNS/forwarding evidence. This is a prerequisite for deploying the edited
   support/legal pages or releasing the client which displays that address.

Google/Apple provider console callback registrations are not verified. Keep the
old callbacks and verify/add the exact new `/__/auth/handler` URI in the relevant
web OAuth client / Apple Services ID before live provider smoke tests. Native
Google/Apple token login still uses their native SDKs, not a branded browser page.

The association files deliberately cover only `/trip/*`, `/route/*` and
`/recommendation/*`. Auth, admin and legal pages remain in the browser. The Apple
team ID and Android certificate fingerprints were copied from the current live
Firebase association files. Independently compare them with the signed release
entitlements and Google Play **app-signing** certificate before publishing these
manually maintained files; do not substitute an upload certificate.

## Auth change: read-only by default

Run from the repository, using Node 22 and active gcloud account
`doric9@gmail.com`. No access token is printed or written to a file.

```powershell
node scripts/configurePublicAuthDomain.js --project planli-f0b12
```

After support forwarding is verified, include `--support-ready` to plan Reply-To
changes as well. Review `before`, `desired`, the state hash and the narrow field
mask. The tool preserves template subjects/bodies, authorized domains and other
project settings. Applying is a separate authorized production operation:

```powershell
node scripts/configurePublicAuthDomain.js --project planli-f0b12 --support-ready --apply --expected-state <fresh-dry-run-stateHash> --confirm "APPLY PLANLI AUTH DOMAIN"
```

The script rereads state immediately before the PATCH, never retries a mutation,
and independently checks the result. A failed read-back is not permission to
blindly retry. Reinspect production first. Recovery requires restoring only the
affected fields from the reviewed `before` state using the same narrow field mask.

## Authorized release order

1. Merge reviewed source, verify a clean tracked canonical checkout and current
   account, Firebase project, EAS project and environment. The pre-existing
   untracked root `app.json` is excluded by `.easignore`; preserve it. Guarded OTA
   checks still reject root Expo configuration in this checkout; use the existing
   immutable Git archive workflow when applicable, never bypass a release check.
2. Complete email forwarding and verify provider callbacks and signing identities.
3. Export/verify the admin Web bundle using the real production reCAPTCHA site key.
   Deploy Hosting first, then verify every share path, static asset, association
   JSON Content-Type and all three origins. Verify no auth/admin URL opens the app.
4. Apply the reviewed Auth configuration. Send fresh verification/reset emails
   using a designated test account, check their actual outer link origin and the
   complete valid/expired/reused-code flows. Verify Google and Apple login, logout
   and admin sign-in on the custom domain. Do not store action codes in logs.
5. Deploy only `functions:createTripShare` after the landing pages are available.
   Generate a new share with a designated test trip, verify the origin and confirm
   old tokens still resolve/revoke correctly. No Firestore migration is needed.
6. Create separately authorized iOS and Android builds with runtime **1.4.0**.
   Bump store versions/build numbers according to the current store state. Test
   signed devices and publish through the authorized distribution workflow.
   This native change cannot be shipped to runtime 1.3.0 through OTA.
7. Only after verified installation record new native baselines in
   `config/eas-*-native-baseline.json`, including real IDs, fingerprints and source.
   The committed baselines intentionally still describe the old installed builds.
8. Update store support/privacy/account-deletion URLs where needed (Google Play's
   scanned privacy URL used Firebase; Apple's privacy URL already used planli.cc).
   Update README with exact source, Hosting/Functions state, build IDs, runtime,
   distribution/review state and actual device evidence. Never mark untested as live.

Explicit deploy commands, only after separate authorization and source checks:

```powershell
npx -y firebase-tools@latest deploy --project planli-f0b12 --only hosting
npx -y firebase-tools@latest deploy --project planli-f0b12 --only functions:createTripShare
```

Do not remove old aliases or change sender DNS during rollback. A Hosting rollback
must retain the new route/recommendation landing paths once clients emit them.
Restore compatible source via a reviewed change; do not reset Git or invent native
baseline receipts. Keep runtime 1.4.0 isolated from installed 1.3.0 clients.

## Acceptance matrix

- Each link kind on iOS/Android: cold start, app already open, app backgrounded,
  browser fallback, absent app, old binary and updated binary.
- Private trip: guest login, verification/profile/preferences gates, return to the
  exact token after navigation is ready, revoked/missing token, active copy flow.
- Public content: ID-only loading, canonical refresh, removed/held content,
  offline/retry, no stale navigation preview after a failed/missing fetch.
- Old Firebase origins, existing custom scheme, malformed IDs, extra segments,
  queries/fragments, auth/admin/legal excluded from app association.
- Actual verification/reset emails plus Google/Apple/admin browser login. Local
  mocks and Hosting emulator do not prove remote OAuth or signed OS association.

Focused commands: `npm run test:public-links`, Node release-guard tests,
client AuthContext/FirebaseEnvironment/AuthService/AuthScreens/RouteDetailScreen/
RecommendationDetailGallery/useRecommendationById/SharedTripScreen tests, and
Functions tripService tests. Run `npm run validate:changed -- --plan-only` to inspect
impact; do not substitute an unrelated full suite for the device matrix above.

## Local validation receipt (2026-09-21)

- 8 focused client suites passed (65 tests); tripService and its three affected
  Functions consumer suites passed (85 tests). Native parser/config tests and the
  release/tooling checks passed, including `validate:changed -- --scope tooling`.
- Expo introspection produced runtime 1.4.0, the iOS `applinks:planli.cc` entitlement
  and Android verified HTTPS filters for exactly the three share path prefixes.
- Admin export and asset verification passed using the production public reCAPTCHA
  site key. Browser smoke on the isolated Hosting emulator showed each landing,
  a disabled invalid link and the exported admin login; no console warnings/errors.
- Both association JSON files returned HTTP 200 and were included in the Firebase
  CLI's local deployment file inventory. The Windows Hosting emulator failed to
  apply all glob-based custom headers (including pre-existing headers): its
  `glob-slasher` produces backslashes which its matcher interprets as escapes.
  Header configuration passed static tests; production Content-Type/CSP/Referrer
  headers still require post-deploy HTTP verification. No CLI dependency was patched.
- The read-only Auth dry run confirmed the old callback. No real email, OAuth
  login, forwarding, store update or signed-device association was exercised.
- The original `/review` attempt was blocked by an older CLI. Codex 0.155.1
  subsequently completed review and identified a cold-start navigation dead end.
  Share-link initial state now includes Main beneath the destination, warm links
  preserve navigation history, and completing Auth retains a back destination.
  Installed-router and Auth regression tests passed (21 tests).
- No commit, push, deployment, production mutation, build or submission was made.

## Rollout activity (2026-09-26)

- Cloudflare routing activated September 21; active support rule and verified
  Gmail destination independently confirmed September 26. Public DNS retains
  Firebase DKIM and one SPF record including both Firebase and Cloudflare.
- The separate-mailbox message `PLANLI-DOMAIN-20260926` arrived in Gmail Spam;
  its reply was independently received at 11:59:42 Asia/Jerusalem. Forwarding and
  replies are operational; inbox placement is not guaranteed.
- Google production Web client now permits the canonical origin and
  `https://planli.cc/__/auth/handler`; legacy Firebase callback retained. Consent
  branding home/privacy/terms now use planli.cc. Google only offers the current
  account or managed Google Groups as support identity; forwarding does not make
  support@planli.cc an eligible Google identity. Apple Services ID now registers
  planli.cc and its callback; independent read-back confirms both old/new URLs.
- Play's generated Digital Asset Links JSON matches the committed BA:C9:7A:1A
  app-signing certificate; the upload certificate is distinct. Apple team matches
  C22ZFVA6M6. Play contact email/website were published using the custom domain.
  App Store 1.1.3 draft has canonical support/marketing/review links; privacy was
  already canonical. Public 1.1.1 support remains unchanged until version release.
- The iOS source version is 1.1.3, runtime 1.4.0. The native baseline remains an
  actual earlier installed binary. Release client tests passed 140 suites / 972
  tests before Expo dependency alignment. Native readiness found 19 SDK 57 patch
  mismatches; official SDK-compatible patch alignment completed (no SDK major
  upgrade and no Expo Doctor exclusions). Doctor 21/21, package compatibility,
  native configuration, production EAS environment and admin export passed.
- The post-alignment full client run passed 223/226 suites (1425/1432 tests).
  Focused follow-up passed all 5 suites / 55 tests after updating stale version
  expectations and using the existing Assistant bold font in operation styles.
  All four timed-out recommendation tests passed on the focused run unchanged.
  Audit reports three pre-existing moderate findings in the unchanged React
  Navigation/query-string decoder chain; no high/critical findings.
