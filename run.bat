@echo off
REM StudioArona cross-platform launcher (Windows) — dispatcher mode
REM Usage:
REM   run.bat start                          Start full stack (PG/Redis/API/Bridge/Vite/LLM Gateway)
REM   run.bat python xxx.py [args]           Run any Python script
REM   run.bat python -c "code"               Run inline Python
REM   run.bat pytest [args]                  Run pytest
REM   run.bat pip install ...                Run pip
REM   run.bat bash                           Interactive bash (PATH contains venv)
REM   run.bat make <target>                  Run make
REM   run.bat --version                      python --version
REM
REM Behavior:
REM   1. Detect Windows architecture
REM   2. Link .venv\python.exe to vendor\python\<plat>\python.exe
REM   3. First-run: invoke uv sync to install platform-specific wheels
REM   4. Route the first argument to the matching venv tool; pass the rest through

setlocal EnableExtensions EnableDelayedExpansion

set ROOT=%~dp0
if "%ROOT:~-1%"=="\" set ROOT=%ROOT:~0,-1%

REM Detect Windows architecture
if /i "%PROCESSOR_ARCHITECTURE%"=="AMD64" (
  set PLAT=windows-x64
) else if /i "%PROCESSOR_ARCHITECTURE%"=="ARM64" (
  set PLAT=windows-arm64
) else (
  echo [run.bat] Unsupported Windows architecture: %PROCESSOR_ARCHITECTURE% 1>&2
  exit /b 1
)

set PY_EXE=%ROOT%\vendor\python\%PLAT%\python.exe
if not exist "%PY_EXE%" (
  echo [run.bat] Missing interpreter at %PY_EXE% 1>&2
  exit /b 1
)

REM Link .venv\python.exe to platform interpreter
if not exist "%ROOT%\.venv" mkdir "%ROOT%\.venv"
if exist "%ROOT%\.venv\python.exe" del "%ROOT%\.venv\python.exe"
cd /d "%ROOT%"
mklink "%ROOT%\.venv\python.exe" "vendor\python\%PLAT%\python.exe" >nul 2>&1

REM Check if site-packages needs initial sync (wheels are platform-specific)
set SITE_DIR=%ROOT%\.venv\Lib\site-packages
set NEED_SYNC=0
if not exist "%SITE_DIR%" (
  set NEED_SYNC=1
) else (
  dir /b "%SITE_DIR%" >nul 2>&1
  if errorlevel 1 set NEED_SYNC=1
)

if "%NEED_SYNC%"=="1" (
  echo [run.bat] First run on %PLAT% - syncing dependencies... 1>&2
  where uv >nul 2>&1
  if errorlevel 1 (
    echo [run.bat] 'uv' not found. Install from https://astral.sh/uv/ 1>&2
    exit /b 1
  )
  cd /d "%ROOT%"
  uv sync
  if errorlevel 1 exit /b 1
)

REM ─── Subcommand routing ─────────────────────────────────────────
REM 1. Empty / help → print usage
REM 2. start → business starter (infra\scripts\start.py)
REM 3. python|python3 → forward args to venv python
REM 4. -c → forward as python -c
REM 5. pytest / pip / etc. → -m module
REM 6. make / node / pnpm / bash / sh → passthrough
REM 7. anything else → forward to venv python (legacy behaviour)

set "CMD1=%~1"
if "%CMD1%"=="" goto :usage
if /i "%CMD1%"=="help" goto :usage
if /i "%CMD1%"=="-h" goto :usage
if /i "%CMD1%"=="--help" goto :usage

if /i "%CMD1%"=="start" goto :run_start
if /i "%CMD1%"=="install" goto :run_install
if /i "%CMD1%"=="python" goto :run_python
if /i "%CMD1%"=="python3" goto :run_python
if "%CMD1%"=="-c" goto :run_python_dash_c
if /i "%CMD1%"=="pytest" goto :run_pytest
if /i "%CMD1%"=="pip" goto :run_pip
if /i "%CMD1%"=="uv" goto :run_uv
if /i "%CMD1%"=="alembic" goto :run_module
if /i "%CMD1%"=="ruff" goto :run_module
if /i "%CMD1%"=="mypy" goto :run_module
if /i "%CMD1%"=="black" goto :run_module
if /i "%CMD1%"=="fastapi" goto :run_module
if /i "%CMD1%"=="make" goto :run_make
if /i "%CMD1%"=="node" goto :run_passthrough
if /i "%CMD1%"=="pnpm" goto :run_passthrough
if /i "%CMD1%"=="npx" goto :run_passthrough
if /i "%CMD1%"=="hermes" goto :run_hermes
if /i "%CMD1%"=="bash" goto :run_passthrough
if /i "%CMD1%"=="sh" goto :run_passthrough
if /i "%CMD1%"=="cmd" goto :run_passthrough

REM Fallback: forward the entire argv to venv python (treat as script path)
"%ROOT%\.venv\python.exe" %*
exit /b %errorlevel%

:run_start
shift
"%ROOT%\.venv\python.exe" "%ROOT%\infra\scripts\start.py" %*
exit /b %errorlevel%

:run_install
shift
"%ROOT%\.venv\python.exe" "%ROOT%\infra\scripts\install_deps.py" %*
exit /b %errorlevel%

:run_python
shift
"%ROOT%\.venv\python.exe" %*
exit /b %errorlevel%

:run_python_dash_c
"%ROOT%\.venv\python.exe" %*
exit /b %errorlevel%

:run_pytest
shift
"%ROOT%\.venv\python.exe" -m pytest %*
exit /b %errorlevel%

:run_pip
shift
"%ROOT%\.venv\python.exe" -m pip %*
exit /b %errorlevel%

:run_uv
shift
uv %*
exit /b %errorlevel%

:run_module
"%ROOT%\.venv\python.exe" -m "%CMD1%" %*
exit /b %errorlevel%

:run_make
shift
make -C "%ROOT%" %*
exit /b %errorlevel%

:run_passthrough
%CMD1% %*
exit /b %errorlevel%

:run_hermes
shift
hermes %*
exit /b %errorlevel%

:usage
echo Usage: run.bat {start^|install^|python^|pytest^|pip^|bash^|make^|hermes^|node^|pnpm} [args]
echo   start    Start full stack
echo   install  Bootstrap dependencies (uv/docker/hermes/models)
echo   python   Run a Python script under the venv
echo   pytest   Run pytest
echo   pip      Run pip
echo   make     Run make
echo   hermes   Run Hermes CLI
echo   ^<other^> Forwarded to venv python
echo.
echo Examples:
echo   run.bat start
echo   run.bat python scripts\benchmark_hermes.py
echo   run.bat pytest -m unit
exit /b 0
