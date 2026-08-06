# Lottery Manager — Electron App

## Setup (first time only)

1. Install Node.js from https://nodejs.org (LTS version)
2. Double-click `start.bat`
   - It installs all dependencies automatically
   - It rebuilds native dependencies (`uiohook-napi`) for your Electron version
   - Then launches the app

## What's in this folder

```
lottery-electron/
├── main.js              ← Electron main process (windows, global scanner hook, IPC, autoUpdater, auto-backup)
├── preload.js            ← Secure IPC bridge between Node and browser (window.electronAPI)
├── server.js              ← Express server (TLC scraping API, image proxy), served on port 3000
├── package.json
├── start.bat            ← Double-click to run
└── src/
    └── renderer/
        ├── lottery-app.html        ← Shell — 5 tabs as iframes, update bar, theme toggle, scan routing
        ├── lottery-home.html       ← Dashboard (stats, slot breakdown)
        ├── lottery-manager.html    ← Main scanning/slot management, Customize display settings
        ├── lottery-admin.html      ← Lottery types DB + Inventory (separate from Manager, not standalone/legacy)
        ├── lottery-display.html    ← TV display (fullscreen slot grid, jackpot banner, promo/ad slideshow)
        └── lottery-repository.html ← Reports, full backup export/import, daily auto-backup
```

The shell (`lottery-app.html`) loads all five tabs as same-origin iframes served from `http://localhost:3000` by the Express server in `server.js`, so they all share one `localStorage`/IndexedDB.

## How it works

- `start.bat` launches Electron
- Electron starts `server.js` as a background process on port 3000
- The main window loads `lottery-app.html`, which loads the other tabs as iframes
- Barcodes are captured via a **global OS-level keyboard hook** (`uiohook-napi`), not USB HID device access — this means scanning works regardless of which window or app has focus
- The display window is a separate window you can drag to your TV screen

## Scanner setup — two scanners, two roles

This app is designed around **two physical scanners with different jobs**:

- **Scanner 1 (the lottery scanner)** must be programmed to prepend a `~` (tilde) character before every scan (via its own configuration barcodes — see its manual). Only `~`-prefixed scans are ever recognized as lottery actions, from any tab, at any time — this is Scanner 1's dedicated purpose.
- **Scanner 2 (or manual typing)** is for anything else — looking up products, other software, general typing. It is **never** picked up by the Lottery app's scan logic, except when you've deliberately clicked into a specific field inside the app (like the Add Inventory box), in which case it behaves like normal keyboard input.
- If the Lottery app window doesn't have focus (you're looking at something else) when Scanner 1 fires, the scan **always** goes to the Manager tab, regardless of which tab was last left open — so a scan never gets lost in a leftover Inventory screen.

**Setting the `~` prefix:** most USB barcode scanners (including the Netum NT-1228BC used here) support programming a prefix character by scanning special configuration barcodes printed in the scanner's manual — not through this app's settings. Look for "Enable Prefix Output" → "Add Prefix" → the hex code for `~` (`7E`) in your scanner's documentation.

## Display Window

- In the Manager tab, click "Open Display" to launch it (or it auto-opens on a second monitor)
- Drag the display window to your TV and press F11 for fullscreen
- Shift+A toggles a full-screen ad slideshow mode over the lottery display

## Data & Backups

- All data lives in `localStorage` (slots, inventory, sales log, settings) and IndexedDB (ticket/promo images), shared across all tabs since they're same-origin iframes
- **Daily auto-backup:** the app silently exports a full backup once per calendar day on first launch, keeping the 5 most recent. Find them via the Repository tab's "Open Backup Folder" button, or directly at `%APPDATA%\lottery-electron\auto-backups\`
- **Manual backup/restore:** use the Repository tab's "Export Backup" / "Import Backup" buttons. Export produces a `.lotterybackup` file (localStorage + all images). Import stages the file to disk, then fully restarts the app to apply it cleanly — this is more reliable than a simple page reload, since it avoids browser storage flush-timing issues
- **To migrate to a new device:** install the app fresh on the new machine, launch it once, then use Import Backup with a `.lotterybackup` file exported from the old device (or old browser-based setup)

## Troubleshooting

**Scanner not being picked up:**
- Confirm Scanner 1 is actually sending the `~` prefix — test by typing into Notepad; you should see `~` followed by the barcode digits
- Unprefixed scans are *never* picked up outside a focused input field — this is intentional, not a bug
- If nothing at all is happening even with the `~` prefix, check the app's console (`npm run dev` opens DevTools automatically) for `[hook] Scan:` log lines to confirm the scan is being detected

**Port 3000 in use:**
- Close any other instance of the app or the old server
- Or change `PORT` in `main.js`

**Native module build errors (`uiohook-napi`):**
- Run `npm run rebuild-hid` manually in the folder
- Make sure you have Visual Studio Build Tools installed (Windows), and build from a **VS Developer Command Prompt** specifically — required for native module rebuilds during release builds

**Auto-update not working:**
- `npm run dev`/`npm start` never check for updates — this is by design (`electron-updater` skips checks on unpacked/dev builds). Only test update behavior on an actual installed build
- See `PROJECT_STATUS.md` §8 for a full updater debugging checklist
