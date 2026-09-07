Phase completed: Phase 29 — App Check / Emulator Validation
Commit: pending
Objective completed: Confirmed emulator connection points and added opt-in App Check debug-token support without disabling App Check or committing a token.

Files added: None.
Files modified:
- lib/firebase/app-check.ts
- .env.example
- Plan.txt

Files moved/renamed: None.
Files deleted: None.

Important implementation decisions:
- Auth, Firestore, and Functions accessors already call configureFirebaseEmulators with explicit host variables and Functions region us-central1.
- App Check remains enabled when a site key is configured; emulator debug mode only sets Firebase's documented debug-token hook when explicitly configured.
- No credentials or debug token were added to the repository.

Backend/contracts used:
- enforceAppCheck callable configuration and Firebase emulator client APIs.

Validation performed:
- build: Not run for this phase.
- typecheck: Pending phase validation.
- lint: Pending phase validation.
- tests: Firebase CLI/emulator execution not available in the current shell; no live App Check validation claimed.

Known issues or blockers:
- A real Firebase project or local emulator process plus a generated debug token is required for end-to-end verification.

Important context for next phase:
- Review Firestore rules against every repository read and run security tests; do not loosen rules.

Next phase:
- Phase 30 — Security Rule Validation
