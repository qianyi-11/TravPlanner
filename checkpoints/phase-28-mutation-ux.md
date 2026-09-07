Phase completed: Phase 28 — Loading and Mutation UX
Commit: pending
Objective completed: Audited all frontend callable mutations and confirmed pending guards, progress labels, failure messages, and realtime/backend transition handling across the migrated workflow.

Files added: None.
Files modified:
- Plan.txt

Files moved/renamed: None.
Files deleted: None.

Important implementation decisions:
- Existing page-local pending state is retained because each screen has one small mutation scope; no shared mutation framework was needed.
- Home/create/join, candidate submission, budget, voting, planning, review, and membership actions disable controls while pending.
- Successful domain mutations rely on callable results plus Firestore listeners or route transitions rather than optimistic local domain state.

Backend/contracts used:
- All callable wrappers under lib/api and their corresponding realtime repositories.

Validation performed:
- build: Not run; no runtime code changed.
- typecheck: Existing frontend typecheck passed in Phase 27.
- lint: Existing lint passed in Phase 27.
- tests: Not run for this phase.

Known issues or blockers:
- Live Firebase/App Check success paths remain externally unvalidated without project credentials.

Important context for next phase:
- Verify emulator configuration and App Check initialization without disabling security enforcement.

Next phase:
- Phase 29 — App Check and Emulator Support
