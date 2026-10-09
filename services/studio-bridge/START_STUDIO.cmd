@echo off
setlocal
if not defined YOYO_CODE_ROOT (
  echo Please set YOYO_CODE_ROOT to your current repository checkout.
  pause
  exit /b 1
)
if not defined YOYO_PYTHON_EXE (
  echo Please set YOYO_PYTHON_EXE to the existing certified Python executable.
  pause
  exit /b 1
)
set "HS_CLIP_CHECKPOINT=%YOYO_CLIP_CHECKPOINT%"
if not defined HS_CLIP_CHECKPOINT set "HS_CLIP_CHECKPOINT=%USERPROFILE%\.cache\clip\ViT-B-32.pt"
if not exist "%HS_CLIP_CHECKPOINT%" (
  echo Set YOYO_CLIP_CHECKPOINT to your existing OpenCLIP checkpoint file.
  echo No weights will be downloaded automatically.
  pause
  exit /b 1
)
"%YOYO_PYTHON_EXE%" "%YOYO_CODE_ROOT%\services\studio-bridge\server.py" --code-root "%YOYO_CODE_ROOT%" --sam-lock "%YOYO_CODE_ROOT%\tools\b1\stylecolor-v0.8a2.1-clean-repro\certification\sam_lock.json" --openclip-lock "%YOYO_CODE_ROOT%\tools\b1\stylecolor-v0.8a2.1-clean-repro\certification\openclip_lock.json" --clip-checkpoint "%HS_CLIP_CHECKPOINT%"
if errorlevel 1 pause
endlocal
