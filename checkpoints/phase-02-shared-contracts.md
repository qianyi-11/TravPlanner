Phase completed: Phase 2 — Shared Contract Integration
Commit: pending
Objective completed: Added the shared Zod/enums workspace and copied the backend contract implementation into the writable repository. Frontend package scripts now build the shared package and backend workspace.

Files added:
- shared/**
- functions/**
- firebase/**
- tests/**
- scripts/package-functions-shared.mjs

Files modified:
- package.json
- package-lock.json
- tsconfig.json
- .gitignore
- Plan.txt
- functions/src/budget/setActivityBudget.ts

Files moved/renamed: None.
Files deleted: None.

Important implementation decisions:
- Shared contracts and enums remain the backend authority; no frontend domain enum replacement was invented.
- Wrapped the budget testable handler in a Firebase-compatible callable callback so the functions workspace typechecks.

Backend/contracts used:
- @travel-planner/shared contracts, schemas, enums, and validation.

Validation performed:
- build: `npm.cmd run build:shared` passed.
- typecheck: `npm.cmd run typecheck --workspace @travel-planner/functions` passed.
- lint: Not applicable to this phase.
- tests: Not applicable to this phase.

Known issues or blockers:
- Frontend still uses the prototype Zustand/mock domain and is migrated in later phases.

Important context for next phase:
- Firebase callable region is the default `us-central1` because the backend exports no explicit region option.
- `.codegraph`, node_modules, build output, and generated vendor/build directories remain untracked or ignored.

Next phase:
- Phase 3 — Firebase Client Foundation
