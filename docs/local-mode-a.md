# Local Prototype — Mode A

## Start

Double-click `run-local.bat` from Windows Explorer.

## Services

| Service | Address |
| --- | --- |
| Frontend | http://localhost:3000 |
| Emulator UI | http://localhost:4000 |
| Auth | 127.0.0.1:9099 |
| Firestore | 127.0.0.1:8080 |
| Functions | 127.0.0.1:5001 |

Mode A uses local Firebase emulators. It does not use production Firestore or deployed Cloud Functions. Emulator data is temporary unless persistence is added later.

## Optional Google APIs

Set `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` in local environment configuration for browser autocomplete. For emulated Functions provider calls, copy `functions/.secret.local.example` to `functions/.secret.local` and add a local `GOOGLE_MAPS_API_KEY`. Never commit either key.
