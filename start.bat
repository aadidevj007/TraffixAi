@echo off
title TraffixAI - Full Stack Launcher
color 0B
chcp 437 >nul

echo ==================================================
echo        TraffixAI - AI Traffic Surveillance
echo ==================================================
echo.

set ROOT=%~dp0

:: 1. MongoDB mode
set "START_LOCAL_MONGODB=false"
echo [1/4] MongoDB mode...
if /I "%START_LOCAL_MONGODB%"=="true" (
    echo       Local MongoDB enabled. Attempting to start mongod on localhost:27017...
    set "MONGOD_EXE="
    where mongod >nul 2>&1
    if %errorlevel%==0 set "MONGOD_EXE=mongod"

    if not defined MONGOD_EXE (
        for /d %%D in ("C:\Program Files\MongoDB\Server\*") do (
            if exist "%%~fD\bin\mongod.exe" set "MONGOD_EXE=%%~fD\bin\mongod.exe"
        )
    )

    if defined MONGOD_EXE (
        if not exist "%ROOT%data\db" mkdir "%ROOT%data\db"
        start "MongoDB" /min cmd /k ""%MONGOD_EXE%" --dbpath \"%ROOT%data\db\" --port 27017 --quiet"
        timeout /t 3 /nobreak >nul
        echo       MongoDB started on port 27017 using %MONGOD_EXE%
    ) else (
        echo       mongod not found. Skipping local MongoDB startup.
    )
) else (
    echo       Local MongoDB startup disabled.
    echo       Using MongoDB Atlas via backend\.env MONGODB_URI.
)

:: 2. Clear backend port
echo [2/4] Clearing port 8002...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":8002 "') do (
    taskkill /PID %%a /F >nul 2>&1
)
timeout /t 1 /nobreak >nul

:: 3. Start Backend
echo [3/4] Starting Backend  ^> http://localhost:8002 ...
start "TraffixAI Backend" cmd /k ""%ROOT%_start_backend.bat""

:: Wait for backend to come up
timeout /t 8 /nobreak >nul

:: 4. Start Frontend
echo [4/4] Starting Frontend ^> http://localhost:3000 ...
start "TraffixAI Frontend" cmd /k ""%ROOT%_start_frontend.bat""

:: Wait for Next.js to compile
timeout /t 12 /nobreak >nul

:: Summary
echo.
echo ==================================================
echo Frontend  : http://localhost:3000
echo Backend   : http://localhost:8002
echo API Docs  : http://localhost:8002/docs
echo MongoDB   : Atlas via backend\.env
echo Admin     : admin / admin@1234
echo ==================================================
echo.
start http://localhost:3000
echo Press any key to exit this window.
echo (All services will keep running in their own windows.)
pause >nul
