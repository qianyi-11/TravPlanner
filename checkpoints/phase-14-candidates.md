Phase completed: Phase 14 — Candidate / Place Submission
Commit: pending
Objective completed: Replaced trip place screens with realtime candidates/submissions and a backend-validated candidate submission form.

Files added: None.
Files modified:
- app/trips/[tripId]/places/page.tsx
- app/trips/[tripId]/places/mine/page.tsx
- app/trips/[tripId]/places/all/page.tsx
- app/trips/[tripId]/places/[placeId]/page.tsx
- Plan.txt

Files moved/renamed: None.
Files deleted: None.

Important implementation decisions:
- Form sends `placeId`, preference, preferred period, duration, source, notes, trip ID, and expected planning cycle through `submitCandidate`.
- Candidate cards render provider-backed name, address, coordinates, and the current user's submission state only.
- Ratings, review counts, prices, availability, opening hours, and photos are intentionally absent.
- Legacy place routes now redirect to the canonical trip-scoped screen.

Backend/contracts used:
- `submitCandidateInputSchema`, candidate/submission documents, and collecting-phase callable guard.

Validation performed:
- build: Not run for this phase.
- typecheck: `npm.cmd run typecheck:frontend` passed.
- lint: `npm.cmd run lint -- --quiet` passed.
- tests: Not run for this phase.

Known issues or blockers:
- Place ID acquisition still depends on configured Google Places browser tooling; backend resolution remains authoritative.

Important context for next phase:
- Personal budgets are private per-member documents and must use `setActivityBudget`.

Next phase:
- Phase 15 — Personal Budget
