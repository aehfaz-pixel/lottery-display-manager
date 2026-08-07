# Changelog

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
