@echo off
chcp 65001 >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\bigseller_draft_filler\run.ps1" -Login
if errorlevel 1 pause
