@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\patch-android-manifest.ps1" || (pause & exit /b 1)
echo [INFO] Starting PenStudy Pad on connected Android device...
call npm run android:dev
if errorlevel 1 (echo [ERROR] Check Android SDK/JDK/NDK/ADB. & pause)
endlocal
