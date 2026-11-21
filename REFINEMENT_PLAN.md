# Dossier refinement plan (baseline 1.0.2)

Versioning: v1.<backend>.<features/visual>. This pass changes mostly backend and structure, so stage zips are 1.1.2, 1.2.2, ... (the last number stays 2 because no features change).

## 0. What the survey found (facts, not guesses)

Size: about 6,100 lines of code in 28 source files, plus a 1 MB logo data file. Largest files: editor.js 82 KB, repo.js 67 KB, browse.js 41 KB, api.js 36 KB, templates.js 35 KB, importer.js 34 KB, ui.js 31 KB, review-tab.js 31 KB.

Style problems:
- Code is written as very long single lines: 215 lines over 300 characters, 5 over 1,000. Hard to read, review, diff and debug. The line count (6,100) hides how much code there is.
- Functions are huge and mix UI, state and logic (for example `drawDrawer` in repo.js, `drawRight` and `wirePreview` in editor.js).
- No module boundaries in the renderer: every file reaches into the global `App`, `UI`, `S` objects.

Dead code and bugs found by the type checker (my own run, since the package registry is blocked here and ESLint could not be installed):
- 48 unused variables, imports and functions (for example `liBlock`, `selIds`, `isHidden`, `norm` in editor.js; `sameData`, `pickData`, `optsOf`, `saveOpts`, `blocky` in repo.js; `NEEDS_WS`, `Workspace` in main.js; a whole unused destructure in picker.js).
- (Checked in Stage 2: the `QR` global IS defined in the browser, so the QR button works. This was only a gap in the lint settings, now fixed.)
- Two calls with the wrong number of arguments (app.js:39, browse.js:46) and a few possible-null reads in the importer (`grp` is null on some paths).
- About 15 silent `catch (e) { /* ignore */ }` blocks hide real failures.

Duplication: little copy-paste at line level, but repeated patterns: the template HTML (section/skills/education blocks repeated 5 times across templates.js and templates-extra.js), the export file-writing branches in api.js, "open file in new CV" setup repeated in picker.js, drag/drop and reorder animation helpers, version-wording logic in three places, ctx-menu builders.

Tests: 26 files, mostly one-off scripts for past versions. Only `ats.js` (all templates through a PDF text check) and `smoke.js` (walks every tab, no errors) pass and are run by `npm test`. Everything else is obsolete or hard-wired to old UI.

Security (what is already good): context isolation on, sandbox on, node integration off, external links open in the system browser, navigation away from the app is blocked, API keys encrypted with Windows DPAPI and stored outside the working folder, atomic JSON writes (temp file then rename), backups.

Security and safety gaps found (to fix):
1. IDs used in file paths without checking. `storage.js` builds `path.join(root, 'items', id + '.json')` straight from renderer input. An id like `../../x` can write or delete outside the folder. Fix: one `assertId()` allow-list (letters, digits, `_`, `-`) in the storage layer.
2. IPC is too trusting: `shell.openPath(p)` opens any path (including .exe, which runs it); `shell.showInFolder(p)`; `drag.start` takes any file. Fix: only allow paths inside the working folder or the export folder, and refuse executables and scripts.
3. `net.fetchText` and `net.checkUrl` fetch any URL from the main process (server-side request forgery against localhost/LAN). Fix: only http(s), block loopback/private/link-local ranges, size and time limits, redirect re-checks.
4. `innerHTML` is used in ui.js (`html` attribute), browse.js and repo.js with fixed strings. Verify none receives user or imported text; replace with DOM building or a sanitiser.
5. Imported documents (PDF, DOCX, LinkedIn zip) are parsed without limits. Fix: size caps, zip-entry count and expanded-size caps (zip bomb), page caps, and timeouts.
6. The Content-Security-Policy allows `style-src 'unsafe-inline'` and `https:` images. Fix what can be fixed; document what cannot (inline styles are used everywhere).
7. The preview and template iframes use `srcdoc` with generated HTML. Verify every user string is escaped by the template engine (names, links, QR text, custom templates imported from files). Custom `.cvtemplate` files are code-like input: restrict to HTML/CSS with no script, no external loads.
8. `webviewTag: true` for the LinkedIn window: confirm the webview preferences are locked (no node, no preload, separate session partition, permission requests denied).
9. `dev/server.js` serves the whole API over HTTP on 127.0.0.1 with no auth. It is dev-only, but must never be shipped and should require a random token and reject foreign `Host` headers (DNS rebinding).
10. `electron` and `electron-builder` are set to `latest` in package.json. Pin versions so builds are reproducible. Run `npm audit` on the user's machine (the registry is blocked here).
11. Errors can include API keys or file paths in toasts and logs. Add redaction.
12. Add a lock file and a clean `files` list so no test or dev files ship in the installer.

Resilience gaps found (to fix):
- No schema version on stored JSON, so no safe migrations. Corrupt files are silently skipped by `readJson` (returns fallback), which can make an entry or CV vanish without telling the user. Needs a quarantine folder and a visible "recovered" notice.
- Atomic write exists, but there is no write-failure handling (disk full, read-only folder, folder gone) in the UI, and no single-instance lock, so two copies (installed + source) can write the same folder at once.
- No global error handler: an uncaught exception in the renderer leaves a half-drawn UI.
- Preview rendering and exports run without a time limit; a pathological CV could freeze the window.

## 1. Order of work (each stage ends with tests, a zip, and a version bump)

### Stage 1 (1.1.2): Test foundation and safety net, no behaviour change
- Create `tests/` with one runner (`npm test`): unit tests (model, templates, importer, review, similarity, storage, api) in plain Node, plus UI tests with Playwright against `dev/server.js`.
- Port the useful parts of the old scripts (drag/drop helper, boot helper, smoke walk, ATS check, the reorder/animation checks, overview, repo drawer, picker, page break, keep-together). Delete the obsolete scripts.
- Add golden-file tests for export (HTML, DOCX structure, PDF text) and a fixtures folder with good and deliberately broken inputs (corrupt JSON, empty files, huge text, weird Unicode, old-schema CVs).
- Add a repeatable lint step: a small script using the TypeScript checker (as in this survey) so unused code and undefined names are caught every time. Add `.editorconfig`, and the same checker flags for CI.
- Baseline run; record results.

### Stage 2 (1.2.2): Data layer and backend hardening (src/core)
- `storage.js`: schema version + migration functions; `assertId()`; quarantine for unreadable files; typed errors; write-failure handling; same-folder single-instance lock; backup rotation checks; trash/cleanup edge cases; profile folder operations (rename, duplicate, delete) made transactional.
- `api.js`: split into one file per domain (items, cvs, export, applications, jd, ai, net, profiles, settings), each with input validation (a tiny schema checker) for every call; consistent error shape; remove the duplicated export branches; fix the possible-null paths.
- `importer.js`, `ai.js`, `net.js`, `exporters.js`, `review.js`, `similarity.js`: input limits and timeouts; null-safety; remove dead code; explain tricky heuristics in comments; unit tests with the fixtures.
- Security items 1, 3, 5, 10, 11.

### Stage 3 (1.3.2): Main process and shell security
- `main.js` / `preload.js`: split into modules (window, ipc, secrets, linkedin); allow-list IPC channels and arguments; path checks for openPath/showInFolder/dragStart; permission handler deny-all (except what is needed); lock webview prefs; single-instance lock; crash and unresponsive-window handlers; log file with rotation; DPAPI failure path (when encryption is unavailable, refuse to store keys in plain text, or warn clearly).
- Security items 2, 8, 9, 12 and the CSP review (6).
- Produce a Windows-only manual checklist (installer upgrade, icon, drag-out, DPAPI, LinkedIn window, shortcuts) because I cannot run Electron here.

### Stage 4 (1.4.2): Renderer foundation (ui.js, app.js, shared helpers)
- Introduce small modules with explicit exports: `dom` (h, clear, icon), `menus` (ctx menu), `dialogs`, `animate` (FLIP and slide helpers, one implementation), `store` (state and events), `keys` (shortcuts). Keep the UMD/global loading model so no bundler is needed.
- Global error boundary and toast pipeline; busy/cancel helpers; remove `innerHTML` use (item 4); fix the `QR` bug and wrong-arity calls; remove unused variables.
- Split the long one-liner functions; format all files consistently (a formatter script, no new dependencies).

### Stage 5 (1.5.2): Editor module
- Split `editor.js` (82 KB) into: state/history, preview (render + pager), sidebar (blocks pane), context menu, right panel (template/style/sections/header/options), exports/ATS dialogs. One file per concern, each under about 400 lines.
- Remove dead code from the old redesigns (list pane leftovers, relatedItems, etc.), unify version-wording logic, and move reorder/FLIP code to the shared animate module.
- Edge cases: empty CV, one entry, 500 entries, entries with no text, deleted repository entries still referenced by a CV, undo past the start, rapid drag, preview load failure, huge text.

### Stage 6 (1.6.2): Repository, picker and new-CV flows
- Split `repo.js` (67 KB): list/timeline, filters, drawer, versions, merge/smart rules, bin, skills table. Share the list-row component with the picker.
- Fix duplication between picker.js and repo.js filters; remove the dead `blocky` and data-compare helpers.
- Edge cases: 0/1/5,000 entries, duplicate ids, entries with missing fields, dates in odd formats, concurrent edits (drawer vs. list), bulk delete and restore, archive filters.

### Stage 7 (1.7.2): Home, Applications, Review, Import, Settings
- browse.js: split overview/CVs/applications; fix the possible-undefined `got.file`; application stamping and sorting edge cases; cover letters with empty fields; missing CV references.
- review-tab.js and review core: cache and cancel behaviour; very long CVs; AI timeouts.
- import-tab.js: file type sniffing, broken files, huge files, paste/drop handling, cancel mid-import.
- settings-tab.js: folder change/unavailable folder, profile switching during unsaved work, API key flows, logo and theme edge cases.

### Stage 8 (1.8.2): Templates and exports
- Remove the repeated section markup (shared partials for section heading, skills, education, entry rows); keep every template visually identical (checked with image comparison against current output).
- Escape and sanitise custom template input; template import size limits.
- Export checks: PDF, DOCX, PNG, HTML, JSON with long text, empty sections, odd page sizes, page breaks, keep-together, QR and photos. ATS checks on all templates.

### Stage 9 (1.9.2): Polish and release hardening
- Accessibility pass (focus order, labels, contrast in both themes, keyboard-only use of every dialog and menu).
- Performance pass (startup time, memory with large data, lazy load of heavy modules, logo data file loaded on demand instead of 1 MB at start).
- Final full test run, security re-review, README rewrite (build, recovery, privacy), "what's new/about" screen, changelog.
- Release candidate zip and a Windows manual test checklist. Version after this pass is set by you (1.9.2 or the next number you choose; 2.0.0 only if you say so).

## 2. Rules for every stage
- One read of each module, one edit session, one test run, then a zip. No re-reading unrelated modules.
- No visual or behaviour changes unless fixing a bug; any bug fix is listed in the stage notes.
- Every stage ends with: tests green, type-check clean for the touched files, a short changelog, and a list of things only you can verify on Windows.
- Old data must keep opening: each stage runs the old-schema fixtures.

## 3. Limits to keep in mind
- I can test the web build with a headless browser, but not the real Windows app. Anything that depends on Electron or Windows is reasoned and listed in a manual checklist.
- The package registry is blocked here, so I cannot run `npm audit`, install ESLint, or add new libraries. You should run `npm audit` on your machine after Stage 2 and Stage 9.
- Code signing needs a purchased certificate.

## 4. Stage 1 result (1.1.2)
- 73 tests: 70 pass, 3 are `todo` (known gaps fixed in Stage 2: path-like ids, quarantine of unreadable files, fetching local addresses).
- Run with `npm test` (unit + UI), `npm run lint`. The ATS test needs `pdftotext` and is skipped without it.
- Lint baseline: 52 findings (unused code, 2 undefined names incl. the `QR` bug), to be cleared in Stages 2 to 5.
- Fixed: pasted-text import never flagged duplicates of existing entries.
- Finding: `findDuplicates` on 400 entries takes about 3 s (performance, Stage 6).

## 5. Stage 2 result (1.2.2)
Done: id allow-list (`assertId`) on every path-building storage call; damaged item/CV files moved to `quarantine/` and reported to the user; schema numbers with migrations (older files upgraded on load, newer ones kept untouched and reported); friendly write errors (disk full, read-only, folder gone) with temp-file cleanup; `net.js` safe fetch (public http/https only, DNS and redirect re-checks, time and size limits) used by link checks, page fetch and link icons; import limits (25 MB, 30 PDF pages, zip entry and expanded-size caps, empty and damaged files); unused code removed from core and main.js. 81 tests green, no todo items left.
Moved to later stages: splitting api.js into one file per domain and a schema checker for every call (Stage 3, together with the IPC allow-list, because both define the same call list); pinning electron versions (needs the versions you have installed, see notes); single-instance folder lock (Stage 3, it needs Electron).

## 6. Stage 3 result (1.3.2)
Pinned electron 45.0.0 and electron-builder 26.18.0. `npm audit` (your run): 15 moderate findings, all one chain: `minimatch` (denial of service through crafted glob patterns) inside electron-builder's own build tooling. It runs only on your machine while building the installer and is not part of the installed app. `npm audit fix --force` would downgrade electron-builder to 20.x (breaking), so it was NOT applied. They clear when electron-builder ships a release that uses a fixed minimatch; re-run `npm audit` after updating it.
Done: `guards.js` (path policy, executable block list, URL checks, redaction, template sanitising) and `log.js` (rotating log, redacted); main process: single-instance lock, IPC accepted only from the app window with plain-object arguments and own-property action names, openPath/showInFolder/drag limited to the working folders (plus save-dialog choices) and never programs or scripts, deny-all permission handlers (clipboard copy allowed), locked LinkedIn webview preferences, crash and unresponsive-window dialogs, API keys stored as v2 values and never as plain text; errors shown to the user are redacted; dev server: host check (DNS rebinding), required custom header, only renderer/src/assets served, own-property actions; custom templates stripped of scripts, handlers and remote loads on save and on load; CSP tightened (no https images, object/base/form locked). 91 tests green.
Not done here: splitting api.js and a per-call schema checker (moved to Stage 4 with the renderer call wrapper, so both ends change together); Electron-only code cannot be run here, see STAGE3_WINDOWS_CHECKLIST.md.

## 7. Stage 4 result (1.4.2)
Verified on Windows by you (1.3.2): key test, opening an export, drag-out all work.
Done: every call from the window is checked by `api-schema.js` before it runs (ids, sizes, types; 94 tests green); lint is now fully clean (40 findings removed: unused variables and functions across the renderer, two wrong-argument calls, dead logo helpers); a global error handler in the window shows one calm message and writes the error (cleaned) to the log; Copy-file-to-clipboard follows the same folder rule as Open; the `innerHTML` uses were reviewed: all take fixed markup plus numbers, no user text (documented, left as is).
Moved on purpose: splitting ui.js into dom/menus/dialogs/animate modules and reformatting the long one-line functions. Those files are rewritten in Stages 5 and 6 (editor, repository), so doing the split there avoids touching them twice and keeps each zip testable.

## 8. Fixes after testing 1.4.2 (delivered as 1.4.3)
Found by you on Windows, fixed here with tests where the web build can run them:
- Repository drawer flicker, lost focus and vanishing text: every autosave rebuilt the whole page, including the drawer you were typing in, and typing in the "new wording" box also triggered it. Autosave now refreshes only the list; the new-wording box is excluded. Tests: tests/ui/repo.test.js.
- LinkedIn window floating over the import review: it now hides while the review is open and returns after Cancel/Add.
- New profile reused the previous profile's LinkedIn sign-in: accounts and browser sessions are now per profile (Main keeps its old names, so its sign-in survives). Switching profile closes the old profile's LinkedIn pages.
- PNG export: now one continuous image of the whole CV (it used to capture screen-sized pieces). Decision: done now, not in Stage 8, because it is one isolated function and a visible bug; Stage 8 will still re-check every export format. Electron-only part (window sizing and the stitching fallback) cannot run here: see WINDOWS_TEST_LIST.md.

## 9. Fixes after testing 1.4.3 (delivered as 1.4.4)
- Versions page: after "Add as version" the drawer jumped to Details and showed both pages. Two things were wrong: re-opening an entry forgot the tab, and drawing the drawer waits for data, so two overlapping draws both added their page (a test now catches this).
- LinkedIn over the import review: hiding the container did not work (the web page inside kept its own visible setting); it is now moved off screen while the review is open.
- Everyone logged out: sign-ins made before 1.4.3 are now handed to one profile (Main, or the first profile if Main was deleted) instead of only Main, remembered once. Each profile's sessions are separate browser sessions (own cookies and storage), which is the same isolation as separate browser profiles, not tabs of one.
- Start-up error: an unhandled animation promise (page transitions interrupted by another transition) tripped the new global error message. Fixed at the source; harmless browser noise is now ignored, and real errors show their short text.
- Splash cut off: the window is now maximised before it is shown (not after the first paint) and repainted once shown; the saved zoom is applied in the preload, before anything is drawn.
- Review tab: top bar now has the editor's buttons (Edit replaces Review).
- One running Windows test list (WINDOWS_TEST_LIST.md) replaces the per-stage checklist.

## 10. Stage 5 result (editor) — v1.5.2
- `renderer/editor.js` (~465 lines: state/history, selection, reorder, render, preview, inline editing, menus, zoom) split into `editor-left.js` (block pane), `editor-right.js` (template/style/sections/contact/options panels), `editor-export.js` (export, ATS, print preview) and `editor-template.js` (template editor). They share one `App.edKit`.
- New `tests/ui/editor.test.js` (6 tests): panel tabs, undo/redo, block pane, context menus, page break/keep-together/reorder, export/ATS/print dialogs, template editor, 150-entry and empty CV. Full suite: 104 pass, lint clean.
- Lesson: `page.evaluate(() => modalFn())` waits for the modal promise; tests must use a braced body.
- Not yet done: moving reorder/FLIP code out of editor.js, api.js split.

## 11. Fix round on 1.5.2 -> v1.5.4 (build and feature changes)
Versioning from here: 1.5.4 is this build; Stage 6 is 1.6.5, then 1.7.5 ... (middle = stage, last = feature/visual counter, fix rounds bump it further).
- A: splash is a still image (no fade or movement).
- B: adding a version slides in as a new card (no page rebuild, scroll kept); header gets New entry left of Refine on Repository (the + menu keeps New CV / New application there).
- C: LinkedIn: passkey calls blocked inside the window (li-preload.js, session preload) plus an "Open LinkedIn" button screen for signed-out accounts; no white trim (whole-pixel placement, dark backing); profile photo fetched in the page as a small embedded image (local-images-only CSP blocked the web address); account menu lists signed-in accounts of other Dossier profiles (picking one shares that browser, picking an own account separates again); import review fields spaced.
- D: Review: edit button beside layout button (see test list); Ctrl+Shift+S toast has Open and Show (new cv.filePath); showInFolder reports failures; Settings > Test crash recovery.
- F: undo/redo greyed out; right-click works on every block/heading; FLIP bug fixed (children were measured after their parent had started moving, so bullets cancelled the parent's animation); ATS "where" jumps to and highlights the line until clicking elsewhere in the dialog; DOCX export follows the template (header band, heading style, bullets, font); template editor dummy content is generic.
- General: one animation speed (--dur .26s) and curve across the app; view transitions are released after 1.5 s so slow screens no longer log "DOM update timed out".

## 12. Stage 6 result (repository, picker) — v1.6.5
- `repo.js` (615 lines) split by job: `personal.js` (personal details, links, QR), `ai-dialogs.js` (provider picker, "what leaves your computer" confirmation, rephrase), `repo-tools.js` (date parsing, skills table, smart rules, bin, AI refine, word-diff helper), `repo.js` (tab: toolbar, bulk, list, skills view, merge), `repo-drawer.js` (entry drawer, versions, proof, autosave). State shared through `App.repoKit` (`RS` = drawer element + state).
- Removed duplication: three copies of the word-diff markup -> `App.diffNodes`; `row`/`drawMerge2` wrappers; the two copies of "open the new CV in the editor" in the picker; fixed `s.items.map(row)` passing the array index as options.
- Performance: `findDuplicates` now prepares each entry once (tokens, bigram counts) instead of for every pair: 400 entries ~0.4 s instead of ~3 s, identical results (checked against the old code on 150 random entries: same 481 pairs).
- Tests: `tests/ui/repo-edge.test.js` (empty repository, odd/missing fields and long text, 600 entries, bulk delete + restore, date formats, deleting the open entry), plus duplicate-finder edge cases. 111 tests, lint clean.
- Not changed: picker and filter bar already share `UI.filterBar` / `UI.applyFilters` / `App.itemCard`; the picker's extra "Show" row is its own feature.

## 13. Stage 7 result (home, applications, review, settings) — v1.7.5
- `browse.js` split: Home stays in `browse.js`; applications tracker, job descriptions and cover letters moved to `browse-apps.js` (`App.apps`).
- Fixed: pending application edits are flushed before the list is reloaded or a new row is added (typing then switching tab within 400 ms lost the edit); file-less job description pick; names missing on CVs in sort; unreadable CV thumbnails; empty cover letter export; header missing for the letter export.
- `applications.list/save` ignore non-object entries and refuse non-list input; a corrupt file reads as empty.
- Review: concurrent redraws are discarded (rapid CV switching), deleted versions or CVs in compare, wrongly shaped AI answers.
- Settings/app: Show in Explorer guard, Change folder keeps the open CV if opening fails, restoring a backup clears the open CV.
- Tests: `home-edge` (5), `review-settings-edge` (3). Total 119 pass; lint clean.

## 14. Stage 8 result (templates and exports) — v1.8.5
- Template markup was already shared (partials for lists, skills, group rows, headers), so no refactor was needed and no template changed look.
- New sweep test: every built-in template x 8 edge CVs (empty, huge text, 150 entries, hostile text, Letter+privacy, photo+QR+labels, dangling references) renders with no leftover tags and no injected markup; Word, JSON Resume and native export and the HTML/JSON/Word files (odd names) all succeed.
- Custom templates: remote `src/srcset/poster/background` and CSS `behavior` / `-moz-binding` are now stripped (nothing loads from the internet). Size limit (500 KB) and script/handler stripping were already in place.
- Not testable headless: real PDF/PNG engine and ATS check on every template (WINDOWS_TEST_LIST section J).

## 15. Stage 9 result (polish) — v1.9.5
- Accessibility: dialogs (role, label, focus trap, focus return, default focus), menus (role, arrow keys), icon-only buttons named from tooltips, toasts announced, global focus ring, reduced-motion support, nav aria-current.
- Performance: logo data split; first load ships Classic and Paper only (158 KB instead of 1 MB), the rest loads on demand (`logo-more.js`).
- About card with version and what's new (`app.about`), README rewritten, CHANGELOG.md added.
- Tests: `a11y-perf` (2). Not covered headless: screen-reader speech, real startup timing (WINDOWS_TEST_LIST section K).
- Deferred: splitting `api.js`.

## 16. 1.10.6 fix round
Home bin/archive/no-drop drag rules, apps column and button changes, fade for all tabs, LinkedIn close/hover/corner fixes, compact repository toolbar, editor scroll restore, menu arrow keys from the preview, export dialog rework, DOCX header table with photo and QR, HTML screen margins, JSON Resume hidden, ATS line check case-insensitive. Tests: `stage10` (5) and extra unit tests; A4 was already the default page everywhere (unknown values fall back to A4).

## 17. 1.10.7
ATS line comparison moved to `src/core/ats-text.js` (`atsNorm`): ignores spaces around hyphens and dashes, curly quotes, capitals, soft hyphens. Cause of the user's real report: Windows PDF text came back as "net - banking".
