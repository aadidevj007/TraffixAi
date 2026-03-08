@echo off
title TraffixAI Frontend
cd /d "%~dp0frontend"
if not exist node_modules (
    echo Installing npm packages...
    call npm install --legacy-peer-deps
)
npm run dev
pause
