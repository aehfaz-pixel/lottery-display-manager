# CLAUDE.md — Lottery Manager (Electron App)

> Read this first, every session. Full detail lives in `PROJECT_STATUS.md` — this file is the fast-load summary and the rules that must never be silently broken.

## What this is
Electron desktop app for managing scratch lottery tickets at Big D Foodmart. Node/Express backend + 7 HTML renderer files loaded as same-origin iframes sharing `localStorage`. Global OS-level keyboard hook (`uiohook-napi`) for barcode scanning. Auto-updates via GitHub Releases (`aehfaz-pixel/lottery-display-manager`, public repo).

**Current version:** v1.0.39 — shipped, published to GitHub, real installed-app update confirmed working. Includes sales-log reversal fix + full Repository reports overhaul (see below and PROJECT_STATUS.md §15).

## Before making any change
1. Read `PROJECT_STATUS.md` in full — it has architecture, file map, full bug history, the Diagnostics system (§11), the TLC/storage/release-pipeline overhaul (§12), Preview Scan Mode (§13 — read this before touching Manager's scan pipeline, `routeBarcode()`, or the bring-to-front chain), and pure future-ideas brainstorm (§14).
2. Read the specific file(s) you're about to touch — don't edit from memory of the summary.
3. After editing `diagnostics.js` (or any large single-scope/IIFE file): run `node --check <file>` immediately, before further edits. A prior `str_replace` once silently closed the IIFE early — caught only by this check.
4. Confirm with the user before anything destructive, before a release (`npm run release`), or before touching the invariants below.

## Non-negotiable invariants
- `package.json` → `build.publish`: `"private": false` (MUST stay false — silently breaks updates with zero error output) and `"releaseType": "release"` (not `"draft": true`, which is an invalid schema field).
- `main.js` → `autoUpdater.quitAndInstall(true, true)` — MUST be `(true, true)`. `(false, true)` shows an NSIS wizard instead of installing silently.
- Backup import: never re-`JSON.stringify()` data that arrived via IPC already stringified (caused a double-encoding data-loss bug, §6 of PROJECT_STATUS.md). Write staged import data directly.
- Scan routing: only `~`-prefixed input may trigger app actions. If you add or touch any `keydown` listener, grep the whole codebase for `addEventListener('keydown'` first — there are multiple independent listeners (OS-level global hook + per-file local fallbacks) and a policy change must be applied to all of them.
- `indexedDB.open('lotteryImages', 2)` — every call site (10 across 7 files) must keep the `objectStoreNames.contains()` guard and `onupgradeneeded` handler.
- `npm run dev` does NOT test the updater, window-focus routing, or auto-backup — always do a final pass on a real packaged install before calling a release verified.
- `fix-release.js` matches dist files by the CURRENT version number specifically (`require('./package.json').version`) — this is load-bearing. A real incident shipped a stale build under the wrong version tag when this used a loose pattern instead. **Always clear `dist/*.exe`, `dist/*.blockmap`, `dist/*.yml` before a real release**, especially after any local-only test build (`electron-builder --publish never` skips this script entirely, leaving an un-renamed, ambiguous leftover file).
- `slot._image` (in `lotteryApp_slots`) only ever holds a small `idb:ID` reference, NEVER a fully resolved image — any consumer (Manager/Display/Home) must call its own `resolveImg()` on it before use. Persisting the resolved image directly was the root cause of a real ~22MB storage bloat bug (§12g). Manager's own rendering never reads `slot._image` at all (resolves live from `db.lotteries` instead) — it exists purely for Display/Home's benefit.

## Recently fixed (v1.0.35–v1.0.37)
- `lottery-admin.html`'s `handleBarcode` hoisting/recursion bug — fixed in v1.0.35. Full write-up in PROJECT_STATUS.md §6.10.
- A large TLC/Admin/Inventory reliability overhaul, a storage-bloat fix, and a critical `fix-release.js` release-pipeline bug (which shipped a stale build under a wrong version tag in a real incident — caught and cleaned up before it reached any real user) — all in v1.0.37. Full write-up in PROJECT_STATUS.md §12 (12a–12i). If working on Admin, Inventory, Manager, Display, Home, or the release pipeline, read §12 first.
- Backup import restart mechanism confirmed fully working on the real installed v1.0.37 app (§12h) — an earlier "faltered" report was traced to an older, since-superseded install.

## Recently added (v1.0.38)
- **Preview Scan Mode** (§13): a toggleable second scan mode in Manager — batch scans into a review-before-save summary instead of applying instantly. Involved a non-obvious two-part "bring to foreground" fix (shell tab-switch vs. true OS-level focus, via a `setAlwaysOnTop` toggle to bypass Windows' foreground-lock) and a routing override in `lottery-app.html`'s `routeBarcode()` so scans reach Manager even when Admin/Inventory is the active tab. Read §13 in full before touching Manager's scan pipeline, `routeBarcode()`, or the bring-to-front chain in `main.js`.

## Recently added (v1.0.39, 2026-08-18)
- **Sales-log reversal fix**: `logSale()` in `lottery-manager.html` used to skip any ticket-count decrease entirely (`if(newCount<=prevCount) return;`), so a manual correction/return never subtracted from Home's sales figures — permanent double-count. Now logs a signed entry on any change (`if(newCount===prevCount) return;`), and both `bumpTicket()`/`setTicket()` call `logSale` unconditionally on change in either direction. No change was needed on the Home side — `salesInRange()` already sums negative `ticketsSold` values correctly.
- **Repository reports overhaul**: all 7 previous report types deleted (Sales Log, Nightly Report, Slot Barcodes, Inventory CSV, Inventory PDF, DB Export, Winners) — Full App Backup / Auto Backup untouched. Replaced with 3 new reports in `lottery-repository.html`: **Inventory Log** (date-range filtered export of all 10 Inventory columns, PDF/Excel), **Day End Sales Report** (manual "Close Day" any time/any number of presses, or auto-generated at 12:10am/next-open if never manually closed that day — see §15 for the full spec incl. sold-out-mid-day pack-split handling), and **Live Slots** (auto-refreshing 3-table live view with native print). Full spec and open decisions in PROJECT_STATUS.md §15.
- **Known dead code from this change, not yet cleaned up:** `adminRepoSave`/`repoSave` calls still exist in `lottery-admin.html`/`lottery-manager.html`, writing to the now-unused `lotteryApp_repository` key that `lottery-repository.html` no longer reads. Harmless (nothing reads it), but flagged for a future cleanup pass — out of scope for this change.
- **Still queued, not started:** TLC fetch-consolidation in `lottery-admin.html` (~7 scattered `fetch()` call sites → 1 shared function) — user has explicitly said not to start until asked.

## Reporting Standards (PDF/Excel) — read before touching any report generator
Applies to every report this app generates (Inventory Log, Day End Sales Report, Live Slots, and any future report type):
- **Header cells must match their column's data alignment.** jsPDF-autotable's `columnStyles.halign` does NOT reliably cascade to header cells — force alignment explicitly via a `didParseCell` hook applied to every cell (head + body alike). See `lottery-repository.html`'s `buildPdf()`.
- Alignment default (deviate only on explicit instruction): text left, numbers right, dates/percentages/short codes centered. Leftmost identifying column (e.g. a name) stays left-aligned unless told otherwise.
- Every report: title, one-line subtitle (date range/filters), bold/colored header row, alternating row shading, page numbers on multi-page PDFs, minimal-but-present borders, column widths sized to content.
- **Printed/exported backgrounds:** browsers strip background colors on print/save-as-PDF unless `print-color-adjust: exact` (+ `-webkit-` prefix) is set, both as a base rule and inside `@media print`. Required on anything printed directly (e.g. Live Slots).
- Don't sync shading colors between a live view and a print window via string-replacing inline `rgba(...)` — browsers reserialize inline styles (spacing, leading zeros) and silently break exact-string matches. Use a shared CSS class instead, defined independently in each context.
- **Default filenames for native print/Save-as-PDF:** the OS/browser dialog's suggested filename comes from `<title>`. Don't set it via `document.write` into a blank popup + delayed `document.title=` — unreliable, especially in Electron. Instead build the full HTML (title included) as a string, wrap in a `Blob`, and `window.open()` the Blob URL directly (real navigation, title parsed normally); trigger `window.print()` from an inline script embedded in that document's own `onload`.
- **Excel limitation:** reports use the free/community SheetJS build (`xlsx.full.min.js` via CDN) — no cell styling support (alignment/fill/bold). Only PDF output gets the alignment/shading treatment above. If Excel styling is ever required, it needs a different library (e.g. ExcelJS) — flag to the user rather than silently skipping it.

## Project location & environment
- Local project root: `D:\Store\Lottery\lottery-electron` (Windows machine — always specify Windows paths, not Unix-style, when giving the user commands to run locally).
- Release builds require a **VS Developer Command Prompt** specifically (for native module rebuilds — `uiohook-napi`). Regular `cmd`/PowerShell is fine for everyday dev/testing (`npm run dev`), git, and doc edits — only the actual `npm run release` build step needs the VS Dev prompt.
- GitHub repo: `aehfaz-pixel/lottery-display-manager` (public).

## Release procedure — step order, every time
1. **Clear stale build artifacts first** (critical — a stale leftover build caused a real bad release, v1.0.36, before `fix-release.js` was hardened): from the project root, `del dist\*.exe`, `del dist\*.blockmap`, `del dist\*.yml`.
2. **Commit source changes** (`git add .` && `git commit -m "..."`) *before* releasing — the release pipeline bumps version/builds/publishes but doesn't manage your commit message.
3. **Run `npm run release`** from a VS Developer Command Prompt, in the project root — this runs `pre-release-check.js` → bumps version → syncs the HTML version tag (`sync-version.js`) → builds → publishes to GitHub.
4. **Watch for:** `pre-release-check.js` failing (missing autoUpdater/updateBar code — shouldn't happen unless `main.js`/`lottery-app.html`'s update-bar code was touched), or `fix-release.js` refusing to find a matching build (means step 1 wasn't done cleanly, or the build silently failed).
5. **After publish:** confirm the release shows on GitHub as "Latest" (not draft — see `private:false`/`releaseType:"release"` invariant above), then do a final verification pass on the **actual installed build** — `npm run dev` does NOT test the updater, auto-backup, or window-focus routing.
6. **Update docs as part of every release, not after the fact:** move the "Unreleased" CHANGELOG.md entry under the new version number/date, bump `PROJECT_STATUS.md`'s "Current state" line, and update this file's "Current version" line to reflect what's now actually live.

## When to resume a queued task
If `CLAUDE.md`/`PROJECT_STATUS.md` list something under "queued"/"not started" (e.g. TLC fetch-consolidation as of this writing), do not start it proactively — wait for explicit user instruction, even if it seems like a natural next step after a related task.

## File map (what to open for what)
| Concern | File(s) |
|---|---|
| Scanner hook, IPC, auto-updater, auto-backup | `main.js` |
| IPC bridge | `preload.js` |
| TLC scraping, image proxy, static serving | `server.js` |
| Tab shell, scan routing, update bar, Inspect toggle | `lottery-app.html` |
| Dashboard/stats | `lottery-home.html` |
| Scanning logic, `renderGrid()`, Customize modal | `lottery-manager.html` |
| Lottery DB + Inventory (both iframes of same file) | `lottery-admin.html` |
| TV display | `lottery-display.html` |
| Reports (Inventory Log, Day End Sales Report, Live Slots), backup export/import | `lottery-repository.html` |
| Diagnostics tab UI | `lottery-diagnostics.html` |
| Diagnostics shared engine | `diagnostics.js` (loaded by all 7 renderer files) |
| Version bump propagation | `sync-version.js`, `package.json` |
| Release build/publish | `fix-release.js`, `pre-release-check.js` |

## Source of truth
If this file, `PROJECT_STATUS.md`, or any local copy contradicts the live repo, **trust `git log` / GitHub `main`** — run `git log -1` and `git diff <last-good-commit> -- <file>` to confirm current state before assuming staleness.

## Working style
Default to concise responses. State a plan before editing, show diffs, confirm before running `npm run release` or anything git-push/destructive. Don't re-investigate items logged as "non-issue" or "deferred" in PROJECT_STATUS.md §9 without being asked.
