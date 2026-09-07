Phase completed: Phase 4 — Authentication
Commit: pending
Objective completed: Added Firebase Google authentication context, session restoration, sign-out helpers, root provider wiring, and unauthenticated landing behavior.

Files added:
- lib/auth/auth-context.ts
- lib/auth/auth-provider.tsx
- lib/auth/use-auth.ts
- lib/auth/index.ts

Files modified:
- app/layout.tsx
- app/page.tsx
- components/nav/AppShell.tsx
- eslint.config.mjs
- functions/src/integrations/google/placeDetails.ts
- Plan.txt

Files moved/renamed: None.
Files deleted: None.

Important implementation decisions:
- Google popup auth is the only sign-in path; anonymous/fake identities are not added.
- Auth initialization errors are shown to the user without exposing stack traces.
- Generated JavaScript is ignored by ESLint; source TypeScript remains linted.

Backend/contracts used:
- Firebase Auth client API and backend `requireAuth` guards.

Validation performed:
- build: Not run for this phase.
- typecheck: `npm.cmd run typecheck:frontend` passed.
- lint: `npm.cmd run lint -- --quiet` passed.
- tests: Not run for this phase.

Known issues or blockers:
- Firebase configuration is external; the root shows the configuration error until `.env.local` is supplied.
- Existing trip/group pages still read prototype state and are migrated in later phases.

Important context for next phase:
- `useAuth()` is available under the root `AuthProvider`.

Next phase:
- Phase 5 — Typed Callable API Layer
