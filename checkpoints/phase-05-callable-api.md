Phase completed: Phase 5 — Typed Callable API Layer
Commit: pending
Objective completed: Added one validated callable adapter and typed wrappers for every function exported by `functions/src/index.ts`.

Files added:
- lib/api/callable.ts
- lib/api/trips.ts
- lib/api/membership.ts
- lib/api/candidates.ts
- lib/api/voting.ts
- lib/api/budget.ts
- lib/api/planning.ts
- lib/api/review.ts
- lib/api/fixed-bookings.ts
- lib/api/critical-facts.ts
- lib/api/change-requests.ts
- lib/api/index.ts

Files modified:
- Plan.txt

Files moved/renamed: None.
Files deleted: None.

Important implementation decisions:
- Inputs and outputs are parsed with the shared schemas before returning to UI code.
- No wrappers were created for non-exported or documentation-only operations.
- The adapter uses a small structural schema type to avoid duplicate Zod-version coupling across workspaces.

Backend/contracts used:
- Shared contracts for trips, membership, candidates, voting, budget, planning, review, bookings, critical facts, and change requests.

Validation performed:
- build: Not run for this phase.
- typecheck: `npm.cmd run typecheck:frontend` passed.
- lint: Not rerun after the final one-line adapter change; prior lint was blocked only by the fixed source issue.
- tests: Not run for this phase.

Known issues or blockers:
- Firebase calls still require authenticated, configured client state; error-to-user mapping is handled in a later phase.

Important context for next phase:
- UI mutations should import from `@/lib/api`, never call `httpsCallable` directly.

Next phase:
- Phase 6 — Firestore Repository Layer
