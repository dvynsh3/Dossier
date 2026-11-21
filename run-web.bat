@echo off
rem Browser test mode: opens the app in Chrome/Edge with DevTools (F12), reload with F5. No install of Electron needed.
cd /d %~dp0
if not exist node_modules (call npm install --omit=dev)
set WS=%~dp0..\cvbuilder-testdata
set PORT=5173
start "" http://127.0.0.1:5173/
node dev\server.js
