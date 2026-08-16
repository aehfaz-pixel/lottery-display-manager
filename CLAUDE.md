# CLAUDE.md — Lottery Manager (Electron App)

> Read this first, every session. Full detail lives in `PROJECT_STATUS.md` — this file is the fast-load summary and the rules that must never be silently broken.

## What this is
Electron desktop app for managing scratch lottery tickets at Big D Foodmart. Node/Express backend + 7 HTML renderer files loaded as same-origin iframes sharing `localStorage`. Global OS-level keyboard hook (`uiohook-napi`) for barcode scanning. Auto-updates via GitHub Releases (`aehfaz-pixel/lottery-display-manager`, public repo).

**Current version:** v1.0.34 — fully working, verified end-to-end (dev + packaged build).

## Before making any change
1. Read `PROJECT_STATUS.md` in full — it has architecture, file map, full bug history, and the Diagnostics system (§11) and future-ideas brainstorm (§12).
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

## Recently fixed
`lottery-admin.html`'s `handleBarcode` hoisting/recursion bug (two same-named functions causing infinite recursion when the Bulk Scan/Add Inventory modal was closed) was fixed by renaming the original implementation to `handleBarcodeCore` and having the wrapper call it directly by name. Committed `f30962d`, not yet released. Full write-up (now marked fixed) in PROJECT_STATUS.md §6.10.

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
