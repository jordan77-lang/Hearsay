@echo off
title HearSay extension install helper
echo.
echo HearSay Chrome extension
echo =======================
echo.
echo Chrome cannot install extensions automatically from a download.
echo This helper opens the right pages so you can finish in under a minute.
echo.
echo 1. Chrome Extensions page will open.
echo 2. A folder window will open — use THAT folder for "Load unpacked".
echo 3. In Chrome: turn on Developer mode, then click Load unpacked.
echo.
pause
start "" "chrome://extensions"
explorer "%~dp0"
echo.
echo In Chrome, select the folder that opened (must contain manifest.json).
pause
