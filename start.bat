@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto :node_missing
if not exist "node_modules\terminal-kit\package.json" (
  goto :dependencies_missing
)
node tools\tui.mjs
set "TUI_EXIT=%errorlevel%"
goto :end
:node_missing
echo Node.js 22.12.0 or newer is required to run flexLingua Terminal UI.
pause
set "TUI_EXIT=1"
goto :end
:dependencies_missing
echo Dependencies are missing. Run npm ci from this directory, then try again.
pause
set "TUI_EXIT=1"
:end
endlocal & exit /b %TUI_EXIT%
