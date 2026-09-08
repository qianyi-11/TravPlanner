@echo off
setlocal EnableExtensions

cd /d "%~dp0"

if /i "%~1"=="emulators" goto emulators
if /i "%~1"=="frontend" goto frontend

for %%T in (node npm.cmd npx.cmd java) do (
    where %%T >nul 2>&1
    if errorlevel 1 (
        echo ERROR: Required tool %%T was not found on PATH.
        pause
        exit /b 1
    )
)

if not exist "node_modules\next\package.json" (
    echo Installing dependencies...
    call npm.cmd install
    if errorlevel 1 (
        echo ERROR: npm install failed.
        pause
        exit /b 1
    )
)

echo Building shared contracts and Functions...
call npm.cmd run build:functions
if errorlevel 1 (
    echo ERROR: Functions build failed.
    pause
    exit /b 1
)

echo.
echo Starting Firebase emulators...
start "Trippy Firebase Emulators" /D "%~dp0" "%ComSpec%" /k ""%~f0" emulators"

echo Waiting for Auth Emulator...
call :wait_for_port 9099 "Auth Emulator"
if errorlevel 1 goto startup_failed
echo Auth Emulator ready.

echo.
echo Waiting for Firestore Emulator...
call :wait_for_port 8080 "Firestore Emulator"
if errorlevel 1 goto startup_failed
echo Firestore Emulator ready.

echo.
echo Waiting for Functions Emulator...
call :wait_for_port 5001 "Functions Emulator"
if errorlevel 1 goto startup_failed
echo Functions Emulator ready.

echo.
echo Starting Next.js...
start "Trippy Next.js" /D "%~dp0" "%ComSpec%" /k ""%~f0" frontend"

timeout /t 3 /nobreak >nul

start "" "http://localhost:3000"
start "" "http://localhost:4000"

echo.
echo ==========================================
echo Trippy Mode A started
echo ==========================================
echo Frontend:             http://localhost:3000
echo Firebase Emulator UI: http://localhost:4000
echo Auth:                 127.0.0.1:9099
echo Firestore:            127.0.0.1:8080
echo Functions:            127.0.0.1:5001
echo ==========================================
echo.

pause
exit /b 0

:wait_for_port
set "wait_port=%~1"
set "wait_name=%~2"
for /l %%N in (1,1,60) do (
    curl.exe --silent --output NUL --connect-timeout 1 --max-time 1 "http://127.0.0.1:%wait_port%/"
    if not errorlevel 1 exit /b 0
    timeout /t 1 /nobreak >nul
)
echo ERROR: %wait_name% did not become ready on port %wait_port%.
exit /b 1

:startup_failed
echo.
echo ERROR: Required Firebase emulator startup failed.
echo The emulator terminal remains open for inspection.
pause
exit /b 1

:emulators
set "FIREBASE_PROJECT=demo-codenection-2026-trippy"

npx.cmd firebase emulators:start --only auth,firestore,functions --project demo-codenection-2026-trippy

exit /b %errorlevel%

:frontend
set "NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true"
set "NEXT_PUBLIC_FIREBASE_API_KEY=demo-api-key"
set "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=demo-codenection-2026-trippy.firebaseapp.com"
set "NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-codenection-2026-trippy"
set "NEXT_PUBLIC_FIREBASE_APP_ID=demo-app-id"
set "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=000000000000"
set "NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY="
set "NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099"
set "NEXT_PUBLIC_FIREBASE_FIRESTORE_EMULATOR_HOST=127.0.0.1:8080"
set "NEXT_PUBLIC_FIREBASE_FUNCTIONS_EMULATOR_HOST=127.0.0.1:5001"

npm.cmd run dev

exit /b %errorlevel%
