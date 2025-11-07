@echo off
REM ECF 60 Validator - Local GUI Startup Script for Windows

cls

echo ============================================================
echo.
echo        ECF 60 Validator - Local GUI System
echo.
echo ============================================================
echo.
echo This system runs 100%% LOCALLY on your computer
echo Your files never leave this machine
echo.
echo Starting local web server...
echo.

cd /d "%~dp0gui"

REM Check if Node.js is installed
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed
    echo.
    echo Please install Node.js first:
    echo    Download from: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

REM Start the server
node server.cjs
