# Changelog
Version format: 1.<stage>.<counter> (stage = refinement stage, counter = feature/visual changes and fix rounds).

## 1.10.10 - Release checksum
`npm run checksum` prints the installer's SHA-256 with a paste-ready release-notes block. README explains how to verify a download.

## 1.10.9 - Repository files
Author is now dvynsh3 (LICENSE, package.json, About card), repository links added. Added MIT `LICENSE`, a download note for the installer in the README and `license` in package.json. No app changes.

## 1.10.8 - Packaging
The installed app now includes `li-preload.js` (the LinkedIn passkey block was silently missing from `npm run dist` builds). Added `.gitignore`.

## 1.10.7 - ATS check false alarm
The ATS line check no longer reports a line as broken when the PDF reader returns spaces around a hyphen ("net - banking"), curly quotes or capitals (`src/core/ats-text.js`).

## 1.10.6 - Fix round and features
Splash fades out. Home: New entry / CV / application in the header on every view, Bin (trash icon at the end of the category row, deleted CVs shown dimmed, restore or delete for good, drop a CV on it), Archive is its own place (drag in and out), no-drop cursor over Latest and All. Applications: CV, Cover and JD columns do not sort and share one look; Save closes the cover letter. Fade between every tab. LinkedIn: plain "not open" page, Close (X) button that keeps the sign-in, no more flickering tooltips, rounded top corners. Repository: toolbar becomes icons while the entry drawer is open, Personal closes the drawer. Editor keeps its scroll position across tabs. Export: left-aligned options, Exporting button with spinner, note that Word is single-column, JSON Resume hidden (code kept); Word export shows photo and QR in a header table; HTML export has page margins. Right-click menu arrow keys work from the preview. ATS line check ignores capitals.

## 1.9.5 - Polish
Dialogs trap keyboard focus and return it when closed; menus work with arrow keys; icon-only buttons have names for screen readers; toasts are announced; visible focus ring; respects reduced motion. Logo styles load on demand (about 0.9 MB less to parse at start). About card in Settings. README and changelog rewritten.
## 1.8.5 - Templates and exports
Edge-case sweep over all templates and exports. Custom templates can no longer load remote images or use old CSS tricks.
## 1.7.5 - Home, Review, Settings
Applications code split out; edits typed just before leaving the tab are no longer lost; safer Review switching, compare and AI answers; Settings guards.
## 1.6.5 - Repository
Repository code split into modules; merge-similar about 7x faster.
## 1.5.4 / 1.5.2 - Editor
Editor split into modules; undo/redo state, right-click on all blocks, animated bullets, ATS locate, DOCX follows template, LinkedIn shared accounts and passkey screen, crash dialog.
## 1.4.x and earlier
Test foundation, data layer (schema versions, quarantine), main-process security, renderer foundation, input validation.
