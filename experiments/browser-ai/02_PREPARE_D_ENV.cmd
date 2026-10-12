@echo off
setlocal EnableExtensions DisableDelayedExpansion
title HueSense SAM2.1 Gate0 - D drive isolated CPU setup
set "ROOT=%~dp0..\.."
for %%P in ("%ROOT%") do set "ROOT=%%~fP"
set "REQUIREMENTS=%~dp0requirements_gate0_cpu.txt"
set "WORK=D:\HS_SAM2_GATE0"
set "VENV=%WORK%\venv"
set "TEMP=%WORK%\tmp"
set "TMP=%WORK%\tmp"
set "PIP_CACHE_DIR=%WORK%\pip-cache"
set "HF_HUB_OFFLINE=1"
set "TRANSFORMERS_OFFLINE=1"
set "PIP_DISABLE_PIP_VERSION_CHECK=1"
set "PIP_NO_CACHE_DIR=1"
echo ======================================================
echo HueSense SAM2.1 Gate0 - OPTIONAL D: CPU environment
echo No Docker modifications. No C: Python pip installs.
echo ======================================================
if not exist "%REQUIREMENTS%" (
 echo ERROR: missing Gate0 requirements file: "%REQUIREMENTS%"
 pause
 exit /b 2
)
if not exist "%WORK%" mkdir "%WORK%"
if not exist "%TEMP%" mkdir "%TEMP%"
echo.
echo Target venv: %VENV%
echo Temp/pip cache: D: only
echo NOTE: installation makes network requests for Python WHEELS.
echo NOTE: NO SAM2 MODEL DOWNLOAD; the existing HF checkpoint is reused.
echo NOTE: CPU inference may take substantial time.
echo NOTE: the first smoke test is NOT yet an integration into the website.
echo.
echo Check system Python:
python -c "import sys; print(sys.executable); print(sys.version)"
if errorlevel 1 goto failed
echo.
set /p "AGREE=Type INSTALL to create D: venv and install CPU packages (else cancel): "
if not "%AGREE%"=="INSTALL" (
 echo Cancelled. No packages were installed.
 exit /b 0
)
if not exist "%VENV%\Scripts\python.exe" (
 python -m venv "%VENV%"
 if errorlevel 1 goto failed
)
echo.
echo Step A: pinned CPU PyTorch / torchvision from official index.
echo If versions are not published there, stop and report error.
"%VENV%\Scripts\python.exe" -m pip install --no-cache-dir --only-binary=:all: --index-url https://download.pytorch.org/whl/cpu torch==2.13.0 torchvision==0.28.0
if errorlevel 1 goto failed
echo.
echo Step B: minimal pinned SAM2 dependencies, no OpenCLIP.
"%VENV%\Scripts\python.exe" -m pip install --no-cache-dir --only-binary=:all: -r "%REQUIREMENTS%"
if errorlevel 1 goto failed
"%VENV%\Scripts\python.exe" -m pip check
if errorlevel 1 goto failed
"%VENV%\Scripts\python.exe" -c "import torch,transformers,PIL,safetensors;from transformers import Sam2Model,Sam2Processor;print('GATE0 DEPENDENCIES READY',torch.__version__,transformers.__version__,PIL.__version__)"
if errorlevel 1 goto failed
echo.
echo READY. Next run:
echo "%VENV%\Scripts\python.exe" "%~dp003_GATE0_SAM2_FIRST_MASK.py"
pause
exit /b 0
:failed
echo.
echo STOP: no fallback package versions, no model download and no research Docker changes.
echo Existing venv may be partially installed. Copy this error before retrying.
pause
exit /b 1
