Phase completed: Phase 27 — Error Handling
Commit: pending
Objective completed: Added shared Firebase/backend error normalization and applied it at callable and realtime boundaries.

Files added:
- lib/errors/firebase-error.ts
- lib/errors/user-message.ts
- lib/errors/index.ts

Files modified:
- lib/api/callable.ts
- lib/hooks/use-realtime.ts
- lib/auth/auth-provider.tsx
- Plan.txt

Files moved/renamed: None.
Files deleted: None.

Important implementation decisions:
- Callable errors are converted once at the API boundary, while realtime subscription errors are converted in the shared hook.
- Known Firebase transport codes and shared backend reasons receive short user-safe messages; unknown Error messages remain available without stack traces.

Backend/contracts used:
- Firebase callable codes and shared AppErrorCode reason details.

Validation performed:
- build: Not run for this phase.
- typecheck: Pending phase validation.
- lint: Pending phase validation.
- tests: Not run for this phase.

Known issues or blockers:
- Some page fallbacks still use their own generic wording, but raw backend transport errors are normalized at shared boundaries.

Important context for next phase:
- Audit every callable mutation for pending/disabled/success/failure handling; most migrated pages already have pending guards.

Next phase:
- Phase 28 — Loading and Mutation UX
