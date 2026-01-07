@echo off
setlocal

echo Starting PlanLi Places proxy (with logs)...
echo.
echo Folder: %~dp0
echo.
echo NOTE: This uses server\.env via dotenv (GOOGLE_MAPS_KEY must be set).
echo.

cd /d "%~dp0"

REM Optional: make logs a bit more readable in Node
set NODE_ENV=development

node server.js

echo.
echo Server process exited. Press any key to close.
pause >nul
