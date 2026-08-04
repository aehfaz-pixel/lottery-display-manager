# Lottery Manager — Electron App

## Setup (first time only)

1. Install Node.js from https://nodejs.org (LTS version)
2. Double-click `start.bat`
   - It installs all dependencies automatically
   - It rebuilds `node-hid` for your Electron version
   - Then launches the app

## What's in this folder

```
lottery-electron/
├── main.js              ← Electron main process (windows, scanner, server)
├── preload.js           ← Secure IPC bridge between Node and browser
├── server.js            ← Express server (TLC API, image proxy)
├── package.json
├── start.bat            ← Double-click to run
└── src/
    └── renderer/
        ├── lottery-manager.html   ← Manager + Admin combined
        ├── lottery-admin.html     ← Still available standalone
        └── lottery-display.html  ← TV display (open as separate window)
```

## How it works

- `start.bat` launches Electron
- Electron starts `server.js` as a background process on port 3000
- The main window loads `lottery-manager.html`
- The scanner connects via **node-hid** (reads USB HID device directly)
- Barcodes are sent to the manager window via IPC — **no browser focus needed**
- The display window is a separate window you can drag to your TV screen

## Scanner

- Plug in your USB barcode scanner before launching
- The app detects it automatically and shows "Scanner connected via USB" in the scan bar
- You can now watch YouTube, work in any other app — scans always land in the manager

## Display Window

- In the manager, click any button to open the display (or it auto-opens on a second monitor)
- Drag the display window to your TV and press F11 for fullscreen

## Data

- All data stays in the same localStorage as before — **your existing data will still be there**
- The Electron app uses Chromium's localStorage, same as your browser-based version
- To migrate existing data: open both the old browser version and the new Electron app side by side,
  use Export in the old app and Import in the new app

## Troubleshooting

**Scanner not detected:**
- Unplug and replug the scanner after the app starts
- The app retries every 5 seconds automatically

**Port 3000 in use:**
- Close any other instance of the app or the old server
- Or change PORT in main.js

**node-hid build errors:**
- Run `npm run rebuild-hid` manually in the folder
- Make sure you have Visual Studio Build Tools installed (Windows)
