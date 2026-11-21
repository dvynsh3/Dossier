# Windows test list (everything not yet verified on a real Windows install)

This is the one running list. Items you have already confirmed are at the bottom. Run `npm install` once, then `npm run dist` (or `npm start`), and go through it top to bottom.
Latest build described here: **1.4.4**.

## A. Start-up and window (new in 1.4.4)
1. **No error at start**: start the app 5 times. The red "Something went wrong" message must not appear. If it does, read the short text in brackets and tell me what it says (also in `%APPDATA%\cv-builder\logs\app.log`).
2. **Splash screen**: the gradient + logo must fill the whole window, with no dark bar on the right or at the bottom, also when you start the app with a saved zoom other than 100% (Ctrl + / Ctrl -).
3. **Single instance**: start Dossier, then start it again (exe or `npm start`). The second launch only brings the first window forward.

## B. Repository (fixed in 1.4.3 and 1.4.4)
4. **Typing**: edit an entry's text in the details drawer for a while: no flicker, focus stays, nothing disappears.
5. **Versions page**: open Versions, type a wording, press **Add as version**: you stay on the Versions page, the new wording is listed, and Details and Versions never show together.
6. **Call checks (from 1.4.2)**: click through the main actions once: add an entry, edit, add a version, star, archive, delete and restore from the bin, save a CV, import a file, create a profile, set an API key. If a message says `Invalid "…"` or `Missing "…"`, tell me which action.

## C. Import and LinkedIn
7. **Import review**: import a file or LinkedIn zip. The review list covers the whole page and the LinkedIn window is NOT floating over it. After Cancel or Add, the LinkedIn window is back where it was.
8. **LinkedIn window**: sign in, browse, Ctrl+Tab still switches app tabs, right-click menu works, links to other sites open in your normal browser, no camera/microphone/location prompt ever appears.
9. **Each profile has its own browser**: 
   - Open Import > LinkedIn in the profile where you were signed in before: it should still be signed in. (Sign-ins made before 1.4.3 belong to Main, or to the first profile in the list if Main was deleted.)
   - Create a brand-new profile: LinkedIn there is signed out. Sign in with another account if you like.
   - Switch between the profiles: each keeps its own sign-in, never the other's.
   - If a profile is unexpectedly signed out, tell me which one is "Main" and which ones you had signed in.

## D. Top bar buttons (new in 1.4.4)
10. **Review tab buttons**: with a CV in the Review tab, the top bar shows Close, Print preview, Edit (pencil), Delete and Export (with its small dropdown: ATS check, Export options). Each one works on the CV that is being reviewed. Edit opens it in the editor.

## E. Security changes from 1.3.2 that were only partly tested
11. **Save-as export**: export with "Save as" to the Desktop, then Open it. It must open.
12. **Crash recovery**: in Task Manager > Details, end one "Dossier.exe" window process (the one with most memory): a dialog offers Reload.
13. **Logs**: `%APPDATA%\cv-builder\logs\app.log` exists and has no API keys in it.
14. **Old key file**: keys saved by an earlier version still work (they are upgraded when you save them again).

## Already verified by you
- Gemini test connection (1.3.2), opening an export, dragging a CV out (1.3.2)
- Starring, archiving, delete and restore, save, export, re-saving an API key (1.4.2)
- PNG export is one image of the whole CV (1.4.3)

## F. Editor (1.5.2, split into several files — behaviour should be unchanged)
- Open a CV: preview renders, left block pane (Ctrl+Q) and right panel tabs (template/style/sections/contact/options) all open and show content.
- Change accent/font/spacing: preview updates; Ctrl+Z / Ctrl+Y undo and redo.
- Right-click an entry and a section: menus open; Page Break, keep-together, move up/down work; drag to reorder.
- Inline editing of header and entry text; zoom controls.
- Export dialog (PDF/DOCX/PNG etc.), ATS readability check, print preview: open and close cleanly.
- Template editor: opens with dummy content, saves, closes.
- Large CV (100+ entries) and an empty CV open without errors.


## G. New or changed in 1.5.4 (please test these first)
1. Splash: still image, no fade or movement, no black bars.
2. Repository header: New entry sits left of Refine; the + menu on Repository shows only New CV and New application (other tabs still list New entry).
3. Versions: type a wording, Add as version: it slides in as a new card, no flash, the drawer does not scroll back to the top, and Details/Versions stay separate.
4. LinkedIn passkey: with a signed-out account (reopen the profile) you see an "Open LinkedIn" screen and Windows asks for nothing. Press the button: LinkedIn loads. On its sign-in page no passkey prompt should appear (if one still does, tell me; the button screen is the fallback).
5. LinkedIn window: no white strip at the bottom or right, also after maximising or resizing the window.
6. Import review: Title / Role / Organisation boxes have a gap between them.
7. LinkedIn account photo: sign in, wait a few seconds; the account pill and the account menu show your picture (or your initial if it could not be fetched).
8. Shared sign-in: in a new Dossier profile open the account menu; accounts that are signed in under other profiles are listed with the profile name. Pick one: it is signed in there (shared browser). Pick "Add another account" or this profile's own account: a separate browser again.
9. Review: "Open in editor" sits beside the layout (side-by-side) button.
10. Ctrl+Shift+S in the editor: toast "Saved a copy" with Open and Show; Show opens the folder with the copy's file selected. Export > Save as... > Show also opens the folder.
11. Crash recovery: Settings > Data and backups > Test crash recovery. The window should stop and a dialog should offer to reload. (In an unpackaged run, task manager shows every process as "Electron"; the button avoids guessing which one.)
12. Editor: undo/redo look greyed out and do nothing when there is nothing to undo/redo.
13. Editor: right-click on entries, headings and blocks (also where the grab cursor shows) opens the menu; dragging still works.
14. Editor: drag an entry that has bullet points; the bullets slide along with the entry.
15. ATS check on a CV where "1 line item(s) do not extract as continuous text" appears: click the message or a listed line; "Text as a parser sees it" scrolls to it and highlights it until you click elsewhere in the dialog (outside the text box).
16. DOCX export of the same CV in Modern/Classic/etc.: header band, heading style, bullets and font should now match the PDF closely (Word cannot match columns exactly: two-column templates are single-column in Word).
17. Template editor: sample content is generic (Jordan Taylor, Job Title, Company Name...).
18. Animations: all use the same speed and curve as the print-preview zoom; tell me any that still feel off.
19. After a few days of use, check %APPDATA%\cv-builder\logs\app.log: the "DOM update timed out" warning should no longer appear.

## H. Stage 6 (1.6.5): repository code was split into several files, behaviour should be identical
1. Repository tab: list, timeline / list / organisation views, filters, search, sort and the direction button all work.
2. Open an entry: drawer slides in, edit text (no flicker), star, archive, delete, versions (add / edit / make original / delete / compare / AI rephrase).
3. Bulk bar: select several entries; Tag, Set organisation/role/dates, Add to a CV, Archive, Move to bin (+ Undo toast).
4. Personal details card: fields, the dropdown arrows, links (add, QR, delete), photo add/remove, Skills toggle.
5. Merge similar: opens quickly (it was ~3 s for 400 entries); pairs show, Nest / Delete / Keep both work.
6. Smart rules, Bin (restore, empty), Refine (AI) dialogs open and close.
7. New CV window (+ menu > New CV): Repository tab picker, Browse CVs tab, LinkedIn tab; the "Add entries from the repository" window from the editor.

## I. Stage 7 (1.7.5): Home / Applications split into its own file, plus fixes
1. Home: Overview / CVs / Applications switch, category tiles, drag a CV onto a category and onto Archive, right-click menus, search and sort.
2. Applications: + Add application; type in a field and switch tab within a second, come back: the text is still there (a rare save race was fixed).
3. Applications: sort by every column (twice each); a row whose CV was deleted shows "The CV used here was deleted" on its CV icon.
4. Job description: attach by Browse, drag-drop, Ctrl+V a copied file and pasted text; a file that cannot be read gives a message instead of failing.
5. Cover letter: opening it with nothing filled in works; Export with an empty body says "Write the letter first"; Draft with AI; JD and CV side panels.
6. A CV card whose preview cannot load shows "Preview unavailable" rather than "Loading..." forever.
7. Review: switch CVs quickly in the drop-down; one clean screen results. Compare a CV with one you just deleted. AI results with odd shapes (list shown as text) render without errors.
8. Settings: Show in Explorer with a folder open; Change... then Cancel keeps the open CV; Restore backup leaves the editor with no stale CV.

## J. Stage 8 (1.8.5): templates and exports (templates were already built from shared partials, so no look changes are expected)
1. Export PDF, Word, PNG, HTML and JSON from two or three different templates with a long CV (2+ pages): all open, page breaks and Keep together behave, QR and photo appear.
2. Run the ATS check on every built-in template (Export > ATS check): none should report "do not extract" or missing sections.
3. A CV with an empty section, an entry with only a title, and a very long single bullet exports without errors.
4. Letter page size and a 5 mm margin: PDF and print preview still match.
5. Import a custom template file containing remote images or scripts: the template loads but nothing is fetched from the internet and no script runs.

## K. Stage 9 (1.9.5): polish
1. Start-up: the splash and the first screen appear as quickly as before or faster; the logo in the top bar is Paper (dark) or Classic (light).
2. Settings > Appearance > Logo: pick another style (e.g. Neon): it appears at once, becomes the top-bar logo and the window/taskbar icon; restart keeps it and still starts fast.
3. Settings > About Dossier: shows the version (1.9.5) and "What's new".
4. Keyboard only: Tab through a dialog (e.g. delete a CV): focus stays inside, Escape closes it and focus returns to the button you used; Enter confirms small dialogs.
5. Open any right-click or + menu and walk it with the Up/Down arrow keys, Enter to choose, Escape to close.
6. Tab through the top bar and tabs: a clear purple outline shows where you are, in both themes.
7. (Optional) Turn on Windows "Show animations" off (Settings > Accessibility > Visual effects): the app's animations become instant.
8. (Optional) Narrator: icon-only buttons are read by what they do (e.g. "Settings", "Create something new").

## L. 1.10.6 (fix round + features)
1. Start: the splash fades out quickly once the first screen is ready.
2. Home > CVs and Applications: New entry / New CV / New application stay in the header.
3. Drag a CV over Latest and All: the red "not allowed" cursor shows; over a category, Archive and Bin it does not. Drop a CV on Archive, open Archive, drag it onto All or onto a category: it leaves the archive.
4. Bin (trash icon at the right end of the category row): with many categories, they scroll under it with a fade. Delete a CV (menu or drop on the Bin): it shows dimmed in the Bin; hover Restore / Delete for good; right-click works; Empty bin.
5. Applications: CV, Cover, JD headers do not sort; the three buttons look alike (icon instead of "JD"); Save in the cover letter closes it.
6. Switch between every pair of tabs (Home, Repository, Editor, Review, Import, Settings): the page fades each time.
7. Import > LinkedIn: closed state shows only the "in" icon, "LinkedIn is not open" and Open LinkedIn. The trash icon (no text) resets; the X next to it closes LinkedIn but keeps you signed in; reopen with the button or the account menu. Hover "Open this page in your normal browser": its tip no longer flickers. The page's top corners are rounded like the card.
8. Repository with entry details open: sort / Tag / All entries buttons are compact; Personal; one group button that cycles; views show icons only; clicking Personal closes the details. Smart rules dialog has space before Types.
9. Editor: scroll down, switch tab and come back: same position. Right-click in the preview, then Up/Down arrows move through the menu (the page does not scroll).
10. Export dialog: options left-aligned; folder note on top; Word note; no JSON Resume button; while exporting a disabled "Exporting..." button with a spinner shows left of Close.
11. Word export: use a template with a photo and a QR code: both appear in the header (single column), with the template's header look; open in Word.
12. HTML export opened in a browser has margins on a white sheet.
13. ATS "do not extract" check (to see the message): Editor > Template > Edit, add this line at the end of the CSS box: li{hyphens:auto;width:90px} then Save as new template, run Export > ATS check: lines are listed and clicking one highlights it. Delete the test template afterwards.

## M. 1.10.7
1. Run the ATS check on the CV that showed "1 line item(s) do not extract" (Modern band, the "net-banking" line): it should now pass. The highlight/locate feature itself was confirmed working.
