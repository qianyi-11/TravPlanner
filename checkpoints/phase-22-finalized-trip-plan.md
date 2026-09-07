Phase completed: Phase 22 — Finalized Trip Plan
Commit: pending
Objective completed: Final plan now reads the latest authoritative itinerary version from Firestore and displays only backend-supported day/item data.

Files added: None.
Files modified:
- app/trips/[tripId]/plan/page.tsx
- Plan.txt

Files moved/renamed: None.
Files deleted: None.

Important implementation decisions:
- The page uses useFinalItinerary, which follows the trip's finalized itineraryVersions collection.
- Mock budget totals, booking availability, price pressure, places, and map data are not shown because they are not part of the finalized itinerary contract.
- Non-finalized trips receive a clear link back to review instead of a fabricated plan.

Backend/contracts used:
- currentItineraryVersionId authority via trip phase, ItineraryVersionDocument, useFinalItinerary.

Validation performed:
- build: Not run for this phase.
- typecheck: Pending phase validation.
- lint: Pending phase validation.
- tests: Not run for this phase.

Known issues or blockers:
- External Firebase/App Check configuration is still required for live validation.

Important context for next phase:
- Fixed booking and critical-fact callable contracts exist, but the plan allows them to remain hidden unless a meaningful existing UI location is clear.

Next phase:
- Phase 23 — Fixed Booking and Critical Fact Integration
