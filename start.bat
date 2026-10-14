@echo off
setlocal
cd /d "%~dp0"
echo flexLingua - lokalny tryb uruchamiania
if exist "index-standalone.html" (
  echo Plik bez serwera: index-standalone.html
)
where node >nul 2>nul
if not errorlevel 1 (
  echo Start serwera Node.js. Nacisnij Ctrl+C, aby zakonczyc.
  node tools\serve.mjs --open
  goto :end
)
where py >nul 2>nul
if not errorlevel 1 (
  start "" "http://127.0.0.1:8000/"
  py -3 -m http.server 8000 --bind 127.0.0.1
  goto :end
)
where python >nul 2>nul
if not errorlevel 1 (
  start "" "http://127.0.0.1:8000/"
  python -m http.server 8000 --bind 127.0.0.1
  goto :end
)
echo.
echo Brak Node.js i Python. Uruchamiam wersje offline bez serwera.
start "" "%~dp0index-standalone.html"
:end
endlocal
