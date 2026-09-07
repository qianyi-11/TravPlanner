Phase completed: Phase 10 — Remove Frontend Group Domain
Commit: pending
Objective completed: Removed group navigation from the canonical path and added redirects from legacy group URLs to trip workflows.

Files added:
- app/join/page.tsx

Files modified:
- app/groups/page.tsx
- app/groups/new/page.tsx
- app/groups/[groupId]/page.tsx
- app/groups/[groupId]/new-trip/page.tsx
- Plan.txt

Files moved/renamed: None.
Files deleted: None.

Important implementation decisions:
- Legacy `/groups` URLs redirect to `/my-trips` or `/trips/new`.
- No frontend group collection or group mutation was introduced.
- `/join` is now a canonical route placeholder until invite-token handling in Phase 13.

Backend/contracts used:
- Backend Trip -> Members architecture.

Validation performed:
- build: Not run for this phase.
- typecheck: `npm.cmd run typecheck:frontend` passed.
- lint: `npm.cmd run lint -- --quiet` passed.
- tests: Not run for this phase.

Known issues or blockers:
- The actual trip form is implemented in the next phase.

Important context for next phase:
- Use `/trips/new` as the only create-trip UI entry point.

Next phase:
- Phase 11 — Create Trip Integration
