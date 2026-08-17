# Changelog

## v1.0.37 — 2026-08-18
- Fixed: `fix-release.js` could match and rename/upload the wrong (stale, older-version) build if one was left over in `dist/` from a local test build — now matches strictly on the current version number and refuses to guess if no exact match is found. (This caused the bad v1.0.36 release below.)
- Added: TLC data now caches permanently once fetched instead of re-checking every 24 hours (scratch-off data never changes once published) — see `PROJECT_STATUS.md` §12a
- Fixed: Add Inventory could add the same physical pack twice if scanned at different ticket numbers — duplicate detection now correctly ignores the ticket-number suffix (§12b)
- Changed: scanning a brand-new lottery ID in Add Inventory no longer blocks further scanning while looking it up — it now resolves in the background and fills in automatically (§12c)
- Fixed: a lottery created via Inventory's background lookup could show a missing image in Admin until a manual "Sync All" — image cache now syncs automatically across tabs (§12d)
- Changed: Inventory's "🔄 Refresh" button now also re-syncs each item's name/price/pack size from Admin's current data, not just the view (§12e)
- Added: the app now ships with ~72 pre-loaded common lotteries (name/price/image/pack size) so a fresh install isn't TLC-dependent on day one (§12f)
- Fixed: a major storage bloat bug — every slot was storing a full duplicate copy of its lottery's image in `localStorage`, ballooning app storage to 20MB+ and risking browser storage limits; slots now store a small reference and resolve the image at render time instead (§12g)
- Improved: backup import now shows clearer status messages during the automatic restart, and logs the previously-silent image-restore step for easier troubleshooting (§12h)

## v1.0.36 — YANKED, do not use
Deleted from GitHub after release — the uploaded installer was accidentally a stale v1.0.35 build mislabeled as v1.0.36, due to the `fix-release.js` bug fixed in v1.0.37. If you have this version somehow, update to v1.0.37 or later.

## v1.0.35 — 2026-08-17
- Fixed: Admin's `handleBarcode` recursion bug when the Bulk Scan/Add Inventory modal is closed (deferred since v1.0.34, see `PROJECT_STATUS.md` §6.10) — scanning on Admin/Inventory now works correctly whether or not the modal is open
- Added: Diagnostics "🚩 Flag This" button — exports a JSON report (recent event timeline, app version, tab, timestamp) with one click, no DevTools needed (§11)
- Added: Diagnostics scan-to-render performance timing — logs a `perf` entry with elapsed ms for each scan (§11)

## v1.0.34 — 2026-08-06
- Added a Diagnostics system: correlated real-time event timeline, global error capture, state diffing, and a cross-window layout inspector (see `PROJECT_STATUS.md` §11 for full architecture)
- New "🩺 Diagnostics" tab in the shell + always-visible "🔍 Inspect" button in the top bar
- Fixed: Admin search (`#srch`) destroying in-progress name/price edits on every keystroke — now debounced and edit-aware
- Fixed: Inventory search felt laggy while typing — now updates instantly on the first keystroke
- Fixed: Copy JSON silently failing in the Diagnostics iframe — added a working fallback
- Fixed: a single repeated/runaway log event (e.g. an error loop) could flush all older diagnostic history — now collapses into one counted entry
- Fixed: array-based diffs (e.g. ticket history) showed noisy per-index changes instead of a clean summary
- Fixed: turning on the layout inspector could trap clicks and block navigation — added safe-zones and an Escape-key panic-off
- Blocked/rejected scans (ticket exceeds pack size) now show up in Diagnostics instead of failing silently
- Known, deliberately deferred: Admin's `handleBarcode` has a pre-existing recursion bug when the Bulk Scan modal is closed (see `PROJECT_STATUS.md` §6.10) — not fixed in this release, tracked for later

## v1.0.33 — 2026-08-06
- Added window-focus-aware scan routing: if the app window lacks OS focus when a `~` scan arrives, it always routes to Manager regardless of which shell tab was last selected

## v1.0.32 — 2026-08-06
- Fixed local per-tab scan listeners in Manager/Admin that bypassed the tilde-prefix requirement when the app window was focused

## v1.0.31 — 2026-08-06
- Removed Spotlight/Featured/Slot Layout tabs from Customize (unused)
- Removed Slot Tabs sub-tab (dead setting, never read by the display)
- Added daily auto-backup (5-day retention) + "Open Backup Folder" button in Repository
- Scanner 1 (`~` prefix) now exclusively feeds the app; removed old fallback that forwarded any unprefixed scan, and removed the now-unneeded scan pause/resume hotkey
- Fixed Add Inventory field rejecting tilde-prefixed scans

## v1.0.30 — 2026-08-06
- Version-bump test release only, verifying auto-update on a freshly-migrated device

## v1.0.29 — 2026-08-06
- Fixed IndexedDB versioning bug causing missing promo image upload slots on fresh installs (see `PROJECT_STATUS.md` §6.6)

## v1.0.28 — 2026-08-06
- Cleaned up debug alert popups from the backup import flow now that the file-staging + restart mechanism is stable

## v1.0.24 — 2026-08-06
- Fixed critical backup-import data loss bug: a double-JSON-encoding error in the import staging mechanism (see `PROJECT_STATUS.md` §6.5)

## v1.0.17 — 2026-08-05
- Added `pre-release-check.js` safety net and `PROJECT_STATUS.md`/`CHANGELOG.md` for cross-session continuity

## v1.0.16 (baseline — git tracked from here)
- autoUpdater fully working: check → download progress → silent install → relaunch
- Update bar UI (yellow downloading %, green ready) in lottery-app.html
- `private: false` fix for public repo update checks
- Verbose [updater] console logging for all lifecycle events
- One-command release: `npm run release` (bumps version, syncs HTML tag, builds, publishes)
- pre-release-check.js added — blocks release if autoUpdater/updateBar code is missing

<!-- Add a new entry above this line for every release, e.g.:
## v1.0.34
- Fixed X
- Added Y

Full technical write-ups for major bugs live in PROJECT_STATUS.md, not here —
this file stays a quick one-line-per-release scan.
-->
