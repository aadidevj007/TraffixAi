@echo off
title TraffixAI - Full Stack Launcher
color 0B
chcp 65001 >nul

echo ╔══════════════════════════════════════════════════╗
echo ║       TraffixAI – AI Traffic Surveillance        ║
echo ╚══════════════════════════════════════════════════╝
echo.

set ROOT=%~dp0

:: ── 1. Start MongoDB (if mongod is on PATH) ─────────────────────────────────
echo [1/4] Starting MongoDB...
where mongod >nul 2>&1
if %errorlevel%==0 (
    if not exist "%ROOT%data\db" mkdir "%ROOT%data\db"
    start "MongoDB" /min cmd /k "mongod --dbpath \"%ROOT%data\db\" --port 27017 --quiet"
    timeout /t 3 /nobreak >nul
    echo       MongoDB started on port 27017
) else (
    echo       mongod not found on PATH – skipping (using existing MongoDB instance)
)

:: ── 2. Clear backend port ────────────────────────────────────────────────────
echo [2/4] Clearing port 8001...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":8001 "') do (
    taskkill /PID %%a /F >nul 2>&1
)
timeout /t 1 /nobreak >nul

:: ── 3. Start Backend ────────────────────────────────────────────────────────
echo [3/4] Starting Backend  ^> http://localhost:8001 ...
start "TraffixAI Backend" cmd /k ""%ROOT%_start_backend.bat""

:: Wait for backend to come up
timeout /t 8 /nobreak >nul

:: ── 4. Start Frontend ───────────────────────────────────────────────────────
echo [4/4] Starting Frontend ^> http://localhost:3000 ...
start "TraffixAI Frontend" cmd /k ""%ROOT%_start_frontend.bat""

:: Wait for Next.js to compile
timeout /t 12 /nobreak >nul

:: ── Summary ─────────────────────────────────────────────────────────────────
echo.
echo ╔══════════════════════════════════════════════════╗
echo ║  Frontend  :  http://localhost:3000              ║
echo ║  Backend   :  http://localhost:8001              ║
echo ║  API Docs  :  http://localhost:8001/docs         ║
echo ║  MongoDB   :  localhost:27017                    ║
echo ║  Admin     :  admin / admin@1234                 ║
echo ╚══════════════════════════════════════════════════╝
echo.
start http://localhost:3000
echo Press any key to exit this window.
echo (All services will keep running in their own windows.)
pause >nul
