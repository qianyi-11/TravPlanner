Phase completed: Phase 11 — Create Trip Integration
Commit: pending
Objective completed: Added canonical `/trips/new` form wired to the backend `createTrip` contract.

Files added:
- app/trips/new/page.tsx
- lib/trips/validation.ts
- lib/trips/mapping.ts

Files modified:
- Plan.txt

Files moved/renamed: None.
Files deleted: None.

Important implementation decisions:
- Form sends one destination Place ID, confirmed base coordinates, a validated maximum-seven-day date range, a valid day window, transport enum, empty day overrides, and MYR currency.
- Group size, multiple destinations, mixed transport, and generic preference fields are not sent.
- Invite token is preserved on the success URL for immediate sharing UI.
- Browser autocomplete is represented by the documented Place ID/coordinate interface; live Google Places browser setup remains externally configured and backend place resolution stays authoritative.

Backend/contracts used:
- `createTripInputSchema`, `createTripResultSchema`, `TRANSPORT_MODES`, and shared date/window validation.

Validation performed:
- build: Not run for this phase.
- typecheck: `npm.cmd run typecheck:frontend` passed.
- lint: `npm.cmd run lint -- --quiet` passed.
- tests: Not run for this phase.

Known issues or blockers:
- A Google Places browser key and actual autocomplete widget are still external configuration work; the form requires a real Place ID rather than fabricating one.

Important context for next phase:
- Trip creation redirects to `/trips/{tripId}?invite=...`; the trip dashboard should display this token for owners.

Next phase:
- Phase 12 — Trip Dashboard
