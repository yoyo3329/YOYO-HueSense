@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title YOYO Control Center V2.1
set "PY=C:\yoyo_env\a21_clean_repro\Scripts\python.exe"
if not exist "%PY%" set "PY=python"

echo ================================================================================================
echo YOYO CONTROL CENTER V2.1
echo Cloud-synced Package Inbox / Auto Runner / Rich Result View
echo ================================================================================================
"%PY%" -u "%~dp0app\server.py" --port 8765
set "RC=%ERRORLEVEL%"
echo.
echo Control Center stopped. Exit code: %RC%
pause
exit /b %RC%
