@echo off
cd /d "%~dp0"
if not exist "config.json" copy /y "config.example.json" "config.json" >nul
start "" notepad.exe "%~dp0config.json"
