Phase completed: Phase 20 — Option Voting and Winning Option
Commit: pending
Objective completed: Added private member option voting and owner winner selection/tie-break controls to the planning-options screen.

Files added:
- lib/hooks/use-own-option-vote.ts

Files modified:
- lib/hooks/index.ts
- app/trips/[tripId]/generating/page.tsx
- Plan.txt

Files moved/renamed: None.
Files deleted: None.

Important implementation decisions:
- Option voting uses `castOptionVote` with only the option ID; it does not reuse candidate WANT/NEUTRAL/AVOID semantics.
- Owner selection uses backend plurality resolution for groups, explicit selection for solo trips, and a backend-validated tie-break action.
- Private option vote state is read only from the current user's document.

Backend/contracts used:
- `castOptionVote`, `selectWinningOption`, `OptionVoteDocument`, and planning-cycle contracts.

Validation performed:
- build: Not run for this phase.
- typecheck: `npm.cmd run typecheck:frontend` passed.
- lint: `npm.cmd run lint -- --quiet` passed.
- tests: Not run for this phase.

Known issues or blockers:
- Review approval UI is implemented in Phase 21.

Important context for next phase:
- Selecting a winner creates a review draft and may create an approval document for group trips.

Next phase:
- Phase 21 — Review Workflow
