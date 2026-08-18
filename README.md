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
        ├── lottery-app.html        ← Shell — 6 tabs as iframes, update bar, theme toggle, scan routing, Inspect toggle
        ├── lottery-home.html       ← Dashboard (stats, slot breakdown)
        ├── lottery-manager.html    ← Main scanning/slot management, Customize display settings
        ├── lottery-admin.html      ← Lottery types DB + Inventory (separate from Manager, not standalone/legacy)
        ├── lottery-display.html    ← TV display (fullscreen slot grid, jackpot banner, promo/ad slideshow)
        ├── lottery-repository.html ← Reports (Inventory Log, Day End Sales Report, Live Slots), full backup export/import, daily auto-backup
        ├── lottery-diagnostics.html← Diagnostics tab — live event timeline, error log, layout inspector viewer
        └── diagnostics.js          ← Shared library loaded by every page above — see "Diagnostics" section below
```

The shell (`lottery-app.html`) loads all six tabs as same-origin iframes served from `http://localhost:3000` by the Express server in `server.js`, so they all share one `localStorage`/IndexedDB.

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

**Bluetooth scanners (e.g. a phone acting as a scanner):** occasional dropped/missed scans are a known symptom of Bluetooth latency, not a bug — the app requires keystrokes to arrive in a tight burst (under 50ms apart) to be recognized as a scan at all, and a Bluetooth hiccup mid-scan will make it get silently ignored. If this happens often, check the connection or consider a wired scanner.

## Preview Scan Mode (added v1.0.38)

A second scan mode in Manager, toggled with the "🔍 Preview Scan" button in the header. Off by default.

- **Off (default):** scanning updates the ticket count instantly, same as always.
- **On:** scans are batched into a review window instead — scan several packs (from Manager, Inventory, or Admin, it doesn't matter which tab you're on), review the list, adjust quantities if needed, then **Save** to apply everything at once, or **Cancel** to discard the whole batch and change nothing.
- Quantity shown is the number of tickets sold (e.g. currently on ticket #5, scan #10 → 6 tickets), not the number of times you scanned.
- Every scan brings the Manager window to the front automatically, even if you were on a different tab or a completely different application.
- The toggle can't be switched off while a review window is open with unsaved scans — save or cancel first.

## Diagnostics (added v1.0.34)

A built-in troubleshooting toolkit, meant to replace most manual DevTools digging for common problems (routing issues, silent errors, layout/sizing bugs).

- **🩺 Diagnostics tab** — a live, filterable timeline of everything the app does: scans, routing decisions, state changes (with before/after diffs), errors (including ones that would otherwise fail silently), and layout events. Filter by category, Copy JSON to share a report, Clear to reset.
- **🔍 Inspect (top bar, works from any tab)** — click-to-inspect layout tool. Turn it on, click any element anywhere in the app, and see its real box size, content size, overflow amount, and key CSS — without opening DevTools. Turning it on/off affects every window at once. **Escape always turns it off**, no matter what.
- Layout problems (a slot too big/small, text overflowing its box) are also caught **automatically** in the background on Manager and Display — no need to go looking for them, they'll show up in the Diagnostics tab's "Layout" filter as soon as they happen.
- All of this runs fully local — no data leaves the machine, no network dependency, no account needed.

See `PROJECT_STATUS.md` §11 for the full technical architecture if you're extending this system.

## Display Window

- In the Manager tab, click "Open Display" to launch it (or it auto-opens on a second monitor)
- Drag the display window to your TV and press F11 for fullscreen
- Shift+A toggles a full-screen ad slideshow mode over the lottery display

## TLC Lottery Data (added v1.0.37)

- Scratch-off ticket data (name, price, image, pack size) is pulled from the Texas Lottery website once per lottery ID, then cached permanently — it's never re-fetched, since this data never changes once a game is published. A lottery ID may have many packs over time; they all share the same cached data.
- **A fresh install ships pre-loaded with ~72 common lotteries already known** — no lookup needed for those on day one. A genuinely new game (not in that starter set) is looked up automatically the first time it's scanned, then cached the same way going forward.
- Scanning a brand-new lottery ID in Add Inventory doesn't block further scanning — it shows a "🔄 Looking up..." placeholder and fills in automatically once the lookup finishes in the background.
- Admin's "🔄 Refresh"/"Sync All" only fetches lotteries missing data — it never re-checks ones already known.
- Inventory's "🔄 Refresh" button re-syncs each item's name/price/pack size from Admin's current data (one-way: Admin → Inventory), in addition to refreshing the view.

## Reports (Repository tab)

Three report types, all generated on-demand (nothing auto-saved to a file library like older versions — see CHANGELOG for what was removed):

- **Inventory Log** — filter Inventory by Loaded Date or Activated Date, using a manual range or presets (This Month / Last Month / Last 30 Days / This Year). Export as PDF or Excel, all 10 Inventory columns, sorted latest-first by the filter date.
- **Day End Sales Report** — press "Close Day" any time to generate a report covering 12:01am up to that moment (choose PDF or Excel); can be pressed more than once a day, each press makes a new snapshot. If a day passes with no manual close at all, the app auto-generates one (always PDF) at 12:10am or the next time the app opens, whichever comes first. Every configured slot appears, even with zero sales that day. Previous reports are listed in the modal and re-downloadable.
- **Live Slots** — an always-current, auto-refreshing table of every slot's Pack ID and current ticket number, split across 3 side-by-side tables. Has a Print button that opens your normal print dialog — pick a real printer or Save as PDF.

## Data & Backups

- All data lives in `localStorage` (slots, inventory, sales log, settings) and IndexedDB (ticket/promo images), shared across all tabs since they're same-origin iframes
- **Daily auto-backup:** the app silently exports a full backup once per calendar day on first launch, keeping the 5 most recent. Find them via the Repository tab's "Open Backup Folder" button, or directly at `%APPDATA%\lottery-electron\auto-backups\`
- **Manual backup/restore:** use the Repository tab's "Export Backup" / "Import Backup" buttons. Export produces a `.lotterybackup` file (localStorage + all images). Import stages the file to disk, then fully restarts the app to apply it cleanly — this is more reliable than a simple page reload, since it avoids browser storage flush-timing issues
- **To migrate to a new device:** install the app fresh on the new machine, launch it once, then use Import Backup with a `.lotterybackup` file exported from the old device (or old browser-based setup)

## Troubleshooting

**Scanner not being picked up:**
- Confirm Scanner 1 is actually sending the `~` prefix — test by typing into Notepad; you should see `~` followed by the barcode digits
- Unprefixed scans are *never* picked up outside a focused input field — this is intentional, not a bug
- If nothing at all is happening even with the `~` prefix, check the app's console (`npm run dev` opens DevTools automatically) for `[hook] Scan:` log lines to confirm the scan is being detected, or check the Diagnostics tab (no DevTools needed) — if a scan doesn't show up there at all, it never reached the app

**Port 3000 in use:**
- Close any other instance of the app or the old server
- Or change `PORT` in `main.js`

**Native module build errors (`uiohook-napi`):**
- Run `npm run rebuild-hid` manually in the folder
- Make sure you have Visual Studio Build Tools installed (Windows), and build from a **VS Developer Command Prompt** specifically — required for native module rebuilds during release builds

**Auto-update not working:**
- `npm run dev`/`npm start` never check for updates — this is by design (`electron-updater` skips checks on unpacked/dev builds). Only test update behavior on an actual installed build
- See `PROJECT_STATUS.md` §8 for a full updater debugging checklist
