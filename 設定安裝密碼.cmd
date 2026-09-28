@echo off
rem Double-click to set the installer password (runs npm.cmd, so PowerShell's script policy does not get in the way).
cd /d "%~dp0"
call npm.cmd run set-installer-password
echo.
pause
