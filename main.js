const { app, BrowserWindow, ipcMain, session, shell } = require('electron');

// Disable HTTP cache so updated HTML files always load fresh
app.commandLine.appendSwitch('disable-http-cache');
const path = require('path');
const fs = require('fs');
const { fork } = require('child_process');
const { autoUpdater } = require('electron-updater');

// ── AUTO UPDATER ──────────────────────────────────────────
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = false;

autoUpdater.on('checking-for-update', () => {
  console.log('[updater] Checking for update...');
});

autoUpdater.on('update-available', (info) => {
  console.log('[updater] Update available:', info.version);
  notifyRenderer('update-available', { version: info.version });
});

autoUpdater.on('update-not-available', (info) => {
  console.log('[updater] No update available. Current:', app.getVersion(), 'Latest on server:', info && info.version);
});

autoUpdater.on('download-progress', (progress) => {
  console.log('[updater] Progress:', Math.round(progress.percent) + '%');
  notifyRenderer('update-progress', {
    percent: Math.round(progress.percent),
    bytesPerSecond: progress.bytesPerSecond,
    transferred: progress.transferred,
    total: progress.total,
  });
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('[updater] Update downloaded:', info.version);
  notifyRenderer('update-downloaded', { version: info.version });
});

autoUpdater.on('error', (err) => {
  console.error('[updater] ERROR:', err.message, err.stack);
  notifyRenderer('update-error', { message: err.message });
});

ipcMain.on('install-update', () => {
  autoUpdater.quitAndInstall(true, true);
});

let mainWindow = null;
let displayWindow = null;
let serverProcess = null;

const SERVER_PORT = 3000;

// ── Scanner capture state ─────────────────────────────────
let scanBuf = '';
let lastKeyTime = 0;
let scanResetTimer = null;
const BURST_MS = 50;                // max gap between scanner keystrokes
const MIN_LEN = 6;                  // min chars to treat as a barcode

// ── SERVER ────────────────────────────────────────────────
function startServer() {
  serverProcess = fork(path.join(__dirname, 'server.js'), [], {
    env: { ...process.env, PORT: SERVER_PORT },
    silent: true
  });
  serverProcess.stdout.on('data', d => console.log('[server]', d.toString().trim()));
  serverProcess.stderr.on('data', d => console.error('[server]', d.toString().trim()));
  serverProcess.on('exit', code => console.log('[server] exited', code));
}

// ── GLOBAL KEY HOOK (uiohook-napi) ────────────────────────
let uIOhook = null;

function startKeyHook() {
  try {
    ({ uIOhook } = require('uiohook-napi'));
  } catch (e) {
    console.error('[hook] uiohook-napi not available:', e.message);
    return;
  }

  uIOhook.on('keydown', (e) => {
    const now = Date.now();
    const char = uiohookKeyToChar(e);

    if (char === 'ENTER') {
      if (scanBuf.length >= MIN_LEN) {
        const code = scanBuf;
        // Only treat as a scan if it came in as a fast burst
        dispatchScan(code);
      }
      scanBuf = '';
      clearTimeout(scanResetTimer);
      return;
    }

    if (char === null) return;

    // Burst detection: scanner fires keys faster than humans
    if (now - lastKeyTime > BURST_MS && scanBuf.length > 0) {
      scanBuf = ''; // gap too long — likely human typing, reset
    }
    scanBuf += char;
    lastKeyTime = now;

    clearTimeout(scanResetTimer);
    scanResetTimer = setTimeout(() => { scanBuf = ''; }, 200);
  });

  uIOhook.start();
  console.log('[hook] Global key hook started.');
}

// uiohook-napi keycode → char (digits, letters, enter)
function uiohookKeyToChar(e) {
  const kc = e.keycode;
  // uiohook standard keycodes
  const digitMap = {
    2:'1',3:'2',4:'3',5:'4',6:'5',7:'6',8:'7',9:'8',10:'9',11:'0',
    // numpad
    79:'1',80:'2',81:'3',75:'4',76:'5',77:'6',71:'7',72:'8',73:'9',82:'0',
  };
  const letterMap = {
    30:'A',48:'B',46:'C',32:'D',18:'E',33:'F',34:'G',35:'H',23:'I',
    36:'J',37:'K',38:'L',50:'M',49:'N',24:'O',25:'P',16:'Q',19:'R',
    31:'S',20:'T',22:'U',47:'V',17:'W',45:'X',21:'Y',44:'Z',
  };
  if (kc === 28 || kc === 96) return 'ENTER'; // Enter / numpad Enter
  if (kc === 41) return '~'; // backquote/tilde — Netum scanner prefix key
  if (digitMap[kc]) return digitMap[kc];
  if (letterMap[kc]) return letterMap[kc];
  return null;
}

const LOTTERY_PREFIX = '~';  // Scanner 1 programmed with this prefix

function dispatchScan(code) {
  console.log('[hook] Scan:', code);

  // Prefix routing: lottery scanner sends ~ prefix — strip it and route to manager
  if (code.startsWith(LOTTERY_PREFIX)) {
    const cleanCode = code.slice(LOTTERY_PREFIX.length);
    console.log('[hook] Lottery scanner:', cleanCode);
    if (mainWindow && !mainWindow.isDestroyed()) {
      // If our window doesn't have real OS focus (some other app does),
      // force this scan to the Manager regardless of which shell tab is
      // selected — a scan made while looking at another app should never
      // land in whatever tab happens to be showing.
      const appFocused = mainWindow.isFocused();
      mainWindow.webContents.send('barcode', cleanCode, !appFocused);
    }
    return;
  }

  // No prefix — Scanner 2 or manual keyboard input. Never routed to the
  // Lottery Manager. Keystrokes already flowed to Windows naturally
  // (uiohook doesn't suppress), so Scanner 2 reaches whatever app has focus.
}

function notifyRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

// ── WINDOWS ───────────────────────────────────────────────
function waitForServer(cb, attempts = 0) {
  const http = require('http');
  const req = http.get(`http://localhost:${SERVER_PORT}/`, () => cb());
  req.on('error', () => {
    if (attempts < 30) setTimeout(() => waitForServer(cb, attempts + 1), 300);
    else { console.error('Server failed to start'); cb(); }
  });
  req.end();
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 900, minHeight: 600,
    title: '🎰 Lottery Manager', backgroundColor: '#0d1117',
    webPreferences: {
      nodeIntegration: false, contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      partition: 'persist:lottery-manager',
    },
  });
  mainWindow.loadURL(`http://localhost:${SERVER_PORT}/lottery-app.html`);
  mainWindow.on('closed', () => { mainWindow = null; });
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

function createDisplayWindow() {
  const { screen } = require('electron');
  const displays = screen.getAllDisplays();
  const externalDisplay = displays.find(d => d.id !== screen.getPrimaryDisplay().id);
  const targetDisplay = externalDisplay || screen.getPrimaryDisplay();

  displayWindow = new BrowserWindow({
    x: targetDisplay.bounds.x,
    y: targetDisplay.bounds.y,
    width: targetDisplay.bounds.width,
    height: targetDisplay.bounds.height,
    title: '📺 Lottery Display',
    backgroundColor: '#050008',
    autoHideMenuBar: true,
    fullscreen: !!externalDisplay, // fullscreen only if on second monitor
    webPreferences: {
      nodeIntegration: false, contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      partition: 'persist:lottery-manager',
    },
  });
  displayWindow.setMenuBarVisibility(false);  // ensure it's gone, not just auto-hidden
  displayWindow.setMenu(null);                // remove entirely so Alt can't reveal it
  // F11 toggles fullscreen (Esc exits) — the default accelerator went away with the menu
  displayWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      displayWindow.setFullScreen(!displayWindow.isFullScreen());
      event.preventDefault();
    } else if (input.type === 'keyDown' && input.key === 'Escape' && displayWindow.isFullScreen()) {
      displayWindow.setFullScreen(false);
      event.preventDefault();
    } else if (input.type === 'keyDown' && input.key === 'I' && input.control && input.shift) {
      displayWindow.webContents.openDevTools({ mode: 'detach' });
      event.preventDefault();
    } else if (input.type === 'keyDown' && input.key === 'F12') {
      displayWindow.webContents.openDevTools({ mode: 'detach' });
      event.preventDefault();
    }
  });
  displayWindow.webContents.on('context-menu', () => {
    displayWindow.webContents.openDevTools({ mode: 'detach' });
  });
  displayWindow.loadURL(`http://localhost:${SERVER_PORT}/lottery-display.html`);
  displayWindow.on('closed', () => { displayWindow = null; });
}

// ── IPC ───────────────────────────────────────────────────
ipcMain.handle('open-display', () => {
  if (!displayWindow || displayWindow.isDestroyed()) createDisplayWindow();
  else displayWindow.focus();
});

// Manager asks us to bring it to front (non-lottery barcode alert)
ipcMain.on('full-window-reload', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.session.flushStorageData();
    setTimeout(() => {
      mainWindow.loadURL(`http://localhost:${SERVER_PORT}/lottery-app.html`);
    }, 500);
  }
});

const DEBUG_LOG_PATH = path.join(app.getPath('userData'), 'import-debug.log');
function debugLog(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  console.log(line.trim());
  try { fs.appendFileSync(DEBUG_LOG_PATH, line); } catch (e) {}
}
debugLog(`=== APP LAUNCH === version ${app.getVersion()}`);

const PENDING_IMPORT_PATH = path.join(app.getPath('userData'), 'pending-import.json');

ipcMain.on('stage-import-data', (_e, backupData) => {
  try {
    fs.writeFileSync(PENDING_IMPORT_PATH, backupData);
    debugLog(`STAGED import data to disk, size: ${backupData.length}`);
  } catch (e) {
    debugLog(`STAGE FAILED: ${e.message}`);
  }
});

ipcMain.handle('read-pending-import', () => {
  try {
    if (fs.existsSync(PENDING_IMPORT_PATH)) {
      const data = fs.readFileSync(PENDING_IMPORT_PATH, 'utf8');
      debugLog(`READ pending import, size: ${data.length}`);
      return data;
    }
    debugLog('READ pending import: no file found');
  } catch (e) {
    debugLog(`READ FAILED: ${e.message}`);
  }
  return null;
});

ipcMain.on('confirm-import-applied', () => {
  try {
    if (fs.existsSync(PENDING_IMPORT_PATH)) {
      fs.unlinkSync(PENDING_IMPORT_PATH);
      debugLog('CONFIRMED applied — pending file removed.');
    }
  } catch (e) {
    debugLog(`CONFIRM/DELETE FAILED: ${e.message}`);
  }
});

ipcMain.on('debug-log', (_e, msg) => debugLog(`[renderer] ${msg}`));

// Synchronous version lookup for preload.js (require('./package.json') is
// not available in the preload sandbox — see preload.js comment).
ipcMain.on('get-app-version-sync', (event) => {
  event.returnValue = app.getVersion();
});

// ── AUTO BACKUP ───────────────────────────────────────────
const AUTO_BACKUP_DIR = path.join(app.getPath('userData'), 'auto-backups');
const AUTO_BACKUP_RETENTION = 5; // keep the 5 most recent daily backups

function ensureAutoBackupDir() {
  try {
    if (!fs.existsSync(AUTO_BACKUP_DIR)) fs.mkdirSync(AUTO_BACKUP_DIR, { recursive: true });
  } catch (e) {
    debugLog(`AUTO BACKUP: could not create dir: ${e.message}`);
  }
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

// Renderer asks: has today's auto backup already been taken?
ipcMain.handle('check-auto-backup-needed', () => {
  try {
    ensureAutoBackupDir();
    const todayFile = path.join(AUTO_BACKUP_DIR, `auto-backup-${todayStamp()}.lotterybackup`);
    return !fs.existsSync(todayFile);
  } catch (e) {
    debugLog(`AUTO BACKUP: check failed: ${e.message}`);
    return false; // fail safe — don't force a backup if we can't even check
  }
});

// Renderer sends the built backup JSON to write to disk
ipcMain.on('save-auto-backup', (_e, backupJson) => {
  try {
    ensureAutoBackupDir();
    const fileName = `auto-backup-${todayStamp()}.lotterybackup`;
    const filePath = path.join(AUTO_BACKUP_DIR, fileName);
    fs.writeFileSync(filePath, backupJson);
    debugLog(`AUTO BACKUP: saved ${fileName}, size ${backupJson.length}`);

    // Prune anything beyond the retention window
    const files = fs.readdirSync(AUTO_BACKUP_DIR)
      .filter(f => f.startsWith('auto-backup-') && f.endsWith('.lotterybackup'))
      .sort(); // filenames are date-stamped, so lexical sort = chronological
    if (files.length > AUTO_BACKUP_RETENTION) {
      const toRemove = files.slice(0, files.length - AUTO_BACKUP_RETENTION);
      toRemove.forEach(f => {
        try {
          fs.unlinkSync(path.join(AUTO_BACKUP_DIR, f));
          debugLog(`AUTO BACKUP: pruned old backup ${f}`);
        } catch (e) {
          debugLog(`AUTO BACKUP: prune failed for ${f}: ${e.message}`);
        }
      });
    }
  } catch (e) {
    debugLog(`AUTO BACKUP: save failed: ${e.message}`);
  }
});

// Manual "Open backup folder" button in Repository tab
ipcMain.on('open-backup-folder', () => {
  try {
    ensureAutoBackupDir();
    shell.openPath(AUTO_BACKUP_DIR);
  } catch (e) {
    debugLog(`AUTO BACKUP: open folder failed: ${e.message}`);
  }
});

ipcMain.on('app-restart-for-import', () => {
  debugLog('RESTART: app-restart-for-import received, flushing storage');
  const doRestart = () => {
    debugLog('RESTART: calling app.relaunch() + app.exit(0) now');
    app.relaunch();
    app.exit(0);
  };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.session.flushStorageData();
    debugLog('RESTART: flushStorageData() called (fire-and-forget, non-blocking), waiting 2s before relaunch');
    setTimeout(doRestart, 2000);
  } else {
    doRestart();
  }
});

ipcMain.on('bring-to-front', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    mainWindow.flashFrame(true);
  }
});

// ── LIFECYCLE ─────────────────────────────────────────────
app.whenReady().then(() => {
  startServer();
  waitForServer(() => {
    createMainWindow();
    setTimeout(startKeyHook, 1500);
    setTimeout(() => {
      console.log('[updater] Triggering checkForUpdates. App version:', app.getVersion());
      autoUpdater.checkForUpdates().catch(err => console.error('[updater] checkForUpdates threw:', err));
    }, 5000);
  });
});

app.on('window-all-closed', () => {
  try { if (uIOhook) uIOhook.stop(); } catch (e) {}
  if (serverProcess) serverProcess.kill();
  try {
    session.fromPartition('persist:lottery-manager').flushStorageData();
  } catch (e) { console.error('[storage] flush failed:', e.message); }
  app.quit();
});

app.on('activate', () => {
  if (!mainWindow) waitForServer(createMainWindow);
});
