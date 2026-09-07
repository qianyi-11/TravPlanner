Phase completed: Phase 25 — Remove Mock Domain Data Completely
Commit: pending
Objective completed: Home and profile now use Firebase Auth and Firestore membership projections; legacy mock domain state and unused mock UI components were removed.

Files added: None.
Files modified:
- app/page.tsx
- app/profile/page.tsx
- lib/utils.ts
- Plan.txt

Files moved/renamed: None.
Files deleted:
- lib/store.ts
- lib/mock-data.ts
- lib/types.ts
- unused legacy trip display components under components/trip
- components/ui/Avatar.tsx

Important implementation decisions:
- Home/profile render TripMembershipProjection fields directly and do not recreate a second domain model.
- The remaining Zustand store is only ui-store.ts for transient toast state.
- Legacy visual components were deleted because CodeGraph found no remaining callers after route migration.

Backend/contracts used:
- Firebase Auth user and useMyTrips/TripMembershipProjection.

Validation performed:
- build: Not run for this phase.
- typecheck: Pending phase validation.
- lint: Pending phase validation.
- tests: Not run for this phase.

Known issues or blockers:
- No mock domain imports should remain; the next phase audits unsupported prototype features and dead routes.

Important context for next phase:
- Search for prototype-only pages, labels, rescue flows, and unsupported features before deleting more code.

Next phase:
- Phase 26 — Unsupported Feature Cleanup
