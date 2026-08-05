const { app, BrowserWindow, ipcMain, session } = require('electron');

// Disable HTTP cache so updated HTML files always load fresh
app.commandLine.appendSwitch('disable-http-cache');
const path = require('path');
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
let capturePaused = false;          // toggled by hotkey
let hotkey = { ctrl: true, shift: true, key: 'P' }; // default, customizable
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
    // Check for hotkey combo first (pause/resume)
    if (matchesHotkey(e)) {
      capturePaused = !capturePaused;
      notifyRenderer('capture-state', { paused: capturePaused });
      return;
    }

    if (capturePaused) return; // let keys flow to other apps

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

function matchesHotkey(e) {
  // uiohook keycodes: we match by the rawcode/keycode for the letter + modifiers
  const wantCtrl = hotkey.ctrl, wantShift = hotkey.shift, wantAlt = hotkey.alt || false;
  const hasCtrl = e.ctrlKey, hasShift = e.shiftKey, hasAlt = e.altKey;
  if (hasCtrl !== wantCtrl || hasShift !== wantShift || hasAlt !== wantAlt) return false;
  const char = uiohookKeyToChar(e);
  return char && char.toUpperCase() === hotkey.key.toUpperCase();
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
      mainWindow.webContents.send('barcode', cleanCode);
    }
    return;
  }

  // No prefix — Scanner 2 or keyboard. Route to manager only if not paused.
  // Keystrokes already flowed to Windows naturally (uiohook doesn't suppress).
  if (!capturePaused) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('barcode', code);
    }
  }
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
ipcMain.on('bring-to-front', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    mainWindow.flashFrame(true);
  }
});

// Manager sets the hotkey
ipcMain.on('set-hotkey', (_e, hk) => {
  if (hk && hk.key) {
    hotkey = { ctrl: !!hk.ctrl, shift: !!hk.shift, alt: !!hk.alt, key: hk.key };
    console.log('[hook] Hotkey updated:', hotkey);
  }
});

// Manager queries current capture state / hotkey
ipcMain.handle('get-capture-info', () => ({ paused: capturePaused, hotkey }));

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
  app.quit();
});

app.on('activate', () => {
  if (!mainWindow) waitForServer(createMainWindow);
});
