// pre-release-check.js — run before every release to catch silently-dropped features
const fs = require('fs');
const path = require('path');

const checks = [
  {
    file: 'main.js',
    mustContain: [
      "require('electron-updater')",
      "autoUpdater.on('checking-for-update'",
      "autoUpdater.on('update-available'",
      "autoUpdater.on('update-not-available'",
      "autoUpdater.on('download-progress'",
      "autoUpdater.on('update-downloaded'",
      "autoUpdater.on('error'",
      "autoUpdater.quitAndInstall(true, true)",
      "autoUpdater.checkForUpdates()",
      "LOTTERY_PREFIX",
      "uiohook-napi",
    ],
  },
  {
    file: 'src/renderer/lottery-app.html',
    mustContain: [
      'id="updateBar"',
      'onUpdateAvailable',
      'onUpdateProgress',
      'onUpdateDownloaded',
      'installUpdate()',
      'id="versionTag"',
    ],
  },
  {
    file: 'preload.js',
    mustContain: [
      'onUpdateAvailable',
      'onUpdateProgress',
      'onUpdateDownloaded',
      'onUpdateError',
      'installUpdate',
      'onBarcode',
    ],
  },
  {
    file: 'package.json',
    mustContain: [
      '"private": false',
      '"provider": "github"',
    ],
  },
];

let failed = false;

for (const check of checks) {
  const filePath = path.join(__dirname, check.file);
  if (!fs.existsSync(filePath)) {
    console.error(`[FAIL] ${check.file} does not exist!`);
    failed = true;
    continue;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  for (const needle of check.mustContain) {
    if (!content.includes(needle)) {
      console.error(`[FAIL] ${check.file} is missing: "${needle}"`);
      failed = true;
    }
  }
}

if (failed) {
  console.error('\n❌ Pre-release check FAILED. One or more critical features are missing.');
  console.error('   Do NOT release until this is fixed — likely an old file was pasted over a newer one.');
  process.exit(1);
} else {
  console.log('✅ Pre-release check passed. All critical features present.');
}
