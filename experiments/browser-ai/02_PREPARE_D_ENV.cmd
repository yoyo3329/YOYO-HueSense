@echo off
setlocal EnableExtensions DisableDelayedExpansion
title HueSense Gate 0 - isolated D drive Python
echo ============================================================
echo HueSense SAM2.1 Gate 0 / D:-ONLY ISOLATED PYTHON SETUP
echo No Docker, Node.js, or system Python changes.
echo ============================================================
set "ROOT=%~dp0..\.."
for %%P in ("%ROOT%") do set "ROOT=%%~fP"
set "LOCK=%ROOT%\tools\b1\stylecolor-v0.8a2.1-clean-repro\python\requirements_certified.txt"
set "WORK=D:\HS_SAM2_GATE0"
set "ENV=%WORK%\venv"
set "TEMP=%WORK%\tmp"
set "TMP=%WORK%\tmp"
set "PIP_CACHE_DIR=%WORK%\pip-cache"
set "HF_HOME=%WORK%\hf-cache"
set "TORCH_HOME=%WORK%\torch-cache"
set "HF_HUB_OFFLINE=1"
set "TRANSFORMERS_OFFLINE=1"
set "PIP_DISABLE_PIP_VERSION_CHECK=1"
if not exist "%LOCK%" (
 echo ERROR: locked research requirements file not found: %LOCK%
 pause
 exit /b 2
)
if not exist "%WORK%" mkdir "%WORK%"
if not exist "%TEMP%" mkdir "%TEMP%"
if not exist "%HF_HOME%" mkdir "%HF_HOME%"
if not exist "%TORCH_HOME%" mkdir "%TORCH_HOME%"
echo.
echo Python source (will NOT be modified):
python -c "import sys; print(sys.executable); print(sys.version)"
if errorlevel 1 goto failed
echo.
echo Locked requirements: %LOCK%
echo Venv and temporary downloads: %WORK%
echo Existing model stays in original HF snapshot (read-only).
echo NOTE: Pinned torch/transformers wheels can consume several GB on D:.
echo This setup does NOT install a new model checkpoint.
echo If exact pinned wheels are unavailable the install will stop with an error.
echo.
set /p "AGREE=Type INSTALL to create D: venv and install exact locked dependencies (anything else cancels): "
if not "%AGREE%"=="INSTALL" (
 echo Cancelled. No Python packages were installed.
 exit /b 0
)
if not exist "%ENV%\Scripts\python.exe" (
 echo Creating venv on D: ...
 python -m venv "%ENV%"
 if errorlevel 1 goto failed
)
echo.
echo Installing pinned requirements INTO D: venv with pip cache disabled...
"%ENV%\Scripts\python.exe" -m pip install --no-cache-dir --only-binary=:all: -r "%LOCK%"
if errorlevel 1 goto failed
"%ENV%\Scripts\python.exe" -m pip check
if errorlevel 1 goto failed
"%ENV%\Scripts\python.exe" -c "import torch, transformers, PIL, safetensors; from transformers import Sam2Model, Sam2Processor; print('READY: torch',torch.__version__,'transformers',transformers.__version__,'Pillow',PIL.__version__); print('CPU available:', True)"
if errorlevel 1 goto failed
echo.
echo SETUP READY. Next:
echo "%ENV%\Scripts\python.exe" "%~dp003_GATE0_SAM2_FIRST_MASK.py"
echo This will ask for a garment photo and let you click on the garment.
echo.
pause
exit /b 0
:failed
echo.
echo SETUP NOT COMPLETE. No fallback model, no C:-drive system pip installation.
echo Copy the error text. Do NOT rerun with unpinned versions.
pause
exit /b 1
