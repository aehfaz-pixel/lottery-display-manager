const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Barcode arrives from the global key hook
  onBarcode: (callback) => {
    ipcRenderer.on('barcode', (_e, code, forceManager) => callback(code, forceManager));
  },
  // Ask main to bring the manager window to the front (alert on wrong scan)
  bringToFront: () => ipcRenderer.send('bring-to-front'),
  // Open the display window
  openDisplay: () => ipcRenderer.invoke('open-display'),
  // Auto-updater
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (_e, info) => callback(info)),
  onUpdateProgress: (callback) => ipcRenderer.on('update-progress', (_e, info) => callback(info)),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', (_e, info) => callback(info)),
  onUpdateError: (callback) => ipcRenderer.on('update-error', (_e, info) => callback(info)),
  installUpdate: () => ipcRenderer.send('install-update'),
  // Force a true full BrowserWindow reload (destroys all iframe JS contexts cleanly)
  fullWindowReload: () => ipcRenderer.send('full-window-reload'),
  restartAppForImport: () => ipcRenderer.send('app-restart-for-import'),
  stageImportData: (data) => ipcRenderer.send('stage-import-data', data),
  readPendingImport: () => ipcRenderer.invoke('read-pending-import'),
  confirmImportApplied: () => ipcRenderer.send('confirm-import-applied'),
  debugLog: (msg) => ipcRenderer.send('debug-log', msg),
  // Auto backup
  checkAutoBackupNeeded: () => ipcRenderer.invoke('check-auto-backup-needed'),
  saveAutoBackup: (json) => ipcRenderer.send('save-auto-backup', json),
  openBackupFolder: () => ipcRenderer.send('open-backup-folder'),
  // App version (used by Diag.buildReport for the "Flag This" export).
  // Plain synchronous value, not an invoke() — preload has Node access, and
  // buildReport() is synchronous, so this avoids an unresolved-Promise bug.
  appVersion: require('./package.json').version,
});
