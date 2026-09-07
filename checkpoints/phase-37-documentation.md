Phase completed: Phase 37 — Documentation
Commit: pending
Objective completed: Documented the integrated frontend/backend architecture, responsibilities, environment, emulator workflow, trip workflow, route mapping, build commands, and deployment notes.

Files added:
- docs/integration.md
- checkpoints/phase-37-documentation.md

Files modified:
- README.md
- Plan.txt

Files moved/renamed: None.
Files deleted: None.

Important implementation decisions:
- Kept the README short and linked the detailed integration guide.
- Documented only routes and behavior present in the current implementation.
- Called out external configuration and live browser validation as unvalidated requirements.

Backend/contracts used:
- Firebase Auth, Firestore repositories, callable Cloud Functions, shared Zod contracts, Firestore rules/indexes, and the us-central1 Functions client.

Validation performed:
- build: Not rerun for documentation-only changes; prior full build passed.
- typecheck: Not rerun for documentation-only changes; prior full typecheck passed.
- lint: Not rerun for documentation-only changes; prior lint passed.
- tests: Not rerun for documentation-only changes; prior unit and emulator validation recorded in checkpoints.
- docs: git diff --check passed.

Known issues or blockers:
- Deployment credentials, OAuth domains, App Check registration, provider secrets, and two-user browser testing remain environment-specific.

Important context for next phase:
- Produce the final structured validation report with exact results and honest unsupported-feature status.

Next phase:
- Phase 38 — Final Validation Report
