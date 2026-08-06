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
| Auto-backup folder (this dev machine) | `%APPDATA%\lottery-electron\auto-backups\` (5 most recent daily backups kept) |
| Project knowledge (Claude project) | Should contain current copies of: `main.js`, `preload.js`, `server.js`, `package.json`, `fix-release.js`, `sync-version.js`, `pre-release-check.js`, all `src/renderer/*.html`, this file |

**If project knowledge files look outdated or contradict this file, trust GitHub `main` branch over project knowledge.** Project knowledge can go stale between uploads; GitHub is always current post-push.

---

## 3. Current state (last verified)

- **Version:** v1.0.33
- **Status:** ✅ Fully working — build, publish, auto-update, full-backup-import, promo image storage, daily auto-backup, and scanner routing (Scanner 1/Scanner 2 separation + window-focus-aware Manager routing) all confirmed functional end-to-end, tested on real packaged builds.
- **Git:** Repo tracked, pushed to `origin/main`, currently at commit `b1b0e2a`.
- **Auto-update flow confirmed:** app checks 5s after launch → downloads differentially → shows yellow "Downloading... X%" bar → shows green "Restart & Install" bar → silent install → auto-relaunch on new version.
- **Full backup import confirmed:** on a completely fresh install, importing a `.lotterybackup` file correctly restores ALL data — verified with 86 real slots on 2 separate fresh devices, and again during the v1.0.29→v1.0.30 device migration.
- **Promo/header image upload confirmed:** fixed a separate IndexedDB versioning bug (see §6.6).
- **Daily auto-backup confirmed:** silently backs up on first launch each day to `auto-backups/`, keeps 5 most recent, "Open Backup Folder" button in Repository tab works.
- **Scanner routing confirmed (see §6.7–6.9 for the bugs found getting here):**
  - Only the `~`-prefixed lottery scanner (Scanner 1) can trigger app actions, from any source (OS-level global hook, and each tab's local browser-level fallback listener).
  - Scanner 2 / manual keyboard input is fully ignored everywhere except when a specific input field is deliberately focused (e.g. typing into Add Inventory).
  - When the app window itself lacks OS focus, a `~` scan always routes to Manager regardless of which shell tab happens to be selected — verified across 8 focus/tab/prefix scenarios on the real packaged v1.0.33 build.

---

## 4. File structure

```
D:\Store\Lottery\lottery-electron\
├── main.js              — Electron main process, scanner hook, IPC, autoUpdater, auto-backup
├── preload.js            — IPC bridge to renderer (exposes window.electronAPI)
├── server.js              — Express server (port 3000), TLC scraping, image proxy
├── package.json            — version, build config, electron-builder publish config, release scripts
├── fix-release.js          — Post-build: renames dist files to match latest.yml (GitHub adds dots for spaces)
├── sync-version.js         — Post-version-bump: copies package.json version into lottery-app.html's versionTag span
├── pre-release-check.js    — Pre-release safety net: grep-checks critical code is present before allowing a release
├── CHANGELOG.md            — Human-readable one-line-per-release log
├── .gitignore              — excludes node_modules/, dist/
├── src/renderer/
│   ├── lottery-app.html         — Shell: 5 iframe tabs, update bar UI, theme toggle, scan routing (incl. window-focus check)
│   ├── lottery-home.html        — Dashboard (stats, slot breakdown)
│   ├── lottery-manager.html     — Main scanning/slot management, Customize modal (Borders/Fonts only)
│   ├── lottery-admin.html       — Lottery types DB + Inventory (incl. Add Inventory tilde-aware scan field)
│   ├── lottery-display.html     — TV display (fullscreen slot grid + banner/slideshow)
│   └── lottery-repository.html  — Reports + full backup + daily auto-backup trigger
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
- **Dual scanner support (as of v1.0.31–33):** Scanner 1 (lottery) is programmed with a `~` prefix and is the *only* input source that can trigger app actions, from any focus state. Scanner 2 (or manual keyboard) is never routed to any app logic — it flows through to whatever else has focus, exactly like a normal keyboard, *except* when a specific input field inside the app (e.g. Add Inventory) is deliberately focused, in which case it types normally like any text field. See §6.7–6.9 for the three bugs found while building this out.
- **Window-focus-aware routing (v1.0.33):** if the app window itself lacks OS focus when a `~` scan arrives, it always routes to Manager regardless of which shell tab was last selected — so a scan made while looking at another app never lands in a leftover Inventory/Admin tab.

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

**Note on Windows `cmd` and multi-line commit messages:** plain Command Prompt does not handle multi-line `-m "..."` strings reliably — each newline gets interpreted as a separate command once the quoted string ends up spanning lines in the terminal. Keep `-m` messages to a single line, or use `git commit --amend -m "..."` afterward if you need to fix a truncated message.

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

5. **`npm run dev` does NOT test the updater** — dev/unpacked builds always print `Skip checkForUpdates because application is not packed and dev update config is not forced`. You must test on an actually-installed build. **The same is true for window-focus behavior (§6.9) and auto-backup (§6.8-adjacent)** — dev mode is fine for logic checks (console logs still work), but always do a final pass on a real packaged install before considering a release truly verified.

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
- **QR-code/phone-relay scanner testing showing occasional intermittent drops** — not an app bug. The global hook's burst-detection window (`BURST_MS = 50`) requires every keystroke in a scan to land within 50ms of the previous one. A real USB scanner hits this easily; a phone app relaying over Bluetooth after optical decode sometimes doesn't, causing an occasional silently-dropped scan during testing. Re-scanning normally succeeds. This is a testing-method artifact, not something to "fix" unless the *real* Netum scanner also shows drops.

## 6.5. Full backup import — CRITICAL, READ CAREFULLY

**This bug took an entire multi-hour debugging session (v1.0.6 through v1.0.27) to fully resolve. Understand it before touching import/restore code.**

### The symptom
Importing a `.lotterybackup` file worked perfectly on one long-lived device but silently lost data (specifically `lotteryApp_slots`, sometimes everything) on every freshly-installed device, no matter how the file was transferred (USB, email) or how large it was.

### Red herrings ruled out (in order investigated — don't waste time re-testing these)
- **File corruption in transfer** — ruled out; file sizes and content matched byte-for-byte via direct inspection.
- **Storage quota exceeded** — ruled out; total localStorage usage was ~1.9MB, nowhere near the 5-10MB browser limit.
- **Manager tab's 10-second auto-push interval clobbering fresh data with stale in-memory state** — a real secondary risk (now mitigated with a staleness guard in `lottery-manager.html`'s interval), but NOT the primary cause.
- **Iframe-level page reload not fully destroying old JS contexts** — addressed by switching from `window.location.reload()` to a true `mainWindow.loadURL()` triggered via IPC (`full-window-reload`), then further hardened to a full `app.relaunch()` process restart (`app-restart-for-import`). Improved robustness but did NOT fix the core bug.
- **Chromium `localStorage` flush timing not completing before process restart** — extensively tested with increasing delays (300ms → 2500ms) and `session.flushStorageData()`. Did NOT fix it — because the real bug was elsewhere entirely.
- **Missing persistent session partition** — a REAL secondary bug that was fixed (see below) but not the cause of THIS specific symptom.
- **Device-specific hardware/Windows version issue** — ruled out conclusively when the bug reproduced on the developer's own build machine with a wiped fresh profile.

### The REAL root cause
A **double-JSON-encoding bug** in the file-based import staging mechanism (added in v1.0.24+ as a more reliable alternative to trusting browser storage flush timing):

```js
// BUG (main.js): backupData arrives via IPC already as a JSON.stringify'd string.
// Calling JSON.stringify() on it AGAIN wraps the entire JSON text as one big string-within-a-string.
ipcMain.on('stage-import-data', (_e, backupData) => {
  fs.writeFileSync(PENDING_IMPORT_PATH, JSON.stringify(backupData)); // ❌ double-encoded
});
```

On the next app launch, `JSON.parse(raw)` in the renderer only unwraps ONE layer of encoding, yielding back the *original JSON text as a plain string* instead of an object. `Object.entries()` on a string then iterates every individual **character** as a fake numeric key (`"0": "{", "1": "\"", "2": "v", ...`). For a ~2.5MB backup, this produced **2,523,956 fake single-character "keys"**, none of which were real data — explaining both the severe multi-second hang (2.5 million `localStorage.setItem` calls) and the complete data loss (none of the real keys like `lotteryApp_slots` ever got set).

### The fix
```js
// main.js — write the already-stringified data directly, no double-encoding:
ipcMain.on('stage-import-data', (_e, backupData) => {
  fs.writeFileSync(PENDING_IMPORT_PATH, backupData); // ✅ correct
});
```

### Why this was so hard to find
Every earlier fix attempt (persistence partition, process restart, flush delays) was solving *real but secondary* issues that made the symptom slightly different each time, without addressing the actual corruption — which only became visible once structured file-based debug logging (`import-debug.log` in `%APPDATA%\lottery-electron\`) was added and showed the exact "17 keys staged → 2,523,956 keys read back" mismatch.

### Current architecture (as of v1.0.27)
1. `lottery-repository.html`'s `importFullBackup()` reads the `.lotterybackup` file, then calls `stageImportData()` to write it to a **plain disk file** (`pending-import.json` in the app's userData folder) via genuinely synchronous `fs.writeFileSync` — NOT relying on browser `localStorage` flush timing at all.
2. It then calls `restartAppForImport()`, which flushes session storage (defensive, 2s buffer) then does a true `app.relaunch()` + `app.exit(0)` — a full process restart, not just a window/page reload.
3. On the next launch, `lottery-app.html`'s `applyPendingImportThenStartFrames()` runs **before any tab iframe starts loading** (iframe `src` attributes are deliberately deferred via `data-src` until this completes) — it reads the staged file, applies every key to `localStorage`, and only THEN sets the iframe `src` attributes to begin loading tabs.
4. The staged file is only deleted (`confirm-import-applied` IPC call) AFTER the renderer confirms the apply loop fully completed — so a hang or crash mid-apply leaves the file intact for automatic retry on next launch, rather than silently losing data.
5. `import-debug.log` (plain text, timestamped) logs every step of this sequence on every launch — check it first if import issues ever recur:
   ```
   type "%APPDATA%\lottery-electron\import-debug.log"
   ```

### Debugging checklist if backup import ever breaks again
1. Check `import-debug.log` first — it will show the exact staged key count vs. applied key count. A mismatch here is the #1 thing to check.
2. Confirm `main.js`'s `stage-import-data` handler does NOT call `JSON.stringify()` on `backupData` (it arrives pre-stringified).
3. Confirm `lottery-app.html` iframes still use `data-src` (not `src`) so they don't race ahead of the pending-import check.
4. Test on a genuinely fresh profile (`rmdir /s /q "%APPDATA%\lottery-electron"`), not just a re-install over existing data — the bug was invisible on long-lived profiles.

---

## 6.6. IndexedDB image store versioning — real bug, found via manual testing

**Symptom:** Promo Display had no image upload slots on a fresh install (also manifested earlier as `NotFoundError: One of the specified object stores was not found` console errors from `warmImgCache()` in Manager/Admin).

**Root cause:** All lottery ticket/promo images are stored in one shared IndexedDB database (`lotteryImages`, store name `images`), opened independently from **7 different places** across `lottery-admin.html`, `lottery-manager.html` (×2), `lottery-home.html`, `lottery-display.html` (×3), and `lottery-repository.html` (×2). Most correctly created the `images` object store via `onupgradeneeded` — but `lottery-display.html`'s 3 open calls did NOT have an upgrade handler at all. IndexedDB only fires `onupgradeneeded` for the very FIRST connection that creates a database at a given version. If the Display window happened to be the first thing to ever open this database on a fresh profile (very possible — Display is often opened early to check the TV output), it silently created the database at version 1 with **no store at all**, permanently breaking every other file's access to it (since they all also requested version 1, no further upgrade would ever fire).

**Fix:** Every one of the 10 `indexedDB.open(...)` call sites across all 7 files now consistently requests **version 2** with a defensive `if(!objectStoreNames.contains('images')) createObjectStore('images')` guard in `onupgradeneeded`. A repair routine (`repairImageStoreIfNeeded()` in `lottery-app.html`) also runs on every app launch, before any tab loads, to fix any already-broken existing profile automatically — no manual wipe needed for stores that were affected before this fix shipped.

**Lesson for future IDB/storage changes:** when multiple files share one IndexedDB database, EVERY open call must use the identical version number and have a matching `onupgradeneeded` handler — a single inconsistent file silently poisons the schema for the entire app, and the bug won't be visible until whichever file happens to connect first varies by user behavior.

---

## 6.7. Customize modal silently failed to open (v1.0.31 bug, fixed v1.0.31 same day)

**Symptom:** After removing three unused Customize sub-tabs (Spotlight/Featured/Slot Layout), clicking "Customize" did nothing at all — no modal, no error dialog, no console output visible to the user.

**Root cause:** The codebase had **two separate blocks of markup sharing `id="customizeModal"`**. One was genuinely live DOM (the full 6-tab version: Slot Tabs/Borders/Fonts/Slot Layout/Spotlight/Featured). The other was accidentally embedded **inside a JavaScript template literal string** in `lottery-manager.html`'s `openPrintWindow()` function (the report-printing code) — meaning it was never real DOM at all, not even in the original v1.0.29 source; it was always inert text sitting inside a JS string used to build a print-preview popup.

The first attempt at removing the unused sub-tabs identified "the duplicate" purely by raw text order in the file — without noticing that one copy was trapped inside a `<script>` block's string content. It deleted the **genuinely live** modal (believing it was the dead duplicate) and edited the **actually-dead** one (believing it was the real, working modal). After that, `document.getElementById('customizeModal')` returned `null`, and `.style.display='flex'` on `null` threw a silent error — no modal ever appeared.

**Fix:** Restored the real modal from the original v1.0.29 source, this time correctly trimmed down to just Borders + Fonts, and positioned it as genuine live DOM (outside any `<script>` block). Removed the harmless dead copy from inside `openPrintWindow()`'s template literal entirely, since it was unrelated debris with no real purpose there. Verified via static analysis that exactly one `id="customizeModal"` exists in real DOM, and zero occurrences remain inside any `<script>` block.

**Lesson:** When two elements share an `id` and you need to determine which one is "the real, live one," **check whether either copy is sitting inside a `<script>` block or JS string** — text order in the file is not the same as DOM order, and a duplicate ID inside a JS template literal never counts as real DOM. `getElementById` only ever sees genuinely parsed HTML elements.

---

## 6.8. Tilde character never reached the scan buffer (v1.0.31 bug, fixed v1.0.31 same day)

**Symptom:** After separating Scanner 1 (`~` prefix) from Scanner 2 so that only tilde-prefixed scans could trigger app actions, **no scan worked at all**, from any source — Netum scanner, phone-relay QR testing, nothing.

**Root cause:** `uiohookKeyToChar()` in `main.js` (the function that translates the global OS-level key hook's raw keycodes into characters) only has mappings for digit keys and letter keys A–Z. It has no case for the backquote/tilde key at all — so every `~` keystroke returned `null` from this function, and the scan-buffer handler immediately discarded it (`if (char === null) return;`) instead of adding it to the buffer. This meant the scan buffer **never actually contained a leading `~`** — only the digits that followed it — so `dispatchScan()`'s `code.startsWith(LOTTERY_PREFIX)` check was never true for any scan, regardless of source.

This bug was completely invisible before the Scanner 1/Scanner 2 separation shipped, because the old fallback logic forwarded *every* scan to Manager regardless of prefix — so a missing tilde in the buffer had zero visible effect.

**Fix:** Added `if (kc === 41) return '~';` to `uiohookKeyToChar()` — keycode `41` is `KEY_GRAVE` (backquote/tilde) in the standard Linux evdev keycode scheme already used consistently by the existing digit/letter maps in this function (confirmed by the fact `digitMap`'s `2`–`11` already matches `KEY_1`–`KEY_0` exactly in that same scheme).

**Lesson:** When adding any new "special" key to a hand-rolled keycode-to-character map like this one, verify the mapping against the actual underlying keycode scheme the rest of the map already uses (here: Linux evdev/`input-event-codes.h`), rather than assuming a key "just works" because it's a single visible character. Test the *specific* new key end-to-end, not just the digits/letters that were already working.

---

## 6.9. Scanner routing had two more gaps beyond the OS-level hook (v1.0.31→33 bugs, fixed same day)

**Symptom (found during testing, not before release):** After fixing §6.8, `~`-prefixed scans worked via the global OS-level hook — but Scanner 2 (no prefix) could *still* trigger actions in Manager or Admin/Inventory under certain conditions, and a `~` scan made while looking at a different app could land in whatever tab (Admin/Inventory) happened to be selected instead of Manager.

**Root cause #1 — local per-tab listeners bypassed the tilde requirement.** `lottery-manager.html` and `lottery-admin.html` each have their **own separate, local, browser-level `keydown` listener** — a fallback mechanism for when the Electron window has plain DOM focus, independent of the OS-level global hook in `main.js`. Fixing the global hook (§6.8, plus removing its old catch-all fallback) did nothing to these local listeners, since they're a completely separate code path. Neither had any tilde-awareness, so whenever the app window was genuinely focused with no specific field selected, Scanner 2's unprefixed input sailed straight through this second path.

**Fix:** Both local listeners now also require and strip a leading `~` before processing, exactly matching the OS-level hook's policy.

**Root cause #2 — routing was based on which tab was *selected*, not whether the app had real focus.** `lottery-app.html`'s `routeBarcode()` decided Manager vs. Admin purely by checking `activeTab` (the shell's last-selected tab) — with no awareness of whether the app window itself currently had OS focus. So a `~` scan made while looking at a completely different application would still route to Admin/Inventory if that happened to be the last tab left open in the Lottery app.

**Fix:** `main.js` now checks `mainWindow.isFocused()` on every `~`-prefixed scan and passes a `forceManager` flag through IPC to the shell. If the app lacks real OS focus, the scan is forced to Manager regardless of `activeTab`. When the app has focus, original tab-based routing is unchanged. This has no double-fire risk with the local per-tab listeners from Root cause #1, since those listeners can only fire when the app genuinely has OS focus (no browser keydown events occur without window focus) — the exact opposite condition to when `forceManager` applies.

**Verified via:** 8 explicit focus/tab/prefix combinations, tested on the real packaged v1.0.33 build via phone-camera QR scanning (see §9 for a note on why phone-relay testing occasionally shows dropped scans that aren't app bugs).

**Lesson:** When an app has *multiple independent paths* that can trigger the same action (here: one OS-level global hook, plus one local per-tab browser listener per relevant tab), a policy change (like "require a prefix") must be applied to **every** path, not just the most obvious/first one found. Search the whole codebase for `addEventListener('keydown'` (or equivalent) rather than assuming a single central handler covers everything.

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

### v1.0.24 — 2026-08-06
**Change:** Root-caused and fixed the backup-import data loss bug: a double-JSON-encoding error in the file-based import staging mechanism (`main.js`'s `stage-import-data` handler was calling `JSON.stringify()` on data that was already stringified). Confirmed via `import-debug.log` showing 17 real keys staged but 2,523,956 fake single-character "keys" read back after `Object.entries()` iterated over a giant string instead of an object.
**Result:** ✅ Success — this was the actual root cause after 5 earlier fix attempts (v1.0.19–1.0.23) addressed real-but-secondary issues (session persistence partition, process restart robustness, storage flush timing) without fixing the core bug.
**Files touched:** main.js

### v1.0.28 — 2026-08-06
**Change:** Cleaned up debug alert popups and redundant immediate-write code in `lottery-repository.html`'s import function, now that the file-staging + restart flow is the sole reliable mechanism. Documented the entire bug saga in this file (§6.5).
**Result:** ✅ Success — verified clean import (no debug alerts, correct data) on 2 independently fresh devices.
**Files touched:** lottery-repository.html, PROJECT_STATUS.md

### v1.0.29 — 2026-08-06
**Change:** Fixed a separate real bug found via manual testing: Promo Display had no image upload slots. Root cause was `lottery-display.html`'s 3 `indexedDB.open('lotteryImages', 1)` calls missing an `onupgradeneeded` handler — if Display connected first on a fresh profile, it silently created the shared image database without its `images` object store, permanently breaking image storage for the whole app (since no further upgrade would ever fire at the same version). Fixed by bumping ALL 10 open-call sites across 7 files to version 2, each with a defensive `objectStoreNames.contains()` guard, plus an automatic startup repair routine for already-broken existing profiles.
**Result:** ✅ Success — verified promo image upload works on the previously-broken device (via the automatic repair, no manual wipe needed) and confirmed auto-update still works correctly on 2 devices after this fix.
**Files touched:** lottery-admin.html, lottery-home.html, lottery-manager.html, lottery-display.html, lottery-repository.html, lottery-app.html

### v1.0.30 — 2026-08-06
**Change:** Version-bump test release only, no code changes — used to verify the auto-update flow end-to-end on a freshly-migrated device (see device migration notes: old npm-start setup → installed v1.0.29, via backup export/import).
**Result:** ✅ Success — update bar appeared correctly, downloaded, installed silently, relaunched at new version.
**Files touched:** package.json, lottery-app.html (version tag only)

### v1.0.31 — 2026-08-06
**Change:**
- Removed Spotlight/Featured/Slot Layout tabs from the Customize modal (no longer needed).
- Removed the Slot Tabs sub-tab entirely (its label/color settings were confirmed dead — `lottery-display.html` never read them).
- Added a daily auto-backup system: on first app launch each calendar day, silently exports a full backup (all `lotteryApp_*` localStorage keys + IndexedDB images) to `userData/auto-backups/`, keeping the 5 most recent and auto-pruning older ones. Added a new "Open Backup Folder" button in the Repository tab for manual USB copying.
- Reworked scanner handling so Scanner 1 (`~` prefix) exclusively feeds the app; removed the old fallback that forwarded any unprefixed scan to the Manager, and removed the now-unneeded scan pause/resume hotkey system entirely.
- Fixed the Add Inventory field truncating/rejecting tilde-prefixed scans (its `maxlength` and validation regex didn't account for the prefix character).

**Result:** ⚠️ Shipped with 3 undiscovered bugs, all found via manual post-release testing the same day and fixed in v1.0.32/v1.0.33 — see §6.7, §6.8, §6.9 for full write-ups:
1. Customize modal silently failed to open (deleted the wrong of two same-ID elements — one was inert JS-string content, not real DOM).
2. The tilde character was never actually captured by the OS-level scan buffer at all (missing keycode mapping), so prefix-based routing never worked for *any* scan.
3. The backup folder button and auto-backup silently failed due to `lottery-repository.html` running in an iframe without direct `window.electronAPI` access.

**Files touched:** main.js, preload.js, src/renderer/lottery-app.html, src/renderer/lottery-manager.html, src/renderer/lottery-admin.html, src/renderer/lottery-repository.html

### v1.0.32 — 2026-08-06
**Change:** Fixed a real regression found during same-day testing of v1.0.31 (see §6.9, root cause #1): `lottery-manager.html` and `lottery-admin.html` each have their own local, browser-level scan listener independent of the OS-level hook in `main.js`. Neither had been updated to require the `~` prefix, so Scanner 2 could still trigger actions whenever the app window was genuinely focused. Both listeners now require and strip the tilde prefix, matching the OS-level hook's policy.
**Result:** ✅ Success — verified via phone-camera QR scanning across multiple focus/tab combinations on the real packaged build.
**Files touched:** src/renderer/lottery-manager.html, src/renderer/lottery-admin.html

### v1.0.33 — 2026-08-06
**Change:** Added window-focus-aware scan routing (see §6.9, root cause #2). Previously, routing between Manager and Admin/Inventory was based purely on which shell tab was last selected, regardless of whether the app window had real OS focus. `main.js` now checks `mainWindow.isFocused()` on every `~`-prefixed scan and passes a `forceManager` flag through IPC; if the app lacks OS focus, the scan is forced to Manager regardless of the selected tab. When the app has focus, original tab-based routing is unchanged, and there is no double-fire risk with the local listeners fixed in v1.0.32 (mutually exclusive focus conditions).
**Result:** ✅ Success — verified across 8 explicit focus/tab/prefix scenarios on the real packaged build, including confirming Admin/Inventory's own scan handling and the Add Inventory field are both unaffected.
**Files touched:** main.js, preload.js, src/renderer/lottery-app.html

<!--
ADD NEW ENTRIES BELOW THIS LINE, MOST RECENT AT THE BOTTOM.
Also remember to bump the "Current state" section (§3) at the top of this file after each verified release.
-->
