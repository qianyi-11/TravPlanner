Phase completed: Phase 24 — Route Normalization
Commit: pending
Objective completed: Legacy trip routes now redirect to canonical trip-scoped workflow routes, and primary navigation/home CTAs no longer point at the groups domain.

Files added: None.
Files modified:
- app/trips/[tripId]/live/page.tsx
- app/trips/[tripId]/shortlist/page.tsx
- app/trips/[tripId]/validate/page.tsx
- components/nav/AppShell.tsx
- app/page.tsx
- Plan.txt

Files moved/renamed: None.
Files deleted: None.

Important implementation decisions:
- live redirects to plan, shortlist and validate redirect to places, and existing group/vote/place redirects remain as compatibility routes.
- Navigation now exposes My Trips instead of the deprecated Groups label.

Backend/contracts used:
- None beyond the canonical trip-scoped routes already connected to Firestore.

Validation performed:
- build: Not run for this phase.
- typecheck: Pending phase validation.
- lint: Pending phase validation.
- tests: Not run for this phase.

Known issues or blockers:
- The home page still contains legacy mock trip cards; Phase 25 removes that remaining mock domain state.

Important context for next phase:
- Remove remaining imports and files for lib/store and lib/mock-data after migrating home/profile and unused mock components.

Next phase:
- Phase 25 — Remove Mock Domain Data Completely
