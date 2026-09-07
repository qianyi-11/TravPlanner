Phase completed: Phase 36 — Final Repository Cleanup
Commit: pending
Objective completed: Audited the repository for dead mock state, obsolete prototype code, debug output, unsafe tracked files, and generated artifacts.

Files added:
- checkpoints/phase-36-cleanup.md

Files modified:
- Plan.txt

Files moved/renamed: None.
Files deleted: None.

Important implementation decisions:
- Kept compatibility redirects that preserve old frontend links; they do not own domain state.
- Confirmed no authoritative mock store, localStorage domain state, console debug statements, or fake ratings/availability/pricing remain in the active UI.
- Confirmed only .env.example is tracked from environment-like files; generated directories remain ignored.

Backend/contracts used:
- Existing shared schemas, Firebase repositories, callable API wrappers, and backend-controlled trip phases.

Validation performed:
- build: Passed in Phase 31; no source changes in this phase.
- typecheck: Passed in Phase 35; no source changes in this phase.
- lint: Passed in Phase 35; no source changes in this phase.
- tests: Passed in Phase 32; emulator-backed acceptance results recorded in Phase 33.
- repository audit: clean status before checkpoint, forbidden mock/debug references absent, no tracked credentials or generated artifacts.

Known issues or blockers:
- Live Google authentication/App Check and two-browser production validation still require external configuration.

Important context for next phase:
- Document the integrated architecture, environment setup, local emulators, workflow, and deployment notes.

Next phase:
- Phase 37 — Documentation
