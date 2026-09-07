Phase completed: Phase 39 — Restore Original Frontend UX
Commit: 1fd231e
Objective completed: Restored the original trip-oriented visual hierarchy with Firebase-backed records and backend-controlled phase navigation.

Files added:
- components/trip/ActivityCard.tsx
- components/trip/BudgetCard.tsx
- components/trip/MapView.tsx
- components/trip/PlaceCard.tsx
- components/trip/ProgressStepper.tsx
- components/trip/TripCard.tsx
- components/trip/TripHeader.tsx

Files modified:
- app/my-trips/page.tsx
- app/trips/[tripId]/page.tsx
- app/trips/[tripId]/places/page.tsx
- app/trips/[tripId]/plan/page.tsx
- Plan.txt

Files moved/renamed: None.
Files deleted: None.

Frontend files compared with `frontend` branch:
- app/my-trips/page.tsx
- app/trips/[tripId]/page.tsx
- app/trips/[tripId]/places/page.tsx
- app/trips/[tripId]/plan/page.tsx
- components/trip/ActivityCard.tsx
- components/trip/BudgetCard.tsx
- components/trip/MapView.tsx
- components/trip/PlaceCard.tsx
- components/trip/ProgressStepper.tsx
- components/trip/TripCard.tsx
- components/trip/TripHeader.tsx

Important UI-preservation decisions:
- Restored TripCard, TripHeader, ProgressStepper, PlaceCard, ActivityCard, BudgetCard, and MapView shells using the existing theme and responsive card layouts.
- Removed frontend-only ratings, reviews, photos, bookings, pressure, and availability instead of fabricating backend data.
- MapView shows real itinerary coordinates and a graceful key-unavailable state; it does not draw fake route geometry.
- My Trips does not invent member counts or phases because the membership projection does not provide them; the live dashboard renders those values from Firestore.

Important implementation decisions:
- Existing Firebase hooks and callable flows remain authoritative.
- Final Plan now exposes Itinerary, Map, Budget, and Places tabs using finalized Firestore data.
- Phase navigation maps directly from the backend TripPhase enum and cannot mutate phase in the UI.

Backend/contracts used:
- TripMembershipProjection, TripDocument, CandidateDocument, SubmissionDocument, ActivityBudgetRead, ItineraryDay, ItineraryItem, and finalized itinerary repositories/hooks.

Validation performed:
- build: Passed `npm.cmd run build:frontend`.
- typecheck: Passed `npm.cmd run typecheck:frontend`.
- lint: Passed `npm.cmd run lint`; only existing repository warnings remain.
- tests: Passed `npm.cmd test`: 205 passed, 140 skipped.
- emulator/security checks: Not run for this UI-only phase; repository test gating skips emulator suites.

Known issues or blockers:
- Phase 40 must replace the remaining manual Place ID inputs with Places Autocomplete.
- README.md contains unrelated pre-existing working-tree changes and was not included in the phase commit.

External configuration still required:
- Browser Maps key for the interactive provider map and Places Autocomplete.

Important context for next phase:
- Current create-trip and candidate forms still accept manual Place ID/coordinates and must be adapted to the new PlaceAutocomplete component.

Next phase:
- Phase 40 — Google Places Autocomplete
