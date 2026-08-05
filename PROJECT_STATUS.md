# PROJECT STATUS — Lottery Manager (Electron App)

> **Read this file FIRST in any new chat before touching code.**
> This file is the single source of truth for project state. Update it after every change (successful or failed) per the log format at the bottom.

---

## 1. What this project is

A custom Electron desktop app for managing scratch lottery tickets in a retail store (Big D Foodmart). Node.js/Express backend, HTML/CSS/JS frontend rendered in iframes, global keyboard hook for barcode scanner integration, auto-updates via GitHub Releases.

---

## 2. Where to find things

| What | Where |
|---|---|
| Live source code (always current) | `https://github.com/aehfaz-pixel/lottery-display-manager` (branch: `main`) |
| Commit history / diffs | `https://github.com/aehfaz-pixel/lottery-display-manager/commits/main` |
| Published releases (installers) | `https://github.com/aehfaz-pixel/lottery-display-manager/releases` |
| `latest.yml` (what version the updater thinks is newest) | `https://github.com/aehfaz-pixel/lottery-display-manager/releases/latest/download/latest.yml` |
| Local project folder | `D:\Store\Lottery\lottery-electron\` |
| Installed app (this dev machine) | `C:\Users\aehfa\AppData\Local\Programs\Lottery Manager\Lottery-Manager\Lottery-Manager.exe` |
| Updater cache/logs (this dev machine) | `%LOCALAPPDATA%\lottery-electron-updater\` (has a `pending\` subfolder for in-progress downloads) |
| Project knowledge (Claude project) | Should contain current copies of: `main.js`, `preload.js`, `server.js`, `package.json`, `fix-release.js`, `sync-version.js`, `pre-release-check.js`, all `src/renderer/*.html`, this file |

**If project knowledge files look outdated or contradict this file, trust GitHub `main` branch over project knowledge.** Project knowledge can go stale between uploads; GitHub is always current post-push.

---

## 3. Current state (last verified)

- **Version:** v1.0.17
- **Status:** ✅ Fully working — build, publish, and auto-update pipeline all confirmed functional end-to-end.
- **Git:** Repo initialized, tracked, pushed to `origin/main`. Baseline verified-working commit: `d17bc26` ("add pre-release safety check + changelog"), followed by the v1.0.17 release.
- **Auto-update flow confirmed:** app checks 5s after launch → downloads differentially → shows yellow "Downloading... X%" bar → shows green "Restart & Install" bar → silent install → auto-relaunch on new version. All tested live.

---

## 4. File structure

```
D:\Store\Lottery\lottery-electron\
├── main.js              — Electron main process, scanner hook, IPC, autoUpdater
├── preload.js            — IPC bridge to renderer (exposes window.electronAPI)
├── server.js              — Express server (port 3000), TLC scraping, image proxy
├── package.json            — version, build config, electron-builder publish config, release scripts
├── fix-release.js          — Post-build: renames dist files to match latest.yml (GitHub adds dots for spaces)
├── sync-version.js         — Post-version-bump: copies package.json version into lottery-app.html's versionTag span
├── pre-release-check.js    — Pre-release safety net: grep-checks critical code is present before allowing a release
├── CHANGELOG.md            — Human-readable one-line-per-release log
├── .gitignore              — excludes node_modules/, dist/
├── src/renderer/
│   ├── lottery-app.html         — Shell: 5 iframe tabs, update bar UI, theme toggle, scan routing
│   ├── lottery-home.html        — Dashboard (stats, slot breakdown)
│   ├── lottery-manager.html     — Main scanning/slot management
│   ├── lottery-admin.html       — Lottery types DB + Inventory
│   ├── lottery-display.html     — TV display (fullscreen slot grid + banner/slideshow)
│   └── lottery-repository.html  — Reports + full backup
└── dist/ (gitignored, regenerated per build) — installers, blockmaps, latest.yml
```

---

## 5. Architecture summary

- Shell (`lottery-app.html`) loads all tabs as iframes from `http://localhost:3000` (same-origin localStorage).
- Express serves static files from `src/renderer/` and proxies Texas Lottery (TLC) scraping.
- `uiohook-napi` provides a global keyboard hook for barcode scanning (works even when app isn't focused).
- `electron-updater` handles auto-updates from GitHub Releases (public repo).
- IndexedDB stores images (lottery ticket images, ad images, header promos).
- localStorage stores all app data (slots, inventory, sales log, settings) — see key list below.
- Dual scanner support: Scanner 1 (lottery) programmed with `~` prefix, routed to lottery manager; Scanner 2 has no prefix, flows through to Windows/other apps normally.

### Key localStorage keys
```
lotteryApp_slots, lotteryApp_db, lotteryApp_inventory, lotteryApp_sales_log,
lotteryApp_sales_archive, lotteryApp_monthly_archive, lotteryApp_promo,
lotteryApp_display_cfg, lotteryApp_theme, lotteryApp_updated
```

---

## 6. Auto-update system — CRITICAL, READ CAREFULLY

This is the part that broke once already (autoUpdater code silently disappeared from `main.js` between v1.0.1 and v1.0.5, likely from an older file being pasted over a newer one during unrelated feature work). It took an entire debugging session to rebuild and verify. **Do not remove or "clean up" any of the following without understanding why it's there.**

### Required in `main.js`:
```js
const { autoUpdater } = require('electron-updater');

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = false;

autoUpdater.on('checking-for-update', () => { ... });
autoUpdater.on('update-available', (info) => { ... notifyRenderer('update-available', ...) });
autoUpdater.on('update-not-available', (info) => { ... });
autoUpdater.on('download-progress', (progress) => { ... notifyRenderer('update-progress', ...) });
autoUpdater.on('update-downloaded', (info) => { ... notifyRenderer('update-downloaded', ...) });
autoUpdater.on('error', (err) => { ... notifyRenderer('update-error', ...) });

ipcMain.on('install-update', () => {
  autoUpdater.quitAndInstall(true, true); // MUST be (true, true) — isSilent=true = no NSIS wizard popup
});

// In app.whenReady() lifecycle, ~5s after window creation:
setTimeout(() => autoUpdater.checkForUpdates(), 5000);
```

**Gotcha:** `quitAndInstall(false, true)` (isSilent=false) will show the NSIS setup wizard on update instead of silently installing + relaunching. Must be `(true, true)`.

### Required in `preload.js`:
```js
onUpdateAvailable, onUpdateProgress, onUpdateDownloaded, onUpdateError, installUpdate
```
(all already present, exposed via `window.electronAPI`)

### Required in `src/renderer/lottery-app.html`:
- `<div id="updateBar">` with yellow "downloading" state and green "ready" state, plus a "Restart & Install" button calling `installUpdateNow()`.
- JS wiring: `onUpdateAvailable` → show yellow bar; `onUpdateProgress` → update %; `onUpdateDownloaded` → show green bar + enable button; button `onclick` → `window.electronAPI.installUpdate()`.

### Required in `package.json`:
```json
"build": {
  "publish": {
    "provider": "github",
    "owner": "aehfaz-pixel",
    "repo": "lottery-display-manager",
    "private": false,        // MUST be false — repo is public. "true" silently breaks update checks with NO error logged (this was the 2nd major bug found).
    "releaseType": "release"  // ensures published releases are NOT drafts (electron-builder drafts by default otherwise)
  }
}
```

**Gotcha #2:** `"private": true` in the publish config causes electron-updater to look for a GitHub token that doesn't exist on client machines, silently failing the update check with zero console output. This is invisible unless you add verbose logging (see below). Always confirm this is `false`.

**Gotcha #3:** `"draft": true` is NOT a valid electron-builder schema field (will throw a validation error and fail the whole build). Use `"releaseType": "release"` instead to avoid drafts.

---

## 7. Release process (current, as of v1.0.16+)

One command does everything:
```
cd /d D:\Store\Lottery\lottery-electron
npm run release
```

This runs, in order:
1. `node pre-release-check.js` — greps `main.js`, `lottery-app.html`, `preload.js`, `package.json` for all critical autoUpdater/updateBar code. **Fails loudly and stops if anything is missing** — this is the safety net that would have caught the original bug instantly.
2. `npm version patch --no-git-tag-version` — bumps `package.json` version (e.g. 1.0.16 → 1.0.17), does NOT create a git tag.
3. `node sync-version.js` — copies the new version into the `versionTag` span in `lottery-app.html` automatically (no manual find/replace needed anymore).
4. `electron-builder --publish always` — builds the Windows installer AND publishes directly to GitHub Releases (non-draft, since `releaseType: "release"`).
5. `node fix-release.js` — renames the built `.exe`/`.blockmap` to match `latest.yml`'s expected filename (GitHub replaces spaces with dots on download, so pre-renaming with dashes avoids mismatches).

**After confirming the release actually works** (app installs/updates correctly — don't just trust a successful build):
```
git add -A
git commit -m "v1.0.X - verified working: <short description>"
git push origin main
```

**Only commit verified-working states.** Do not commit if the build succeeded but the app behaves incorrectly — git history should only ever contain known-good checkpoints, so a future rollback is always trustworthy.

### Build environment requirement
Must run from **VS Developer Command Prompt** (not standard cmd) — a node-gyp compatibility patch for VS 2026 is applied at `node_modules/app-builder-lib/node_modules/node-gyp/lib/find-visualstudio.js`. Standard cmd will fail native module rebuilds (`uiohook-napi`).

### GH_TOKEN requirement
Must be set in Windows User Variables for GitHub publish to work from this build machine.

---

## 8. Debugging the updater (if it ever breaks again)

1. **Run the pre-release check manually first:**
   ```
   npm run prerelease-check
   ```
   If it fails, it tells you exactly which file is missing which piece of code.

2. **Check `latest.yml` on GitHub directly** to see what version the updater thinks is newest:
   ```
   https://github.com/aehfaz-pixel/lottery-display-manager/releases/latest/download/latest.yml
   ```

3. **Run the installed app with verbose logging** (this is how we diagnosed the `private:true` bug):
   ```
   "C:\Users\aehfa\AppData\Local\Programs\Lottery Manager\Lottery-Manager\Lottery-Manager.exe" --enable-logging
   ```
   Watch for `[updater]` lines: `Checking for update...`, `Update available`, `No update available`, `Progress: X%`, `Update downloaded`, or `ERROR:`. **Total silence with no `[updater]` lines at all after 10-15s is itself the symptom of the `private:true` bug** — check `package.json`'s publish config first.

4. **Check the updater cache folder for stuck/stale downloads:**
   ```
   dir "%LOCALAPPDATA%\lottery-electron-updater\pending"
   ```

5. **`npm run dev` does NOT test the updater** — dev/unpacked builds always print `Skip checkForUpdates because application is not packed and dev update config is not forced`. You must test on an actually-installed build.

6. **Compare against last known-good git commit:**
   ```
   git log --oneline -10
   git diff <last-good-commit> -- main.js
   ```

---

## 9. Known non-issues (don't waste time on these)
- CRLF/LF warnings from git on Windows — harmless, cosmetic.
- `node_modules already used by electron-builder` warning about `electron-rebuild` — harmless, cosmetic, ignore.
- Old GitHub releases (e.g. v1.0.9) left published without the update bar UI — harmless historical artifacts, just don't mark them "Latest."

---

## 10. Release Log (running — update every release)

Format for each entry:
```
## vX.X.X — YYYY-MM-DD
**Change:** <what was changed, with a short code snippet if relevant>
**Result:** ✅ Success | ❌ Failed — <what broke, what was reverted>
**Files touched:** <list>
```

---

### v1.0.6 — 2026-08-05
**Change:** Attempted to re-add missing `autoUpdater` block to `main.js` (found completely absent from uploaded v1.0.5 files) plus a basic green "Restart & Install" bar to `lottery-app.html`.
**Result:** ❌ Failed / reverted — installed app never showed any update UI; debugging revealed the update actually downloaded successfully but there was no yellow "in-progress" state, and confusion about which exe was installed led to a full revert of this release and its GitHub tag.
**Files touched:** main.js, lottery-app.html

### v1.0.7 – v1.0.9 — 2026-08-05
**Change:** Rebuilt autoUpdater step by step; discovered during v1.0.9 testing that the shipped `lottery-app.html` had ZERO update bar code because a "clean restart" step accidentally copied the original (unmodified) uploaded file back over the working version.
**Result:** ❌ Failed — update downloaded fine (confirmed via manual folder inspection) but no UI ever appeared since the code wasn't actually present in the built app.
**Files touched:** main.js, lottery-app.html, package.json

### v1.0.10 — 2026-08-05
**Change:** Correctly rebuilt `main.js` (full autoUpdater block + verbose `checking-for-update`/`update-not-available` logging) and `lottery-app.html` (working yellow/green update bar, wired to `onUpdateAvailable`/`onUpdateProgress`/`onUpdateDownloaded`). Verified via `--enable-logging` that `checkForUpdates()` correctly reported "already latest" for the first time.
**Result:** ✅ Success — installed manually to break the chain since v1.0.8/9 had no UI to consume a downloaded update.
**Files touched:** main.js, lottery-app.html, package.json

### v1.0.11 — 2026-08-05
**Change:** Version bump only, no code changes — used purely to test the full auto-update UI flow live for the first time.
**Result:** ✅ Success — yellow bar with live %, then green "Restart & Install" bar both appeared and worked correctly on the already-installed v1.0.10 app.
**Files touched:** package.json, lottery-app.html (version tag only)

### v1.0.12 — 2026-08-05
**Change:** `autoUpdater.quitAndInstall(false, true)` → `quitAndInstall(true, true)` in `main.js`, to make install silent (no NSIS setup wizard) instead of showing the installer UI.
**Result:** ✅ Success, but only took effect starting from v1.0.13 (the currently-*installed* version's code determines install behavior, not the newly downloaded version's code — v1.0.11 still had the old non-silent call baked in when it triggered the v1.0.12 install).
**Files touched:** main.js

### v1.0.13 — 2026-08-05
**Change:** Version bump only, used to re-test silent install now that the fix from v1.0.12 was actually running.
**Result:** ✅ Success — confirmed fully silent install + auto-relaunch, no wizard popup.
**Files touched:** package.json, lottery-app.html (version tag only)

### v1.0.14 — 2026-08-05
**Change:** Added `--publish always` to the `build` script in `package.json` so `electron-builder` publishes directly to GitHub instead of requiring manual upload via the GitHub website.
**Result:** ⚠️ Partial — publish succeeded and uploaded files correctly, but electron-builder defaults to creating **draft** releases, which don't show as "Latest" and aren't picked up by the updater until manually published on GitHub's site.
**Files touched:** package.json

### v1.0.15 — 2026-08-05
**Change:** Attempted to add `"draft": false` to the `publish` config in `package.json` to prevent draft releases.
**Result:** ❌ Failed first attempt — `"draft"` is not a valid field in electron-builder's schema, build failed with a validation error and did not run at all. Fixed by removing `"draft": false` and using `"releaseType": "release"` instead, which achieves the same non-draft result and is schema-valid.
**Files touched:** package.json

### v1.0.16 — 2026-08-05
**Change:** (1) Established git version control for the project for the first time in this session (found a pre-existing but severely stale repo, last commit was "Initial release v1.0.1"). Committed full working state as a baseline. (2) Added `sync-version.js` + a consolidated `npm run release` script that bumps version, syncs the HTML version tag, builds, and publishes — all in one command, removing the need to manually edit two files before every release.
**Result:** ✅ Success — confirmed full pipeline works: single command bump→build→publish→live on GitHub→auto-detected and silently installed by the previously-installed version.
**Files touched:** package.json, sync-version.js (new), .gitignore (new)

### v1.0.17 — 2026-08-05
**Change:** Added `pre-release-check.js` (greps all critical files for required autoUpdater/updateBar/preload code before allowing a release to proceed) and wired it into `npm run release` as the first step. Added this `PROJECT_STATUS.md` file and `CHANGELOG.md` for cross-session continuity.
**Result:** ✅ Success — verified the check runs automatically, passes correctly, and the full `npm run release` pipeline (check → bump → sync → build → publish) completes and produces a working, auto-updating release.
**Files touched:** pre-release-check.js (new), package.json, PROJECT_STATUS.md (new), CHANGELOG.md (new)

<!--
ADD NEW ENTRIES BELOW THIS LINE, MOST RECENT AT THE BOTTOM.
Also remember to bump the "Current state" section (§3) at the top of this file after each verified release.
-->
