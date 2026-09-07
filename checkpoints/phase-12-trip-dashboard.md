Phase completed: Phase 12 — Trip Dashboard
Commit: pending
Objective completed: Replaced the trip home page with realtime backend trip/member data and phase-aware next actions.

Files added: None.
Files modified:
- app/trips/[tripId]/page.tsx
- Plan.txt

Files moved/renamed: None.
Files deleted: None.

Important implementation decisions:
- Trip and member data come from Firestore hooks; current role is derived from the authenticated member document.
- Owner-only invite display is shown only when the owner has the creation token in the URL.
- Phase links are presentation only; callable backend guards remain authoritative.

Backend/contracts used:
- `TripDocument`, `TripMemberDocument`, and Firestore member/trip read rules.

Validation performed:
- build: Not run for this phase.
- typecheck: `npm.cmd run typecheck:frontend` passed.
- lint: `npm.cmd run lint -- --quiet` passed.
- tests: Not run for this phase.

Known issues or blockers:
- Membership mutations and invite reset are implemented in Phase 13.

Important context for next phase:
- Dashboard owner/member role is ready for role-aware membership controls.

Next phase:
- Phase 13 — Join and Membership Management
