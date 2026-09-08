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

start "Trippy Firebase Emulators" /D "%~dp0" "%ComSpec%" /k ""%~f0" emulators"
start "Trippy Next.js" /D "%~dp0" "%ComSpec%" /k ""%~f0" frontend"

timeout /t 8 /nobreak >nul

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