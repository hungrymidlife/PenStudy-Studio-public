@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\patch-android-manifest.ps1" || (pause & exit /b 1)
echo [INFO] Building Android debug APK (requires configured Android toolchain)...
call npm run android:apk
if errorlevel 1 (echo [ERROR] Verify Tauri Android CLI options and toolchain. & pause & exit /b 1)
echo [INFO] Check apps\android\src-tauri\gen\android\app\build\outputs\apk
pause
endlocal
