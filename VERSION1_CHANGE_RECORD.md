# Version1 Change Record

Date: 2026-09-09

Baseline: checked-out `version1` branch, compared with `git diff version1`.

## Scope

Implemented the deterministic judging path described in `PLAN.md` without adding dependencies, Prisma schema changes, new ranking logic, Rescue optimization, itinerary mutation, or external APIs.

## Changes from original `version1`

### Seed reset

`prisma/seed.ts`

- Replaced the populated-database skip guard with an ordered transactional reset.
- Deletes dependent votes, suggestions, trip places, Rescue events, trips, memberships, groups, places, and members before reseeding.
- Keeps the existing `trip-japan` dataset and all other seed data unchanged.
- Persists the seeded Rescue event timestamp from `lib/mock-data.ts`.

### Voting and shortlist persistence

`lib/store.ts`

- `toggleVote`, `submitMyVotes`, `confirmShortlist`, and `resolveRescue` now return `true` on success and `false` on API failure.
- Existing toast/error handling remains the failure path.

`app/trips/[tripId]/vote/page.tsx`

- Awaits vote mutations and submission.
- Disables competing vote actions while a request is saving.
- Navigates to results only after vote submission succeeds.

`app/trips/[tripId]/vote/results/page.tsx`

- Awaits shortlist confirmation and prevents duplicate clicks.
- Navigates only after shortlist persistence succeeds.
- Corrected the displayed button text from literal `Confirm &amp; Continue` to `Confirm & Continue`.

`app/api/trips/[tripId]/shortlist/route.ts`

- Persists the selected place IDs.
- Prevents confirmation from moving trips backward: stages after `validation` remain unchanged.

`app/trips/[tripId]/shortlist/page.tsx`

- Shows `View Final Plan` and links to `/plan` when the trip is already at `itinerary`.
- Keeps `Continue to Validation` for earlier stages.

### Final Plan and Rescue

`app/trips/[tripId]/plan/page.tsx`

- Adds one visible `Open Trip Rescue` link when the trip has a Rescue event.
- Preserves the existing itinerary, map, offline map fallback, budget, and places views.

`app/api/trips/[tripId]/rescue/[eventId]/resolve/route.ts`

- Verifies that the Rescue event belongs to the route trip before resolving it.

`app/trips/[tripId]/live/page.tsx`

- Awaits Rescue acceptance before showing success.
- Disables the Accept button while saving.
- Derives the resolved state from persisted event status so it survives refresh.
- Removes the dead `View Alternatives` button.

## Validation

- Disposable SQLite reset: `db:push` succeeded; seed ran repeatedly and restored altered stage, shortlist, itinerary, Rescue status, and user-created data.
- Seed acceptance counts: 3 groups, 9 members, 27 places, 3 trips, 27 trip-place links, 33 suggestions, 81 votes, and exactly 1 open Rescue event.
- Focused ESLint: passed with zero errors for all changed demo files.
- `npx tsc --noEmit`: passed.
- Browser smoke test: vote change persisted after refresh; vote submission and shortlist confirmation navigated after persistence; shortlist retained 15 places; Final Plan itinerary/map/budget/places rendered; offline map displayed; Rescue acceptance showed saving state and remained resolved after refresh.
- `npm run build`: passed. Only the existing generated-Prisma/Turbopack tracing warnings appeared.

## Excluded pre-existing worktree changes

- `prisma/prisma/dev.db` was already modified before this implementation and was not used as the test database.
- Untracked `.codegraph/` and `PLAN.md` were already present and were preserved.
