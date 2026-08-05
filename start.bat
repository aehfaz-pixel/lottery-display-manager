@echo off
title Lottery Manager — Electron App
echo ==========================================
echo       LOTTERY MANAGER (Electron)
echo ==========================================
echo.

REM Check if node_modules exists
if not exist "node_modules" (
  echo Installing dependencies — this may take a minute...
  npm install
  echo.
  echo Rebuilding node-hid for Electron...
  npm run rebuild-hid
  echo.
)

echo Starting Lottery Manager...
echo.
npm start
echo.
pause
