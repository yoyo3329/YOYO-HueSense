@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22 or newer, then run this file again.
  pause
  exit /b 1
)
call npm ci --ignore-scripts --no-audit --no-fund
if errorlevel 1 goto failed
call npm run prepare:runtime
if errorlevel 1 goto failed
call npm run check
if errorlevel 1 goto failed
call npm test
if errorlevel 1 goto failed
echo Open http://localhost:8788/ in Chrome or Edge after the server starts.
echo No Python, Docker, model training, or existing server changes.
call npm start
exit /b %errorlevel%
:failed
echo Setup or tests failed. See the error above. No server was started.
pause
exit /b 1
