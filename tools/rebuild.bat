@echo off
setlocal
set "ROOT=%~dp0.."
py -c "import sqlite3,sys; assert sys.version_info >= (3,10); sqlite3.connect(':memory:').execute('CREATE VIRTUAL TABLE probe USING fts5(text)')" >nul 2>nul
if not errorlevel 1 (
  set "PY=py"
) else (
  set "PY=python"
)
%PY% -c "import sqlite3,sys; assert sys.version_info >= (3,10); sqlite3.connect(':memory:').execute('CREATE VIRTUAL TABLE probe USING fts5(text)')" >nul 2>nul
if errorlevel 1 (
  echo Python 3.10 or newer with SQLite FTS5 is required. Install Python and enable its py launcher or add Python to PATH. 1>&2
  exit /b 1
)
%PY% "%ROOT%\tools\init_database.py" || exit /b 1
%PY% "%ROOT%\tools\export_browser_data.py" || exit /b 1
%PY% "%ROOT%\tests\validate_catalogue.py" || exit /b 1
%PY% "%ROOT%\tests\validate_command_verification.py" || exit /b 1
%PY% "%ROOT%\tests\test_command_verification.py" || exit /b 1
%PY% "%ROOT%\tests\test_version_profiles.py" || exit /b 1
%PY% "%ROOT%\tests\test_generated_data.py" || exit /b 1
%PY% "%ROOT%\tests\validate_generated_data.py" || exit /b 1
where node >nul 2>nul
if %errorlevel%==0 (
  node --check "%ROOT%\js\app.js" || exit /b 1
  node --check "%ROOT%\assets\vendor\ipaddr.js" || exit /b 1
  node --check "%ROOT%\js\config-builder.js" || exit /b 1
  node --check "%ROOT%\js\builder-ui.js" || exit /b 1
  node --check "%ROOT%\data\catalogue-data.js" || exit /b 1
  node --check "%ROOT%\data\command-verification.js" || exit /b 1
  node "%ROOT%\tests\validate_runtime.js" || exit /b 1
  node "%ROOT%\tests\validate_config_builder.js" || exit /b 1
  node "%ROOT%\tests\validate_builder_ui.js" || exit /b 1
)
echo.
echo Rebuild complete. Open %ROOT%\index.html
endlocal
