Phase completed: Phase 21 — Review Workflow
Commit: pending
Objective completed: Replaced mock review/plan rendering with Firestore review drafts, approvals, final itinerary data, approval actions, owner-only minor duration edits, and backend-authoritative finalization.

Files added:
- lib/repositories/approvals.ts
- lib/hooks/use-approvals.ts

Files modified:
- lib/hooks/index.ts
- app/trips/[tripId]/itinerary/page.tsx
- app/trips/[tripId]/plan/page.tsx
- Plan.txt

Files moved/renamed: None.
Files deleted: None.

Important implementation decisions:
- Approval documents are readable to active members; individual approval responses remain private and are written only through submitApproval.
- Minor edits are limited to owner-only duration changes because the backend requires owner, REVIEW phase, current revision, and full revalidation.
- The legacy plan page redirects to the canonical itinerary page until finalized-plan rendering is completed in Phase 22.

Backend/contracts used:
- useReview, useFinalItinerary, ApprovalDocument, applyMinorEdit, submitApproval, finalizeTrip.

Validation performed:
- build: Not run for this phase.
- typecheck: npm.cmd run typecheck:frontend passed.
- lint: npm.cmd run lint -- --quiet passed.
- tests: Not run for this phase.

Known issues or blockers:
- External Firebase/App Check configuration is still required for live callable and realtime validation.

Important context for next phase:
- The final plan page should render the current itinerary version directly and remove the temporary redirect.

Next phase:
- Phase 22 — Finalized Trip Plan
