@echo off
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting administrator privileges...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

set SOURCE=F:\Project\PharmaOps
set DESTINATION=D:\Apps-PROD\PharmaOps

echo Stopping services...
nssm stop PharmaOps-Backend
nssm stop PharmaOps-Frontend
echo.

echo Copying frontend...
robocopy "%SOURCE%\frontend" "%DESTINATION%\frontend" /E /PURGE /XF .env /XD node_modules
echo.

echo Copying backend...
robocopy "%SOURCE%\backend" "%DESTINATION%\backend" /E /PURGE /XF .env /XD .venv
echo.

echo Building frontend...
cd /d "%DESTINATION%\frontend"
call npm run build:local
echo.

echo Starting services...
nssm start PharmaOps-Backend
nssm start PharmaOps-Frontend
echo.

echo Deploy complete.
pause
