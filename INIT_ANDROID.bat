@echo off
setlocal
cd /d "%~dp0"
if not exist "node_modules\vite" call npm install || (pause & exit /b 1)
echo [INFO] Initializing Tauri Android target...
call npm run android:init || (pause & exit /b 1)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\patch-android-manifest.ps1"
if errorlevel 1 (pause & exit /b 1)
echo [INFO] Android initialized. Connect a compatible Galaxy S Pen device with USB debugging enabled.
pause
endlocal
