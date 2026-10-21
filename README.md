# Vocab Quest

A free desktop game for Windows that grows your English vocabulary. Hear every word spoken, practise spelling it, and learn its synonyms and antonyms while you play.

![Vocab Quest home screen](docs/screenshot-home.png)

## Download

**[Download the latest version for Windows](https://github.com/DeoCookie/vocab-game/releases/latest)**, then run the **VocabQuest-Setup** file.

- Works on Windows 10 and 11 (64-bit). No admin rights needed.
- Prefer not to install? Download the **VocabQuest-Portable** file and run it from anywhere.
- The app isn't code-signed yet, so Windows may say "Windows protected your PC". Click **More info → Run anyway**.

## What's inside

- **500 carefully chosen words** across three levels (Everyday, Intermediate, Advanced). Each has a definition, an example sentence, synonyms and antonyms.
- **Four games**
  - **Study cards** – meet new words and review the ones that are due.
  - **Meaning match** – pick the right definition from four.
  - **Spelling bee** – the word is spoken aloud; type it out. Letter tiles show what you got right, and you can reveal a letter if you're stuck.
  - **Word sprint** – find synonyms and antonyms against a 60-second clock.
- **Pronunciation** with the voices built into Windows, at normal or slow speed. Click any synonym or antonym to hear it too.
- **Spaced repetition**: words you miss come back sooner; words you know are spaced further apart until mastered.
- **XP, levels, daily streaks and 13 achievements.**
- **Word book** to browse and search all 500 words.
- Light and dark themes, full keyboard play (`1`–`4` to answer, `Enter` to continue), screen-reader labels, and reduced-motion support.

## Run from source (for developers)

You need [Node.js](https://nodejs.org/) 20 or newer.

```powershell
git clone https://github.com/DeoCookie/vocab-game.git
cd vocab-game
npm install
npx playwright install chromium   # browser used by the UI tests
npm start
```

### Build an installer

```powershell
npm run build:win
```

This runs lint and every test first, then writes two files to `dist\`:

- `VocabQuest-Setup-1.0.0.exe` – a normal installer (per-user, no admin rights needed).
- `VocabQuest-Portable-1.0.0.exe` – a single file you can run without installing.

The builds are unsigned, so SmartScreen may warn on first launch. See [SECURITY.md](SECURITY.md#code-signing).

### Publish a new release

GitHub builds and publishes the download for you (`.github/workflows/release.yml`):

1. Bump `version` in `package.json` and add a `CHANGELOG.md` entry.
2. Commit, then tag and push:

   ```powershell
   git tag -a v1.0.1 -m "Vocab Quest 1.0.1"
   git push origin main --follow-tags
   ```

GitHub Actions then runs every test on Windows, builds the installer and portable app, and attaches them, with SHA-256 checksums, to a new release. If any test fails, nothing is published.

## Tests

```powershell
npm run verify      # lint + unit/security tests + UI tests
npm test            # unit, data and security tests only (no browser needed)
npm run test:e2e    # drives the real UI in Chromium
```

To make every `git push` run the full suite first:

```powershell
npm run hooks:install
```

| Suite | What it checks |
| --- | --- |
| `test/unit/data.test.mjs` | Exactly 500 unique words; every entry complete; definitions never give away the answer; synonyms and antonyms never overlap |
| `test/unit/srs.test.mjs` | Spaced-repetition scheduling and word selection |
| `test/unit/quiz.test.mjs` | Every one of the 500 words produces fair questions with exactly one right answer; spelling checks |
| `test/unit/state.test.mjs` | XP, levels, streaks (including across month/year ends), achievements, save-format agreement with the main process |
| `test/unit/security.test.js` | Window hardening, CSP, URL allow-listing, path traversal |
| `test/unit/main-process.test.js` | Loads the real main process against a fake Electron and checks permissions, network blocking, navigation lock-down and IPC sender checks |
| `test/unit/store.test.js` | Atomic saves, corrupt-file recovery, size limits, prototype-pollution defence |
| `test/unit/static-safety.test.mjs` | No `innerHTML`/`eval`, no remote URLs, no inline scripts, MIT license present |
| `test/e2e/app.test.mjs` | Plays every game end to end, checks pronunciation calls, persistence, settings, accessibility names and small-window layout, with zero console errors and zero outbound requests |

## Project layout

```
src/
  main/        Electron main process (window, security, saving)
  preload/     The three-method bridge between the page and the main process
  renderer/    The game itself: HTML, CSS, ES modules and data/words.json
test/          Unit, security and end-to-end tests
build/         Installer icon
```

## Your data

Progress is saved to `%APPDATA%\Vocab Quest\progress.json` and never leaves your computer. The app makes no network connections. Details in [SECURITY.md](SECURITY.md).

## License

Vocab Quest is free and open-source software, released under the [MIT License](LICENSE).
