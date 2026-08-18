# CLAUDE.md — Lottery Manager (Electron App)

> Read this first, every session. Full detail lives in `PROJECT_STATUS.md` — this file is the fast-load summary and the rules that must never be silently broken.

## What this is
Electron desktop app for managing scratch lottery tickets at Big D Foodmart. Node/Express backend + 7 HTML renderer files loaded as same-origin iframes sharing `localStorage`. Global OS-level keyboard hook (`uiohook-napi`) for barcode scanning. Auto-updates via GitHub Releases (`aehfaz-pixel/lottery-display-manager`, public repo).

**Current version:** v1.0.38 — fully working, verified end-to-end. Includes Preview Scan Mode (§13).

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
| Reports, backup export/import | `lottery-repository.html` |
| Diagnostics tab UI | `lottery-diagnostics.html` |
| Diagnostics shared engine | `diagnostics.js` (loaded by all 7 renderer files) |
| Version bump propagation | `sync-version.js`, `package.json` |
| Release build/publish | `fix-release.js`, `pre-release-check.js` |

## Source of truth
If this file, `PROJECT_STATUS.md`, or any local copy contradicts the live repo, **trust `git log` / GitHub `main`** — run `git log -1` and `git diff <last-good-commit> -- <file>` to confirm current state before assuming staleness.

## Working style
Default to concise responses. State a plan before editing, show diffs, confirm before running `npm run release` or anything git-push/destructive. Don't re-investigate items logged as "non-issue" or "deferred" in PROJECT_STATUS.md §9 without being asked.
