@echo off
setlocal
cd /d "%~dp0"
call npm run demo
set "exitCode=%errorlevel%"
if not "%exitCode%"=="0" (
  echo.
  echo Demo failed with exit code %exitCode%.
)
exit /b %exitCode%
