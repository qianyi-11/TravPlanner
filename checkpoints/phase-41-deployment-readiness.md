Phase completed: Phase 41 — Deployment Readiness
Commit: a8c20ce
Objective completed: Prepared the repository for Vercel frontend deployment and documented Firebase/Functions/provider configuration without adding credentials.

Files added:
- docs/deployment.md

Files modified:
- package.json
- .env.example
- Plan.txt

Files moved/renamed: None.
Files deleted: None.

Frontend files compared with `frontend` branch:
- No frontend design files changed in this deployment-readiness phase.

Important UI-preservation decisions:
- No UI redesign or route change; deployment work stays outside the frontend component hierarchy.

Important implementation decisions:
- Added `build:web` for shared package plus Next.js only, keeping Functions deployment separate.
- Documented the actual `us-central1` Functions region, Firebase CLI commands, Vercel settings, environment contract, App Check, Google provider keys, authorized domains, validation, and rollback.
- Marked the App Check debug token as emulator-only in the example environment file.
- Did not create `.firebaserc`, Vercel serverless APIs, or credentials.

Backend/contracts used:
- `firebase.json`, `functions/src/index.ts`, `lib/firebase/functions.ts`, `lib/firebase/app-check.ts`, and the existing environment contract.

Validation performed:
- build: Passed `npm.cmd run build:web` and `npm.cmd run build:functions`.
- typecheck: Passed `npm.cmd run typecheck`.
- lint: Passed `npm.cmd run lint`; seven existing warnings remain, no errors.
- tests: Passed `npm.cmd test`: 205 passed, 140 skipped.
- emulator/security checks: Passed `npm.cmd run test:security:emulator`; expected denied-write logs were emitted by the rules tests. Non-emulator security tests also passed 8 tests with 24 emulator cases skipped by gating.

Known issues or blockers:
- No Firebase/Vercel/Google production credentials are available, so deployment and live provider validation remain external.
- README.md contains unrelated pre-existing working-tree changes and was not included.

External configuration still required:
- Firebase project binding, Blaze billing, Google Auth, Places/Routes APIs, restricted browser key, Functions secret, App Check site key/registration, Vercel project, and authorized domains.

Important context for next phase:
- Phase 42 is an operator checklist. Execute only account-backed actions that are actually available; otherwise classify them as externally unvalidated.

Next phase:
- Phase 42 — Production Deployment Checklist
