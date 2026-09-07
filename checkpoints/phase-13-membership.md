Phase completed: Phase 13 — Join and Membership Management
Commit: pending
Objective completed: Wired invite join and role-aware membership mutations through callable functions.

Files added: None.
Files modified:
- app/join/page.tsx
- app/trips/[tripId]/page.tsx
- Plan.txt

Files moved/renamed: None.
Files deleted: None.

Important implementation decisions:
- Join accepts the trip ID and invite token and redirects to the returned trip.
- Owner controls call reset invite, remove member, and transfer ownership; members can leave; expected planning cycle is supplied where required.
- Browser code never writes member, owner, or membership documents directly.
- Mutations disable while pending and refresh through Firestore listeners.

Backend/contracts used:
- `joinTrip`, `resetInvite`, `removeMember`, `leaveTrip`, and `transferOwnership` shared contracts and callable functions.

Validation performed:
- build: Not run for this phase.
- typecheck: `npm.cmd run typecheck:frontend` passed.
- lint: `npm.cmd run lint -- --quiet` passed.
- tests: Not run for this phase.

Known issues or blockers:
- Domain-specific Firebase error messages are normalized in Phase 27.

Important context for next phase:
- Candidate pages should use `/trips/{tripId}/places` and submit real provider Place IDs.

Next phase:
- Phase 14 — Candidate / Place Submission
