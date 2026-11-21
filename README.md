# Dossier (Windows desktop, Electron)

Offline-first CV builder. Your data is plain JSON in a working folder you choose.

**Just want to use it?** Download the installer (`Dossier Setup x.y.z.exe`) from the [Releases page](https://github.com/dvynsh3/Dossier-CV/releases). It is unsigned, so Windows SmartScreen shows a warning: choose *More info*, then *Run anyway*.

## Run and build
1. Install Node.js 20+ from nodejs.org.
2. Double-click `run.bat` (first run installs packages, then starts the app), or `npm install` then `npm start`.
3. First launch asks for a working folder. Nothing works until one is chosen.
4. Windows installer: `npm run dist` (output in `dist/`, unsigned). After updating the source with `update.bat`, run `npm run dist` again to refresh the installed app.
5. Publishing a release: after `npm run dist`, run `npm run checksum`. It prints the installer's SHA-256 and a ready-to-paste block for the GitHub release notes.

## Layout
Top bar: Home (Overview, CVs, Applications) | Repository | Editor | Review | Import | **+** (new entry / CV / application) | Settings | profile.
Import has the importer on the left and a LinkedIn window on the right (separate sign-in per account, shared across profiles only when you pick an account from another profile).

## Privacy
- Everything is stored in your working folder; nothing is sent anywhere by default.
- Internet is used only when you ask: AI help (Gemini, Groq, Ollama), fetching a job page, site icons for links, the LinkedIn window. Names, email, phone and links can be removed before text is sent to any AI.
- API keys are encrypted with your Windows login and kept outside the working folder, so backups and exports never contain them.
- Custom templates cannot run scripts or load anything from the internet.

## Recovery
- Backups: made when a folder opens and while you edit (at most every 30 minutes, about two days kept). Settings > Data and backups to restore.
- Recycle bin: deleted entries and CVs stay 30 days (Settings > Recycle bin).
- Damaged files are set aside (quarantined) instead of deleted; data from a newer version is left untouched and reported.
- If the window stops working a dialog offers to reload. Logs: `%APPDATA%\cv-builder\logs\app.log` (secrets and user names are redacted).

## AI (optional, never automatic)
- **Ollama** (local): install Ollama, then Settings > AI models shows the exact command to run.
- **Gemini / Groq**: paste an API key in Settings > AI models. You see what is sent before it leaves the PC.

## Known limits
- No OCR for scanned PDFs, no .doc (save as .docx or PDF).
- Import grouping is best-effort; check the review screen.
- Word export is single column for multi-column templates; PDF is the intended look, retains multi-column formats.
- Multi-column templates are marked ATS "tolerant", single-column ones "safe".

## Development
- `npm test` runs the unit and UI suites (Node test runner, Playwright; UI tests use the browser harness in `dev/`).
- `npm run lint` type-checks for unused or undefined names.
- `npm run web` serves the interface in Chrome/Edge (file pickers use the browser; LinkedIn and Copy-file need the desktop app).
- Windows-only behaviour that cannot be tested headless is listed in `WINDOWS_TEST_LIST.md`; the refinement history is in `REFINEMENT_PLAN.md`.

## Licence
MIT, see `LICENSE`.
