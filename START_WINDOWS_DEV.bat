@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1 || (echo [ERROR] Node.js is not installed. & pause & exit /b 1)
where cargo >nul 2>&1 || (echo [ERROR] Rust cargo is missing. Install rustup and MSVC tools. & pause & exit /b 1)
if not exist "node_modules\vite" (
  echo [INFO] Installing workspace dependencies...
  call npm install || (pause & exit /b 1)
)
echo [INFO] Starting PenStudy Studio for Windows...
call npm run desktop
if errorlevel 1 (echo [ERROR] Check the build log above. & pause)
endlocal
