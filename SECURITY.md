# Security

Vocab Quest is built to be safe to install and run. This page explains how.

## What the app does and does not do

- **Fully offline.** Every network request from the app window is cancelled in the main process. The app has no telemetry, no analytics, no ads and no update server.
- **No personal data.** The only things stored are each player's chosen name and game progress (`progress.json` in `%APPDATA%\Vocab Quest`). They never leave your computer.
- **No permissions.** Camera, microphone, location, notifications, USB, serial and HID requests are all denied automatically.
- **Pronunciation uses the speech voices built into Windows.** Audio is generated locally; nothing is recorded.

## How it is hardened

Follows the [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security):

| Control | Where |
| --- | --- |
| `contextIsolation`, OS-level `sandbox`, `nodeIntegration: false`, no `<webview>` | `src/main/security.js` |
| Content is served from a custom `app://` protocol (not `file://`), with path-traversal protection | `src/main/security.js`, `src/main/main.js` |
| Strict Content-Security-Policy (no remote code, no inline script, no `eval`) as both header and meta tag | `src/main/security.js`, `src/renderer/index.html` |
| All navigation, redirects, pop-ups, downloads and webviews blocked | `src/main/main.js` |
| IPC is limited to three fixed channels and only answers the app's own top-level page | `src/preload/preload.js`, `src/main/main.js` |
| Everything received over IPC is validated: unknown keys dropped, numbers clamped, prototype-pollution keys rejected, player names stripped of control and text-direction characters, at most 8 players, size capped at 4 MB | `src/main/progress-schema.js`, `src/main/store.js` |
| Older saves are backed up before being upgraded | `src/main/store.js` |
| Saves are atomic (temp file + rename); corrupt files are quarantined, not trusted | `src/main/store.js` |
| The UI never parses strings as HTML (`textContent` only; `innerHTML` is banned by lint and tests) | `src/renderer/js/dom.js` |
| Electron fuses: `RunAsNode`, `NODE_OPTIONS` and `--inspect` disabled; ASAR integrity checked; app loads only from ASAR | `package.json` → `build.electronFuses` |
| DevTools and the menu bar are disabled in release builds | `src/main/main.js` |
| Single instance; installer runs per-user and never asks for admin rights | `src/main/main.js`, `package.json` → `build.nsis` |
| Zero runtime dependencies: no third-party code ships inside the app | `package.json` |

These controls are covered by automated tests in `test/unit/security.test.js`, `test/unit/main-process.test.js`, `test/unit/store.test.js` and `test/unit/static-safety.test.mjs`.

## Code signing

Release builds are not code-signed by default, so Windows SmartScreen may show "Windows protected your PC" the first time. Choose **More info → Run anyway**, or sign the installer with your own certificate (set `CSC_LINK` and `CSC_KEY_PASSWORD` before running `npm run build:win`).

## Reporting a problem

Please open a private security advisory on the GitHub repository rather than a public issue.
