@echo off
setlocal EnableExtensions DisableDelayedExpansion
title HueSense SAM2.1 Gate 0 READ-ONLY PREFLIGHT
echo ============================================================
echo HueSense SAM2.1 - Gate 0 readonly checks (no installations)
echo ============================================================
echo.
echo [1/5] Active Python location and modules
where python
python -c "import sys,importlib.util as u;print('Python:',sys.executable);[(print(n, bool(u.find_spec(n)))) for n in ['torch','transformers','PIL','safetensors','huggingface_hub']]"
echo.
echo [2/5] Previously configured certified interpreter
if defined YOYO_PYTHON_EXE (
 echo YOYO_PYTHON_EXE is configured
 if exist "%YOYO_PYTHON_EXE%" (
  "%YOYO_PYTHON_EXE%" -c "import sys,importlib.util as u; print('Selected Python:',sys.executable);[(print(n, bool(u.find_spec(n)))) for n in ['torch','transformers','PIL','safetensors','huggingface_hub']]"
 ) else (
  echo Configured interpreter path is missing.
 )
) else (
 echo YOYO_PYTHON_EXE is NOT configured. This is not a failure of the model itself.
)
echo.
echo [3/5] Pinned SAM2.1 model blob (existing HF cache only)
set "SAM_BLOB=%USERPROFILE%\.cache\huggingface\hub\models--facebook--sam2.1-hiera-tiny\blobs\48c14467e5cf9e51870511feb72c89688e82dd74523142c0538b663e193ac2a7"
if exist "%SAM_BLOB%" (
 for %%I in ("%SAM_BLOB%") do echo Blob: %%~fI  Bytes: %%~zI
 if not "1"=="%HS_SKIP_HASH%" (
  echo Checking pinned SHA256. This may take time; it only reads the file.
  certutil -hashfile "%SAM_BLOB%" SHA256
 ) else (
  echo SHA256 skipped because HS_SKIP_HASH=1.
 )
) else (
 echo Pinned blob was NOT FOUND here. Do not download new model.
)
echo.
echo [4/5] Existing local checkout files (if run from browser-ai folder)
if exist "..\..\tools\b1\stylecolor-v0.8a2.1-clean-repro\certification\sam_lock.json" (
 echo SAM lock file FOUND.
) else (
 echo SAM lock not at relative path; confirm checkout or use GitHub source.
)
if exist "..\..\sites\huesense-color-studio\source\dist\editor\index.html" (
 echo Latest website dist editor FOUND.
) else (
 echo Website dist not at relative path; check checkout.
)
echo.
echo [5/5] Free disk space (read-only)
powershell -NoProfile -Command "Get-PSDrive C,D | Select-Object Name,@{Name='FreeGB';Expression={[math]::Round($_.Free/1GB,1)}}"
echo.
echo NO packages or Docker images installed. NO files or model caches moved.
echo Do not run PR2 Bridge yet unless a validated interpreter exists.
echo Copy the output to your HueSense development discussion.
pause
endlocal
