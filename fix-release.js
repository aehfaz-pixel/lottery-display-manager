// fix-release.js — runs after electron-builder
// Renames dist files so they match what latest.yml references
// GitHub replaces spaces with dots, so we pre-rename with dots to match

const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, 'dist');
const ymlPath = path.join(distDir, 'latest.yml');

if (!fs.existsSync(ymlPath)) {
  console.log('[fix-release] No latest.yml found, skipping.');
  process.exit(0);
}

let yml = fs.readFileSync(ymlPath, 'utf8');

// Find the current filename referenced in latest.yml
const urlMatch = yml.match(/url:\s*(.+\.exe)/);
if (!urlMatch) {
  console.log('[fix-release] Could not find url in latest.yml, skipping.');
  process.exit(0);
}

const ymlName = urlMatch[1].trim(); // e.g. Lottery-Manager-Setup-1.0.4.exe

// The actual built file has spaces e.g. "Lottery-Manager Setup 1.0.4.exe"
// GitHub will rename it to use dots e.g. "Lottery-Manager.Setup.1.0.4.exe"
// We want to rename to match yml exactly: "Lottery-Manager-Setup-1.0.4.exe"

// CRITICAL: match on the CURRENT version number specifically, not just
// "any file containing Setup" — dist/ commonly accumulates un-renamed
// leftovers from previous builds (e.g. a local `electron-builder
// --publish never` test run that never got fix-release.js applied to
// it). A loose pattern match can silently pick up a stale OLDER
// version's exe and rename/upload IT as if it were the new release —
// this happened for real once, uploading a stale build under a new
// version's tag. Matching on package.json's version makes this
// unambiguous regardless of what else is sitting in dist/.
const pkgVersion = require('./package.json').version;

const files = fs.readdirSync(distDir);

// Find the actual exe (has spaces, not matching yml yet, but DOES
// contain the current version number — this is the safety check)
const actualExe = files.find(f =>
  f.endsWith('.exe') &&
  f.includes('Setup') &&
  f.includes(pkgVersion) &&
  !f.includes('uninstaller') &&
  f !== ymlName
);

const actualBlockmap = files.find(f =>
  f.endsWith('.exe.blockmap') &&
  f.includes('Setup') &&
  f.includes(pkgVersion) &&
  f !== ymlName + '.blockmap'
);

if (!actualExe) {
  console.error(`[fix-release] ERROR: No .exe found containing current version "${pkgVersion}". Refusing to guess — check dist/ manually.`);
  console.error('[fix-release] Files in dist/:', files.filter(f => f.endsWith('.exe')).join(', '));
  process.exit(1);
}

if (actualExe && actualExe !== ymlName) {
  const src = path.join(distDir, actualExe);
  const dst = path.join(distDir, ymlName);
  fs.renameSync(src, dst);
  console.log(`[fix-release] Renamed: ${actualExe} → ${ymlName}`);
}

if (actualBlockmap && actualBlockmap !== ymlName + '.blockmap') {
  const src = path.join(distDir, actualBlockmap);
  const dst = path.join(distDir, ymlName + '.blockmap');
  fs.renameSync(src, dst);
  console.log(`[fix-release] Renamed: ${actualBlockmap} → ${ymlName}.blockmap`);
}

console.log('[fix-release] Done. Files ready for GitHub release upload.');
