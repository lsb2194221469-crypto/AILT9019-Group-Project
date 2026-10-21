@echo off
cd /d "%~dp0"
chcp 65001 >nul
if exist "runtime\python.exe" (
  "runtime\python.exe" -X utf8 check_connection.py
) else (
  ".venv\Scripts\python.exe" -X utf8 check_connection.py
)
pause
