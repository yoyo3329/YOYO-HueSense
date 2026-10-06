@echo off
setlocal
cd /d "%~dp0"
title YOYO Control Center V2
set "PY=C:\yoyo_env\a21_clean_repro\Scripts\python.exe"
if not exist "%PY%" (
  where py >nul 2>nul
  if %ERRORLEVEL%==0 (
    set "PY=py -3"
  ) else (
    set "PY=python"
  )
)
echo ====================================================================================================
echo YOYO CONTROL CENTER V2
echo Package Inbox + Gate-driven Auto Runner
echo ====================================================================================================
%PY% -u "%~dp0app\server.py" --port 8765
set "RC=%ERRORLEVEL%"
echo.
echo Control Center stopped. Exit code: %RC%
pause
exit /b %RC%
