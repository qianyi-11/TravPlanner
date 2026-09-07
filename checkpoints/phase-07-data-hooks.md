Phase completed: Phase 7 — Data Hooks
Commit: pending
Objective completed: Added reusable realtime hooks for memberships, trips, members, candidates, submissions, itinerary options, review drafts, finalized itinerary, and current membership.

Files added:
- lib/hooks/use-realtime.ts
- lib/hooks/use-my-trips.ts
- lib/hooks/use-trip.ts
- lib/hooks/use-trip-members.ts
- lib/hooks/use-candidates.ts
- lib/hooks/use-submissions.ts
- lib/hooks/use-itinerary-options.ts
- lib/hooks/use-review.ts
- lib/hooks/use-final-itinerary.ts
- lib/hooks/use-current-membership.ts
- lib/hooks/index.ts

Files modified:
- Plan.txt

Files moved/renamed: None.
Files deleted: None.

Important implementation decisions:
- A shared subscription hook keeps loading, error, cleanup, and disabled-auth behavior consistent.
- Hooks subscribe only when their required ID/auth data exists.
- Domain state is returned from Firestore; no local cache or optimistic domain mutation was added.

Backend/contracts used:
- Phase 6 Firestore repositories and shared document types.

Validation performed:
- build: Not run for this phase.
- typecheck: `npm.cmd run typecheck:frontend` passed.
- lint: `npm.cmd run lint -- --quiet` passed.
- tests: Not run for this phase.

Known issues or blockers:
- Existing pages still consume the old Zustand store until Phase 8 onward.

Important context for next phase:
- Migrate pages to these hooks before deleting mock domain state.

Next phase:
- Phase 8 — Reduce Zustand to UI State
