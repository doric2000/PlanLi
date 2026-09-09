# Local Android validation

Use Windows, Node 22 and Java 17 or newer (this workstation has JDK 21). Android
hardware acceleration must be available. The pinned SDK manager (revision 19) and Maestro 2.10.0 live
under ignored .codex_tmp/android; their downloaded SHA-256 checksums are verified.
Android API 34 is used for the device; the app still compiles against API 36; SDK packages are installed only by the
opt-in setup command.

From the repository root:

~~~powershell
npm run setup:android -- -Install
npm run test:e2e:backend
npm run test:android -- --flows=all --negative
npm run test:android -- --flows=gallery
~~~

The first Android run creates a local debug Development Build. SDK, Gradle, NDK
and Maven downloads are substantial one-time setup work. Later JavaScript changes
use Metro and the existing binary. Use --build to explicitly rebuild native inputs.
Without --flows, the change selector chooses relevant scenarios. The --negative
option proves that an intentionally incorrect screen assertion exits with failure;
that expected failure is accepted only by the explicit negative-control wrapper.
Each Maestro process has a 15-minute overall deadline in addition to its screen
waits. A hung device command fails and its owned process tree is terminated.

Only emulator-5580 / PlanLi_E2E_API34 and com.planli.planlitravels.e2e are used. The runner
rejects occupied Firebase ports before starting; it terminates only its own helper
processes. --keep-running leaves those processes available for inspection until
the runner is stopped. No EAS service or paid device service is used.

Auth (9099), Firestore (8080), Storage (9199), Functions (5001) and Metro (8081)
are reached from Android through its host-loopback alias, 10.0.2.2. The project is always demo-planli-e2e.
Cloud credentials and dotenv inputs are isolated. The local app disables OTA and
has a distinct application ID. Emulator flags are rejected in production/EAS.
The real Rules are copied byte-for-byte into the generated local configuration.
The harness imports the real Functions handlers; only external provider transports
are deterministic fixtures. Unexpected backend external requests fail closed.

Synthetic data: traveler@example.test / Local-E2E-only-2468!, an approved London
destination and locally generated photographs. Authentication, owned uploads,
media processing, publication and authorization failures use actual SDK/Rules and
business code. Emulator App Check uses a fixture token; hardware attestation is
not established by this test.

Scenarios: Hebrew guest navigation, verified email sign-in, photo publication,
photo swipes/action menus, Atlas globe drag and region/global confirmation/cancel,
and disabled emulator Wi-Fi/mobile data followed by reconnection and retry.
Run the focused Atlas scenario with `npm run test:android -- --flows=atlas`.
Logs, JUnit output and screenshots are kept under .codex_tmp/validation/android.
A passing runtime receipt includes the tested inputs and flow list; failed or
changed results cannot satisfy focused validation. No device receipt is reused in
GitHub Actions. Native-build receipts cover native inputs, not JavaScript source.
Runtime inputs are captured before Firebase starts and checked again before and
after device flows. Edits made while services start or tests run reject the receipt;
attaching to an already-running backend cannot establish reusable runtime evidence.
The backend smoke also creates an unfinished synthetic draft through the real
callable. Composer flows discard an existing synthetic draft through the app's
owned-draft action, so a previous flow's autosave does not change their start screen.

Jest still covers logic and edge cases. Physical iPhone testing remains necessary
for Apple Sign-In, iOS permissions and App Attest. This Android harness does not
change the protected iOS staging-to-production artifact promotion workflow.

## Release and CI policy

Use validate:changed for normal work. Use validate:release with an explicit
--base deployed-source-sha and --kind ota, build or full for release readiness.
OTA/build do not rerun unrelated backend/Rules suites or pre-export the same OTA
candidate. The protected EAS Update wrapper still exports once to staging and
promotes that exact artifact after its candidate evidence is accepted.

CodeQL remains on relevant PR/main changes and weekly. New-commit secret scans
run on PR/main including intermediate commits and merge diffs. Semgrep runs on
changed relevant PR files. Dependency review follows manifest/lock/Actions edits;
audit follows changed workspaces and all workspaces daily. Weekly/manual scans
cover full history and source. No AI agent runs on that schedule. Existing audit
failures are not waived. Branch protection was not readable or changed; existing
required check names are retained, with PlanLi security invariants used as the
always-running failure gate.

The local suite uses Firebase's documented serialized Functions mode on localhost
inspector port 9230 to bound memory on this 16GB Windows machine. This verifies
UI/business flows, not production concurrency. Gradle is limited to two workers.

The dedicated AVD uses the installed emulator's `swangle` software mode, two CPU
cores, a 540x960 display and density 240 (360dp wide), at 30 Hz. Local Metro uses
one worker. Run setup
before starting tests; updating device tools during a flow can interrupt ADB.
Host GPU rendering produced repeated OpenGL errors and a black, unresponsive
emulator during acceptance on this workstation. The runner uses the installed
emulator's supported software renderer and a cold boot to avoid that driver
path; it does not accept interrupted tests as successes.

For this 16 GiB host, the runner caps each Firebase Java process at a 512 MiB
heap and Maestro at a 768 MiB heap, with two JVM processors. These are heap
limits, not limits on total process memory. They apply to owned local helper
processes only; Gradle and normal app configuration are unchanged.

Android Emulator 37.1.11 raises Android 14 guest RAM to 2560 MiB even when
`-memory 1536` is requested, as confirmed by its startup log and
[Android's emulator source](https://android.googlesource.com/platform/external/qemu/+/emu-master-dev/android/android-emu/android/main-common.c).
The runner now requests that effective minimum explicitly. Lowering the old
number did not reduce allocation. A SwiftShader trial with Vulkan disabled
still exceeded 3 GiB of host memory and did not resolve the pressure. A later
host-GPU trial with Vulkan disabled rendered the launcher but froze when the app
opened, with `glReadPixels` / `glPixelStorei` errors. Hardware rendering is not a
usable workaround on this workstation. The smaller physical display reduces the
pixel workload; it does not reduce Android's minimum guest RAM. Stop owned helpers when inspection
ends, reuse the APK for JavaScript changes, and avoid other heavy builds or
test suites while the emulator is running. Host memory pressure is not a
passing device result.

The runner disables the two Pixel 6 emulation overlays on the dedicated AVD.
Their fixed 128px cutout did not scale with the smaller display: the status-bar
touch region covered Expo's Close button at y=117. Device readback confirmed a
normal 36px status bar after removing those overlays. This small-screen profile
has no camera cutout. A global animation-disable trial was inconclusive and was
reverted; normal motion remains enabled. The boot flow asserts developer-menu
dismissal and pauses the globe through its existing UI button when available.
A diagnostic wrapper
sampled available host RAM every five
seconds and stopped only its own test helpers after two samples below 0.9 GiB.
Keep enough headroom before running; that temporary wrapper is not part of the
normal npm command. Do not build native code or run Jest concurrently with the AVD.

The later constrained run held roughly 2 GiB available during parts of startup,
but that headroom did not persist through the entire route scenario. Even staged
startup eventually fell below the guard's threshold; the route publication test
remains incomplete. Closing the owned AVD, Metro and demo services restored
5.66 GiB available. These measurements include other desktop applications and
do not establish a controlled RAM saving for any individual setting. A paused
or failed scenario must not be reported as a passing device receipt.

On 2026-09-09, the constrained backend run passed synthetic seed and the real
backend smoke (3.853s and 2.015s after startup). Java startup confirmed the
512 MiB Firebase heap; a separate JVM check confirmed Maestro's 768 MiB heap.
The two focused runner/Metro checks passed. This does not establish a complete
Maestro flow under the new limits. After owned services and the AVD stopped,
Windows reported 5.81 GiB available versus 0.83 GiB during the overloaded run;
the user also confirmed improved responsiveness. Those snapshots include other
desktop applications and are not a controlled per-setting memory benchmark.

ADB reverse was observed to report success without forwarding HTTP traffic on
this workstation. The runner therefore uses the documented Android host alias
and checks HTTP connectivity from inside the device before running scenarios.
The network scenario disables both Wi-Fi and the simulated mobile-data path,
verifies that the device can no longer reach Metro, and restores the original
connectivity in a finally block. It searches an uncached phrase so cached
results cannot masquerade as successful connectivity.

## Initial measurements (2026-09-09)

Planner comparisons count scanner jobs, excluding checkout/planning/aggregation:

| Change/event | Previous scanners | Selected scanners |
| --- | ---: | ---: |
| Documentation PR | 5 | 1 (new-commit secrets) |
| Client source PR, no dependencies | 5 | 3 (CodeQL, Semgrep, secrets) |
| Client source merged to main | 4 | 2 (CodeQL, secrets) |

These are deterministic routing counts, not measured GitHub execution times.
The first remote run in PR #349 skipped unrelated Functions, Rules and taxonomy
checks. Client validation passed in 3m14s and planner validation in 11 seconds;
Semgrep, secret scans, dependency review and dependency audits passed. CodeQL
flagged a combined regex and file-derived local test payload. The regex was
split into independent predicates; seed and smoke now share in-code synthetic
account/recommendation definitions. Ten focused routing tests passed in 115 ms
and the revised real emulator smoke passed in 2.624 seconds after startup/seed.

A local comparison using the same eight policy tests executed 8 tests before
and 0 on receipt reuse. Measured wall times were 1.022 seconds before,
60.766 seconds for the first receipt-producing run, and 1.247 seconds on reuse.
This small workload did not demonstrate a time saving; machine load and input
hashing affect the result. No percentage or token saving is claimed. The latest
expanded tooling check passed 37 tests in 1.032 seconds. A subsequent focused
check of runtime input stability, offline cleanup and receipt reuse passed six
tests in 1.454 seconds.
A final runner check passed eight tests in 1.440 seconds, including a real hung
process that exceeded its deadline, was terminated and caused a failing result.
Startup attempts correctly rejected concurrent source and dependency changes
before issuing device evidence. After the parallel task finished and installed
dependencies matched the reviewed locks, auth and guest passed in 290 and 122
seconds. The real persisted-draft discard action completed. The deliberately
nonexistent Maestro screen failed as expected, completing the negative control.
The acceptance receipt was saved at `2026-09-09T07:10:47.732Z`.
Affected publication and network flows then passed in 328 and 281 seconds at
`2026-09-09T07:28:58.665Z`, reusing the binary. Receipts remain separate records
of their exact inputs; they are not combined or migrated to a later signature.
Helpers were stopped after screenshots and results were inspected.

The production upload inspection initially contained 2,429 files / 1,556,995,415
bytes, including generated local Android output. The repository-root .easignore
reduced the build-8 payload to 746 files / 33,890,084 bytes. The final inspection
contains 565 files / 33,079,949 bytes, with no matched emulator outputs, local
environment files, backend workspaces or Android flow files. Existing optional
iOS Maestro workflow and smoke-flow inputs remain present. These are unpacked
inspection sizes, not transfer bytes or cloud build durations.

The first local native compilation took 56m39s (641 Gradle tasks). An additional
build during harness development took 23m42s. The native rebuild after reviewed
dependency changes took 17m30s (641 tasks), completing at
`2026-09-09T07:00:30.074Z`. JavaScript-only flow revisions reused the APK.
This startup cost is not a per-push test cost.

Final review identified missing direct coverage for the Metro entry config and
an overly broad Maestro upload exclusion. Both were corrected: three focused
Metro tests passed in 237 ms and the actual EAS archive retained the iOS flow.
The selector now finds the direct Metro test without a missing-coverage error.

During device acceptance on this workstation, Windows reported 15.6 GB total
physical memory and only 0.8 GB free. Tutorial rendering sometimes exceeded the
initial 30-second wait, so the flows use a bounded 120-second tutorial wait.
Device timings include this resource pressure; they do not establish that
device checks are faster than Jest. Owner action-menu checks use the verified
synthetic account and inspect the edit/delete options without executing deletion.
The shared boot flow disables Expo SDK 57's floating Tools button through the
development menu, because it overlaps app controls on this AVD.

Device validation exposed real SDK migration defects: the removed
`StyleSheet.absoluteFillObject` produced zero-height gallery images, and an
Android gradient child intercepted photo taps. The local corrections use the
[current StyleSheet API](https://reactnative.dev/docs/stylesheet.html), a purely
decorative gradient, and safe-area-aware gallery/header controls. The complete
gallery flow then passed; its latest run took 187 seconds including CLI startup.
Three focused Jest suites also passed 29 tests in 17.823 seconds. These fixes
postdate the internal Play build 8 and are not yet included
in a replacement store artifact.

Local Firestore uses explicit long polling to avoid buffered emulator transport
responses; normal production initialization is unchanged. Synthetic accounts
include the current Noya onboarding completion as well as legal/profile consent.
