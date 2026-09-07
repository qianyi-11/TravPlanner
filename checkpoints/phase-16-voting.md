Phase completed: Phase 16 — Candidate Voting
Commit: pending
Objective completed: Replaced local multi-select voting with phase-aware candidate vote callables and private per-user vote reads.

Files added:
- lib/hooks/use-own-candidate-vote.ts

Files modified:
- lib/hooks/index.ts
- app/trips/[tripId]/vote/page.tsx
- app/trips/[tripId]/vote/results/page.tsx
- Plan.txt

Files moved/renamed: None.
Files deleted: None.

Important implementation decisions:
- Candidate votes use only WANT, NEUTRAL, and AVOID from shared enums.
- Start and close actions are owner-only presentation controls; backend phase/owner guards remain authoritative.
- Private vote reads use deterministic per-user document IDs, never a prohibited list query.
- The UI never writes `trip.phase` or applies a frontend vote-count cap.

Backend/contracts used:
- `startVoting`, `castCandidateVote`, `closeVoting`, `CandidateVoteValue`, and candidate vote security rules.

Validation performed:
- build: Not run for this phase.
- typecheck: `npm.cmd run typecheck:frontend` passed.
- lint: `npm.cmd run lint -- --quiet` passed.
- tests: Not run for this phase.

Known issues or blockers:
- Backend vote aggregation/results are exposed through authoritative candidate state; a richer results view is deferred until planning workflow integration.

Important context for next phase:
- All primary trip actions should derive their route from `trip.phase`.

Next phase:
- Phase 17 — Phase-Aware Navigation
