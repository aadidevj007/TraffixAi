@echo off
title TraffixAI Backend
cd /d "%~dp0backend"

:: ── Ensure venv exists ───────────────────────────────────────────────────────
if not exist venv\Scripts\activate.bat (
    echo [Backend] Creating Python virtual environment...
    python -m venv venv
    call venv\Scripts\activate.bat
    echo [Backend] Installing dependencies...
    pip install -r requirements.txt
)
call venv\Scripts\activate.bat

:: ── Environment ──────────────────────────────────────────────────────────────
set PORT=8001
set HOST=0.0.0.0
set DEBUG=true
set MONGODB_URI=mongodb://127.0.0.1:27017
set MONGODB_DB=traffixai
set YOLO_MODEL_PATH=backend\models\yolov8n.pt
set CONF_THRESHOLD=0.4

:: ── Run server ───────────────────────────────────────────────────────────────
echo [Backend] Starting TraffixAI backend on http://localhost:8001
python main.py
pause
