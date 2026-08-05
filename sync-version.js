// sync-version.js — copies package.json's version into lottery-app.html's versionTag span
const fs = require('fs');
const path = require('path');

const pkg = require('./package.json');
const version = pkg.version;

const htmlPath = path.join(__dirname, 'src', 'renderer', 'lottery-app.html');
let html = fs.readFileSync(htmlPath, 'utf8');

const updated = html.replace(/(id="versionTag"[^>]*>)v[\d.]+(<\/span>)/, `$1v${version}$2`);

if (updated === html) {
  console.log('[sync-version] versionTag pattern not found or already up to date.');
} else {
  fs.writeFileSync(htmlPath, updated, 'utf8');
  console.log(`[sync-version] versionTag updated to v${version}`);
}
