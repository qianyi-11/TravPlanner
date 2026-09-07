Phase completed: Phase 17 — Phase-Aware Navigation
Commit: pending
Objective completed: Added a shared phase-to-route/action helper and updated the trip dashboard to derive its primary route and label from backend `TripPhase`.

Files added:
- lib/navigation/trip-phase.ts

Files modified:
- app/trips/[tripId]/page.tsx
- Plan.txt

Files moved/renamed: None.
Files deleted: None.

Important implementation decisions:
- Canonical mapping is COLLECTING→places, VOTING→vote, PLANNING→generating, REVIEW→itinerary, FINALIZED→plan.
- Owner-only action availability is derived from role and phase for presentation; callable guards remain authoritative.
- Legacy frontend stage enums are not used by the new dashboard.

Backend/contracts used:
- Shared `TripPhase` enum and `TripDocument`.

Validation performed:
- build: Not run for this phase.
- typecheck: `npm.cmd run typecheck:frontend` passed.
- lint: `npm.cmd run lint -- --quiet` passed.
- tests: Not run for this phase.

Known issues or blockers:
- Legacy prototype ProgressStepper and route pages are cleaned up in later workflow phases.

Important context for next phase:
- PLANNING route should trigger `generatePlanningCycle` and listen for itinerary options.

Next phase:
- Phase 18 — Planning Generation
