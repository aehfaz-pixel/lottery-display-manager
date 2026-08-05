# Changelog

## v1.0.16 (baseline — git tracked from here)
- autoUpdater fully working: check → download progress → silent install → relaunch
- Update bar UI (yellow downloading %, green ready) in lottery-app.html
- `private: false` fix for public repo update checks
- Verbose [updater] console logging for all lifecycle events
- One-command release: `npm run release` (bumps version, syncs HTML tag, builds, publishes)
- pre-release-check.js added — blocks release if autoUpdater/updateBar code is missing

<!-- Add a new entry above this line for every release, e.g.:
## v1.0.17
- Fixed X
- Added Y
-->
