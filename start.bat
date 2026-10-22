@echo off
setlocal
cd /d "%~dp0"
set "LECTURE_LAB_ENTRY=launch.py"
set "LECTURE_LAB_PUBLIC_STOP="
if /i "%~1"=="--public" (
  set "LECTURE_LAB_ENTRY=public_host.py"
  if /i "%~2"=="--stop" set "LECTURE_LAB_PUBLIC_STOP=--stop"
)
if not exist "config.json" copy /y "config.example.json" "config.json" >nul
if exist "runtime\python.exe" (
  if /i "%LECTURE_LAB_ENTRY%"=="public_host.py" (
    "runtime\python.exe" public_host.py %LECTURE_LAB_PUBLIC_STOP%
  ) else (
    "runtime\python.exe" launch.py %*
  )
  if errorlevel 1 pause
  exit /b
)
where python >nul 2>nul
if errorlevel 1 (
  echo Please use the portable ZIP containing the runtime folder.
  pause
  exit /b 1
)
if not exist ".venv\Scripts\python.exe" python -m venv .venv
if not exist ".venv\Scripts\python.exe" (
  echo Python 3.11+ is required. Unable to create environment.
  pause
  exit /b 1
)
".venv\Scripts\python.exe" -c "import pypdf, pymupdf" >nul 2>nul
if errorlevel 1 (
  ".venv\Scripts\python.exe" -m pip install -r requirements.txt
  if errorlevel 1 (
    echo Dependency installation failed. Use the portable ZIP instead.
    pause
    exit /b 1
  )
)
if /i "%LECTURE_LAB_ENTRY%"=="public_host.py" (
  ".venv\Scripts\python.exe" public_host.py %LECTURE_LAB_PUBLIC_STOP%
) else (
  ".venv\Scripts\python.exe" launch.py %*
)
if errorlevel 1 pause
