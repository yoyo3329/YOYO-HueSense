@echo off
setlocal EnableExtensions DisableDelayedExpansion
title HueSense SAM2.1 - ONE CLICK LOCAL STUDIO
set "ROOT=%~dp0..\..\.."
for %%R in ("%ROOT%") do set "ROOT=%%~fR"
set "PYTHON=D:\HS_SAM2_GATE0\venv\Scripts\python.exe"
set "SERVER=%~dp0server.py"
set "SITE=%ROOT%\sites\huesense-color-studio\source\dist"
set "TEMP=D:\HS_SAM2_GATE0\tmp"
set "TMP=D:\HS_SAM2_GATE0\tmp"
set "HF_HUB_OFFLINE=1"
set "TRANSFORMERS_OFFLINE=1"
set "HF_HUB_DISABLE_TELEMETRY=1"
echo.
echo HueSense local SAM2.1 - any object, click once to propose a mask.
echo Offline checkpoint, CPU, port 8779. No Docker changes.
echo.
if not exist "%PYTHON%" (
 echo ERROR: Missing isolated D: Python.
 echo First run experiments\browser-ai\02_PREPARE_D_ENV.cmd
 echo It requires typing INSTALL and may download pinned CPU Python packages.
 pause
 exit /b 2
)
if not exist "%SITE%\editor\index.html" (
 echo ERROR: Site dist not found: %SITE%
 pause
 exit /b 3
)
"%PYTHON%" -m pip check
if errorlevel 1 (
 echo ERROR: Environment packages conflict.
 pause
 exit /b 4
)
"%PYTHON%" "%SERVER%" --site "%SITE%" --port 8779
if errorlevel 1 (
 echo ERROR: SAM2 could not start. Do NOT run system Python pip install.
 pause
 exit /b 5
)
endlocal
