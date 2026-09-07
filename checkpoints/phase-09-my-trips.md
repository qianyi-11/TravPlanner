Phase completed: Phase 9 — My Trips
Commit: pending
Objective completed: Replaced `/my-trips` prototype state with authenticated Firestore membership projections and real trip links.

Files added: None.
Files modified:
- app/my-trips/page.tsx
- Plan.txt

Files moved/renamed: None.
Files deleted: None.

Important implementation decisions:
- The page reads `users/{uid}/tripMemberships` through `useMyTrips` and filters only ACTIVE memberships.
- Empty state offers Create Trip and Join Trip; loading and repository errors are explicit.
- Legacy prototype cards remain elsewhere until their phases migrate them.

Backend/contracts used:
- `TripMembershipProjection` and Firestore membership rules.

Validation performed:
- build: Not run for this phase.
- typecheck: `npm.cmd run typecheck:frontend` passed.
- lint: `npm.cmd run lint -- --quiet` passed.
- tests: Not run for this phase.

Known issues or blockers:
- `/trips/new` and `/join` are introduced by subsequent phases.

Important context for next phase:
- `/my-trips` is now the canonical dashboard entry point.

Next phase:
- Phase 10 — Remove Frontend Group Domain
