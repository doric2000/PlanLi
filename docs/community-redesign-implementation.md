# Community redesign — implementation and iPhone verification

The user approved implementation after reviewing the Figma proposal. Design source:
[Community prototype](https://www.figma.com/proto/tBs3j3G9lD12Q1qlpaLpSK?node-id=123-3&page-id=123%3A2&scaling=contain&content-scaling=fixed).

## Scope

- Compact Community header: top safe area + 120 pt. Recommendations and Routes retain independent search, filters and sort through the existing navigator.
- Wide 16:10 feed photos, titles/excerpts limited to two lines, complete-reading action below the content, and existing author/favorite/like/comment/destination actions.
- Explicit text-search submission and debounced suggestions from the existing active-destination service, capped at five selected destinations. Text and destination constraints remain independent.
- Separate filters for each mode. Recommendation kosher/accessibility options remain. Route audience/experience filters are excluded from the UI/request because the current route composer does not collect them; historical records are untouched.
- Compact active-filter row, sort sheet, loading, empty and retry states. Recommendation map entry and current five-item navigation remain.
- Destination lookup clears cancelled loading state and permits retry after catalogue failure. No backend queries, schema, Rules or native dependencies changed.

## Validation

- Release readiness for iOS OTA against `c6ea08e063e3f5365de598c0b2138df3316ff1d1`: 85 suites / 731 tests passed. All applicable PR #372 checks passed.
- `npm run validate:changed -- --scope client`: 24 related suites / 245 tests passed.
- After final sort-sheet/label adjustments: 4 directly affected suites / 17 tests passed. These overlap with the first run and are not an additional 17 distinct tests.
- Final review found three edge cases; all were corrected: clearing filters preserves the independent text query, sheets fill the keyboard-adjusted area, and catalogue failure no longer hides successful destination search matches. Five new regression cases failed before the fixes; the final 5 affected suites / 33 tests passed, including the shared destination picker consumer. No second broad review was run.
- Local React Native Web preview uses the actual Community navigator, screens, cards, search, filters and bottom navigation with synthetic data and mocked services. No production data was modified.
- Browser exercised destination suggestions, explicit text submission, independent tab state, cancellation of unapplied route filters, kosher/accessibility selection, sort selection, map/list entry, retry after an error, empty results and loading.
- Feed scroll offset remained 379 px after a map round trip and after switching to Routes and back. Read more navigated through the real navigator with the complete description in its params; the preview's detail destination is a lightweight fixture, not the full production detail screen.
- At 390×844, with a two-line title, destination link and active filters, the first card ends at y=680.75 and navigation begins at y=740: 59.25 pt clearance. At 320×844 the first card ends at y=593 without active filters; no horizontal overflow was measured.
- A local layout fixture reproduced iOS KeyboardAvoidingView's 340 pt bottom padding on a 390×844 viewport. The filter header stayed at y=67, its destination input remained visible, and the Apply button ended at y=470, above the reserved keyboard area at y=504. This is layout evidence, not a physical keyboard test. Browser verification also confirmed that clearing and applying filter choices retains the search query.
- Native iPhone keyboard, map gestures, VoiceOver and physical-device rendering still require verification. Android emulator testing remains waived by the user. The Web map fallback does not prove native-map rendering.

## בדיקות באייפון לאחר התקנת העדכון

1. לפתוח את הקהילה: לוודא שהכרטיס הראשון, כולל התמונה, התקציר ו״קרא עוד״, נכנס מעל התפריט. לחזור על הבדיקה עם מסננים וכותרת ארוכה.
2. לחפש מדינה או עיר: לקבל הצעות אחרי שני תווים, לבחור יעד, ולהוסיף חיפוש טקסט. ניקוי הטקסט צריך להשאיר את היעד שנבחר. ניקוי המסננים בחלונית והחלתם צריכים לשמור על חיפוש הטקסט.
3. לבחור מסננים בהמלצות, לעבור למסלולים ולהגדיר חיפוש ומיון אחרים. לחזור לכל לשונית ולוודא שהבחירות נשמרו.
4. במסננים: לשנות בחירה ולסגור בלי ״הצג תוצאות״ — השינוי לא יוחל. לבחור שוב ולהחיל. כשרות ונגישות צריכות להישאר זמינות; התוצאות תלויות במידע שנשמר בהמלצות.
5. במסלולים: לבדוק משך, תקציב, רמת קושי, התניידות ואפשרויות מתקדמות. לא אמורים להופיע מסנני ניסיון וקהל יעד.
6. לפתוח המלצה ומסלול באמצעות התמונה ו״קרא עוד״. לבדוק מעבר לעיר, חזרה, דפדוף בתמונות, שמירה, לייק ותגובות.
7. לעבור למפת ההמלצות ובחזרה; לבדוק בחירת מקום ושמירת החיפוש והסינון. למסלולים אין כפתור מפה או מיון לפי קרבה.
8. לבדוק פתיחת מקלדת, סגירה, גלילה ומעבר בין מסכים, כולל טקסט מוגדל ו־VoiceOver. אין לכסות את כפתור החיפוש או את אזור המחוות התחתון.
9. לבדוק חיפוש ללא תוצאות וטעינה לאחר ניתוק זמני של החיבור. ״נסו שוב״ צריך לאפשר התאוששות בלי יציאה מהמסך.

## Rollback and release state

Baseline: `888b97a87231e90d3bf15e06740c468eb31d62c8`.
Local topic branch: `feat/community-compact-discovery`.

The Codex checkpoint is on the desktop at
`C:/Users/doric/Desktop/PlanLi-Community-Figma/implementation-checkpoint`.
It includes the baseline client archive and a scoped implementation manifest/patch.
Rollback must restore only the listed task files after comparing their current hashes,
and preserve unrelated or later changes. There is no rollback control in the app UI.

The user subsequently authorized an iPhone EAS Update on the existing production
channel. Publication follows the repository's reviewed PR/merge and staged-artifact
workflow; the current release result is recorded in README.md. App versions, native
build numbers and runtime configuration remain unchanged.
The pre-existing untracked root `app.json` is outside this task and was preserved.

Published iOS production group: [638d125b-fa3a-47c7-9d78-c8c3d767229f](https://expo.dev/accounts/doric2000/projects/client/updates/638d125b-fa3a-47c7-9d78-c8c3d767229f), source `7c420beef68f9b61c41f9bf544e5891af99ba29e`.
TestFlight remains 1.1.1 (30), runtime 1.3.0. Device application is not yet verified.
Immediate whole-OTA rollback group: `05fe7bdd-4153-43b3-a24b-14d49b3fd5c7`.
The same OTA includes the merged JavaScript operation feedback; also check its progress
banner and Activity history when changing an avatar or publishing content. Native
background transfers remain unavailable in build 30; no lock-screen delivery is claimed.
