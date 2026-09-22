@echo off
setlocal EnableExtensions
chcp 65001 >nul
set "ROOT=C:\xampp\htdocs\color-search-test\tools\b1"
set "TARGET=%ROOT%\stylecolor-v0.8a"
set "VPY=%TARGET%\.venv\Scripts\python.exe"
if not exist "%VPY%" (
  echo [ERROR] v0.8-A venv not found. Run INSTALL_AND_RUN_STYLECOLOR_v0.8A.cmd first.
  pause
  exit /b 1
)
node "%TARGET%\node\ensure_clip_service.js"
node "%TARGET%\node\run_stylecolor_v0_8a.js" --root "%ROOT%" --python "%VPY%" --config "%TARGET%\config\stylecolor_v0_8a.config.json" --clip auto --out-base "%TARGET%\runs"
if errorlevel 1 (echo [FAIL] Pipeline failed.& pause & exit /b 2)
set /p LATEST=<"%TARGET%\runs\LATEST_RUN.txt"
node "%TARGET%\node\verify_output.js" "%LATEST%"
if errorlevel 1 (echo [FAIL] Output verification failed.& pause & exit /b 3)
start "" "%LATEST%\audit.html"
echo.
echo PASS - latest audit opened:
echo %LATEST%\audit.html
pause
