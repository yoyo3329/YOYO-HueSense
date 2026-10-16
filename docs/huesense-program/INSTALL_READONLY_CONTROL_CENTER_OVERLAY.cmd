@echo off
setlocal EnableExtensions DisableDelayedExpansion
title HueSense READ-ONLY Control Center Roadmap Overlay
echo ================================================================
echo HueSense product roadmap (read-only dashboard overlay)
echo No Docker restart, research job, queue, Gate, model, or config edits.
echo ================================================================
set "SOURCE=%~dp0..\..\control_center_v2\web"
for %%A in ("%SOURCE%") do set "SOURCE=%%~fA"
set "CANON=D:\docker\color-search-test\control_center_v2\web"
set "BACKUP=D:\YOYO_DATA\roadmap_ui_backups"
if not exist "%SOURCE%\huesense_product_roadmap.js" (
 echo ERROR: R&D source is not present.
 exit /b 2
)
if not exist "%CANON%\index.html" (
 echo ERROR: canonical Control Center web directory not found: %CANON%
 echo No changes. Ask before modifying the actual code root.
 exit /b 3
)
if not exist "%CANON%\app.js" (
 echo ERROR: target does not look like the Control Center web directory.
 exit /b 4
)
echo Source: %SOURCE%
echo Target: %CANON%
echo Backup: %BACKUP%
echo This copies only two HueSense roadmap data/JS files and inserts one script tag.
echo You must have pulled the latest R&D branch before installing.
echo It does NOT replace index.html wholesale or touch Gate/Queue/Authority.
echo.
set /p "OK=Type ROADMAP to install the read-only overlay (else cancel): "
if not "%OK%"=="ROADMAP" (
 echo Cancelled. No files changed.
 exit /b 0
)
if not exist "%BACKUP%" mkdir "%BACKUP%"
powershell -NoProfile -Command "$ErrorActionPreference='Stop';$base='%CANON%';$src='%SOURCE%';$dst='%BACKUP%';$stamp=Get-Date -Format 'yyyyMMdd_HHmmss';$dir=Join-Path $dst $stamp;New-Item -ItemType Directory -Force -Path $dir | Out-Null;foreach($name in @('index.html','huesense_product_roadmap.js','huesense_program_status.json')){$p=Join-Path $base $name;if(Test-Path $p){Copy-Item -LiteralPath $p -Destination (Join-Path $dir $name) -Force}};$h=Join-Path $base 'index.html';$html=Get-Content -LiteralPath $h -Raw -Encoding UTF8;$tag='<script src=\"huesense_product_roadmap.js\"></script>';if($html -notmatch [regex]::Escape($tag)){if($html -notmatch '</body>'){throw 'Missing body end tag, no script inserted'};$html=$html.Replace('</body>',$tag+[Environment]::NewLine+'</body>');[IO.File]::WriteAllText($h,$html,(New-Object System.Text.UTF8Encoding($false)))};Copy-Item -LiteralPath (Join-Path $src 'huesense_product_roadmap.js') -Destination (Join-Path $base 'huesense_product_roadmap.js') -Force;Copy-Item -LiteralPath (Join-Path $src 'huesense_program_status.json') -Destination (Join-Path $base 'huesense_program_status.json') -Force;Write-Host ('STATIC ROADMAP OVERLAY INSTALLED. Backup: '+$dir)"
if errorlevel 1 (
 echo ERROR during installation. Backup files are under %BACKUP%.
 echo Do not rerun; inspect before retrying.
 pause
 exit /b 6
)
echo.
echo INSTALLED. Open/refresh http://127.0.0.1:8765/
echo A read-only Product Roadmap panel should appear near the top.
echo 60-second GitHub checks are performed only while that page is open.
echo Google Drive Docs are not auto-modified by this overlay.
pause
