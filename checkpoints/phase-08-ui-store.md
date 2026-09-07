Phase completed: Phase 8 — Reduce Zustand to UI State
Commit: pending
Objective completed: Added a dedicated UI-only Zustand store and moved toast state off the prototype domain store.

Files added:
- lib/ui-store.ts

Files modified:
- components/ui/Toast.tsx
- Plan.txt

Files moved/renamed: None.
Files deleted: None.

Important implementation decisions:
- UI store owns only transient toast presentation state.
- The old domain store remains as a temporary compatibility layer while route migrations remove its consumers; it is not used by new Firebase code.

Backend/contracts used:
- None; this phase changes only frontend state ownership.

Validation performed:
- build: Not run for this phase.
- typecheck: `npm.cmd run typecheck:frontend` passed.
- lint: `npm.cmd run lint -- --quiet` passed.
- tests: Not run for this phase.

Known issues or blockers:
- Legacy pages still import `lib/store.ts`; Phase 9 onward removes those consumers before deleting the file.

Important context for next phase:
- `useUiStore` is the only store new UI code should import.

Next phase:
- Phase 9 — My Trips
