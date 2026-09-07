Phase completed: Phase 3 — Firebase Client Foundation
Commit: pending
Objective completed: Added browser Firebase initialization, Auth, Firestore, callable Functions, App Check, and opt-in emulator support.

Files added:
- lib/firebase/client.ts
- lib/firebase/auth.ts
- lib/firebase/firestore.ts
- lib/firebase/functions.ts
- lib/firebase/app-check.ts
- lib/firebase/emulator.ts
- lib/firebase/index.ts
- .env.example

Files modified:
- .gitignore
- Plan.txt

Files moved/renamed: None.
Files deleted: None.

Important implementation decisions:
- Firebase is initialized once through the modular web SDK.
- Callable Functions use the backend's default `us-central1` region.
- Emulators and App Check only activate when explicitly configured; no credentials or debug tokens are committed.

Backend/contracts used:
- `functions/src/index.ts` export configuration and `firebase.json`.

Validation performed:
- build: Not run for this client-only phase.
- typecheck: `npm.cmd run typecheck:frontend` passed.
- lint: Not run for this client-only phase.
- tests: Not run for this client-only phase.

Known issues or blockers:
- Real Auth/App Check behavior requires Firebase project environment variables.

Important context for next phase:
- Root layout still needs the Auth provider and protected-page behavior.

Next phase:
- Phase 4 — Authentication
