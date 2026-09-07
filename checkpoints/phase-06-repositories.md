Phase completed: Phase 6 — Firestore Repository Layer
Commit: pending
Objective completed: Added realtime repositories for trips, memberships, members, candidates, submissions, private votes, itinerary options, review drafts, and finalized itinerary versions.

Files added:
- lib/repositories/trips.ts
- lib/repositories/memberships.ts
- lib/repositories/members.ts
- lib/repositories/candidates.ts
- lib/repositories/submissions.ts
- lib/repositories/votes.ts
- lib/repositories/itinerary-options.ts
- lib/repositories/review.ts
- lib/repositories/itinerary-versions.ts
- lib/repositories/index.ts

Files modified:
- Plan.txt

Files moved/renamed: None.
Files deleted: None.

Important implementation decisions:
- Reads use the exact `users/{uid}/tripMemberships` and `trips/{tripId}` subcollection paths from the backend model.
- Private candidate and option votes are read only by deterministic per-user document IDs; no prohibited list queries are used.
- Realtime listeners are used for workflow state and cleaned up by the calling hooks.

Backend/contracts used:
- `TripDocument`, membership, member, candidate, submission, vote, itinerary option, review draft, and itinerary version schemas.
- `firebase/firestore.rules` read permissions.

Validation performed:
- build: Not run for this phase.
- typecheck: `npm.cmd run typecheck:frontend` passed.
- lint: Not run after repository additions.
- tests: Not run for this phase.

Known issues or blockers:
- Query/index behavior still needs emulator/security validation in later phases.

Important context for next phase:
- Hooks should own subscriptions and expose `{ data, loading, error }` to client pages.

Next phase:
- Phase 7 — Data Hooks
