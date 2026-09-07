Phase completed: Phase 15 — Personal Budget
Commit: pending
Objective completed: Added a private activity-budget repository/hook and wired the preferences route to `setActivityBudget`.

Files added:
- lib/repositories/budget.ts
- lib/hooks/use-activity-budget.ts

Files modified:
- lib/repositories/index.ts
- lib/hooks/index.ts
- app/trips/[tripId]/preferences/page.tsx
- Plan.txt

Files moved/renamed: None.
Files deleted: None.

Important implementation decisions:
- Budget reads target only the authenticated member's `activityBudgets/{uid}` document, matching security rules.
- Clear/reset uses the backend's explicit `clear: true` contract.
- Unsupported generic profile fields are not persisted.

Backend/contracts used:
- `setActivityBudgetInputSchema`, `ActivityBudgetRead`, and private activity budget rules.

Validation performed:
- build: Not run for this phase.
- typecheck: `npm.cmd run typecheck:frontend` passed.
- lint: `npm.cmd run lint -- --quiet` passed.
- tests: Not run for this phase.

Known issues or blockers:
- Budget mutation is App Check protected in the backend and needs configured Firebase/App Check for live validation.

Important context for next phase:
- Candidate voting must read trip phase and use WANT/NEUTRAL/AVOID callable actions.

Next phase:
- Phase 16 — Candidate Voting
