@echo off
setlocal
cd /d "%~dp0.."
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20+ is required for multiplayer. Opening the offline game.
  echo Install Node.js LTS from https://nodejs.org then run this launcher again.
  start "" "%~dp0sanctum-of-ash.html"
  pause
  exit /b 0
)
echo Keep this window open while hosting multiplayer. Press Ctrl+C to stop.
node "%~dp0..\lan-server.mjs" --open %*
if errorlevel 1 pause
