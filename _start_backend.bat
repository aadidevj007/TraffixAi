@echo off
title TraffixAI Backend
cd /d "%~dp0backend"

:: ── Ensure venv exists ───────────────────────────────────────────────────────
if not exist venv\Scripts\activate.bat (
    echo [Backend] Creating Python virtual environment...
    python -m venv venv
)
call venv\Scripts\activate.bat

echo [Backend] Syncing dependencies from requirements.txt...
python -m pip install --upgrade pip >nul 2>&1
pip install -r requirements.txt

:: ── Environment ──────────────────────────────────────────────────────────────
set PORT=8002
set HOST=0.0.0.0
set DEBUG=true
echo [Backend] Using backend\.env for MongoDB/Firebase/model settings

:: ── Run server ───────────────────────────────────────────────────────────────
echo [Backend] Starting TraffixAI backend on http://localhost:8002
python main.py
pause
