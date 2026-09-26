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
| Email action (target; blocked in Firebase) | `https://planli.cc/__/auth/action` | Firebase-managed browser handler; live links still use firebaseapp.com |
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

## Initial production observations (superseded by rollout activity below)

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
  The initial audit reported three findings in the React Navigation decoder chain.
- PR #429's locked audit detected that a supported upstream fix is now available.
  Targeted core 7.22.1 / routers 7.6.4 update removes all five decoder-chain
  packages; live npm audit now has zero findings. The previous exception was
  removed and policy tests confirm that every advisory, including the former
  exception, is rejected. All 34 focused Auth/navigation/share tests passed.
  Upstream source reviewed: https://github.com/react-navigation/react-navigation/releases/tag/@react-navigation%2Fcore@7.22.1
- Play privacy URL is saved as https://planli.cc/privacy/, pending Play review.

## Live rollout checkpoint (2026-09-26)

PR #429 merged as `1eae24ccf94072490d766202f2ad4f9478d2ce22` after all final
CI gates passed, including the full client suite and strict zero-advisory audits.
Hosting release `1790415669255000` / version `06c2d958f2e664af` is live;
27 independent HTTP checks passed across all three hosts. `createTripShare`
revision `createtripshare-00002-rom` is ACTIVE. README records exact times and
build IDs. This supersedes the earlier implementation-only/no-deployment notes.

All four Firebase template Reply-To addresses are now support@planli.cc.
The action callback is **not migrated**: API callback-only and combined updates,
and the Firebase console, reject the change with `EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED`.
Do not blindly retry or reset template content. The real password-reset message
arrived in the designated inbox with a planli.cc sender/signature and the new
Reply-To, but its link still uses the old Firebase host. No password was changed.
Resolving Firebase's template restriction is required before email migration can
be called complete; switching to a different mail delivery architecture is not
part of the implemented contract.

Apple Associated Domains is now enabled and profile NGZ4V8B72H was regenerated
with the same signing certificate. After the owner refreshed Apple authentication,
EAS received the new profile at 10:17:22 UTC; UUID and entitlement were read back.
The first iOS build failed on the old profile; retry build 34
(`1ff27c70-6a66-4daf-b58d-bb8a3d092091`) finished at 10:30:24 UTC. Its signed IPA
confirms version 1.1.3/build 34, production/runtime 1.4.0 and `applinks:planli.cc`.
EAS submission `ef8bd5ac-f870-4d0b-9fd9-f7687d5a52a8` finished at 10:33:29 UTC;
Apple processing completed and ASC build `4b085cf0-48cd-4816-a915-de004d2b8e82`
is available to the existing Team (Expo) internal group with one tester. Hebrew
test instructions were saved. The owner subsequently confirmed installation of
1.1.3 (34) and link dispatch from WhatsApp; the first read failed and manual retry
succeeded. The iOS baseline now records that installed binary. The existing ASC API key
successfully read the expected app at 10:25:05 UTC; no key rotation was needed.
Android build 12 finished and its signed AAB's share intent filters and runtime
were inspected with bundletool. EAS has no Google submission service-account key;
the AAB was uploaded through Play Console and internal release 9 is available to
internal testers as of 13:23 Asia/Jerusalem. Android installation, complete native
link acceptance, successful end-to-end OAuth login and verification-email delivery
remain unverified. Play privacy and account-deletion URL changes are in review;
App Store 1.1.3 remains a draft with canonical URLs.

The shared-trip recovery/safe-area correction was published as iOS production OTA
`f54aca26-f3fa-4015-afc6-b733f179cff3` at `2026-09-26T12:26:59.989Z`, source
`2aab25fe0b685a2a13871f95f82bc66859372f7a`, runtime 1.4.0 for installed 1.1.3 (34).
Exact native compatibility, immutable bundle equality and delivery from the public
production endpoint passed. Device download/application and cold-link acceptance
after this OTA remain unverified; the existing Firebase email-action limitation
above is unchanged.

### Firebase support handoff (prepared; not sent)

Project `planli-f0b12` (number `633543026638`) has a verified custom Auth mail
sender domain `planli.cc`, and that domain is authorized in Auth and connected
to Firebase Hosting. The desired email action URL is
`https://planli.cc/__/auth/action`; the current value is
`https://planli-f0b12.firebaseapp.com/__/auth/action`.

On September 26, 2026, both Firebase Console's action-URL editor and the
Identity Toolkit v2 project configuration API rejected this change with HTTP 400
`EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED`. A callback-only PATCH failed too; changing
only template Reply-To fields succeeded. Custom subjects/bodies were preserved.
A delivered reset email confirms the custom sender and Reply-To work while the
action link still uses the Firebase host.

Ask Firebase Support to identify and resolve the project restriction preventing
the documented custom action-URL change. Do not include OAuth access tokens,
reset/verification codes, passwords or full private project configuration in the
request. After resolution, rerun the guarded dry run and apply the narrowly
scoped callback update, then test fresh verification/reset email links without
changing the owner's password. No provider ticket has been submitted by this task.
