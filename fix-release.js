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

const files = fs.readdirSync(distDir);
const exeFile = files.find(f => f.endsWith('.exe') && !f.includes('uninstaller') && !f.includes('Setup 1') === false || (f.endsWith('.exe') && f.includes('Setup') && !f.includes('uninstaller')));

// Find the actual exe (has spaces or dots, not matching yml yet)
const actualExe = files.find(f => 
  f.endsWith('.exe') && 
  f.includes('Setup') && 
  !f.includes('uninstaller') &&
  f !== ymlName
);

const actualBlockmap = files.find(f => 
  f.endsWith('.exe.blockmap') && 
  f.includes('Setup') &&
  f !== ymlName + '.blockmap'
);

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
