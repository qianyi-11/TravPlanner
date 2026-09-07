Phase completed: Phase 18 — Planning Generation
Commit: pending
Objective completed: Replaced fake generation with `generatePlanningCycle` and realtime itinerary-option reads.

Files added: None.
Files modified:
- app/trips/[tripId]/generating/page.tsx
- app/trips/[tripId]/route/page.tsx
- Plan.txt

Files moved/renamed: None.
Files deleted: None.

Important implementation decisions:
- Generation runs only from the current planning cycle and waits for Firestore options instead of simulating progress.
- Backend option contents and scores are displayed directly; no frontend itinerary is fabricated.
- Legacy route now redirects to the planning-generation route.

Backend/contracts used:
- `generatePlanningCycle`, `ItineraryOptionDocument`, and planning-cycle read paths.

Validation performed:
- build: Not run for this phase.
- typecheck: `npm.cmd run typecheck:frontend` passed.
- lint: `npm.cmd run lint -- --quiet` passed.
- tests: Not run for this phase.

Known issues or blockers:
- Option voting is added in Phase 20.

Important context for next phase:
- Existing option cards are the foundation for the comparison view and later voting controls.

Next phase:
- Phase 19 — Itinerary Option Comparison
