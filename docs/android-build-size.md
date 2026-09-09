# Android build size investigation — 2026-09-09

Play Console reports **37.8 MB for a new install of build 8**, compared with
**39.3 MB for build 5**, the earliest bundle uploaded to this Play application.
Its displayed update download for build 8 is 27.1 MB. These are Play's download
metrics, not the uploaded AAB size or storage occupied after installation.

| Artifact | Built | Uploaded AAB bytes | Play new-install download |
| --- | --- | ---: | ---: |
| 1.1.0 (5) | 2026-08-24 | 89,016,605 | 39.3 MB |
| 1.1.0 (6) | 2026-08-26 | 89,081,301 | Not inspected in this comparison |
| 1.1.0 (8) | 2026-09-08 | 89,797,854 | 37.8 MB |

The AAB grew by 781,249 bytes (0.88%) from the first Play bundle to build 8.
There is no evidence here of the installed download growing from 30 to 89 MB.
The exact historical 30 MB observation remains unverified.

EAS also lists an earlier successful **development APK**, version 0.19.4 (1),
built on 2026-08-14 from `f971f851ea34d10ebe1da47ab8b5cd1bce167006`, build ID
`d8fc9845-a5eb-433a-a7fc-8eaba64d8af3`. Its artifact URL now returns `NoSuchKey`,
so its bytes and packaged contents could not be compared. It was not a Play
bundle. The complete Android EAS inventory contains eight build attempts.

## What is inside the current upload

ZIP entries were inspected in all three available production AABs. Build 8 has
26.69 MB of compressed bundle metadata, including native debug symbols, and
32.42 MB of compressed native libraries across four CPU architectures. Android
documents that [bundle metadata is not packaged in installed APKs, and device
configuration determines which libraries and resources are downloaded](https://developer.android.com/guide/app-bundle/app-bundle-format).

Compared with build 5, compressed metadata increased by 4.86 MB and resources
by 2.88 MB, while native libraries decreased by 3.09 MB and DEX by 4.08 MB.
The JavaScript bundle increased from 2.82 MB to 3.62 MB compressed. These changes
mostly offset one another; they do not explain a 59 MB application increase.

The largest newly bundled image is `region-selector-reference-clean.png`,
2.16 MB compressed. Despite its filename, it is actively imported by
`regionDefinitions.js` and rendered by `RegionSelectorScreen.js`. The existing
1.31 MB welcome hero is also rendered by the authentication entry screen.
Image compression is a possible separate optimization, with visual validation;
these files should not be deleted as unused.

No archive entry matched the inspected campaign, Play marketing, temporary
output, Maestro, screenshot, test-result, service-account, environment-file,
keystore/private-key, nested APK/AAB or design-source filename patterns.
This is a file-content inventory check, not a guarantee about all embedded data.
The full entry lists, hashes and category totals are preserved locally in ignored
`.codex_tmp/validation/android/bundle-content-audit.json`.

## Source files sent to EAS

The source archive is a third, separate measurement. Before the new root
`.easignore`, local inspection accidentally included generated Android outputs:
1,556,995,415 unpacked bytes. The corrected inspection contained 33,890,084
unpacked bytes, and the actual build 8 upload was 28.6 MB. Backend workspaces,
emulator outputs, local environment files and marketing assets were excluded.
The inspected build 8 source archive remains preserved as release evidence.

Sources: [first Play bundle](https://play.google.com/console/u/0/developers/5821955120973423060/app/4975848568601147626/app-bundle-explorer?artifactId=4860223220972238915),
[current Play bundle](https://play.google.com/console/u/0/developers/5821955120973423060/app/4975848568601147626/app-bundle-explorer?artifactId=4860228347835005691),
authenticated EAS build inventory and downloaded AAB ZIP entries. Play values
were read on 2026-09-09 at approximately 09:00–09:04 +03:00.
