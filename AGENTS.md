# TravPlanner Agent Guide

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

TravPlanner is a Next.js 16 App Router application using React 19, strict TypeScript, Zustand, Auth.js, and Prisma. The `version1.1` branch is the competition implementation; prefer current code and tests over older design descriptions.

## Repository Map

- `app/`: pages and Route Handlers. API endpoints live under `app/api/`.
- `components/`: shared UI, navigation, auth, and trip components.
- `lib/`: shared/domain logic. Domain tests are colocated as `lib/*.test.ts`.
- `lib/server/`: server-only auth, authorization, validation, Prisma access, DB mappers, Google Places access, and workflow services.
- `prisma/`: PostgreSQL production schema/migrations, SQLite local/test schema, and deterministic seed data.
- `tests/integration/`: Route Handler integration tests against a disposable SQLite DB.
- `demo/`: deterministic Playwright browser demo.

Key sources of truth are `lib/types.ts` for app types, `lib/store.ts` for client state/actions, `lib/server/mappers.ts` for DB-to-app mapping, and `lib/server/trip-planning-service.ts` for shortlist/itinerary/Rescue workflow mutations.

## Architecture Rules

- Prisma is the persistence source of truth. `lib/store.ts` is a hydrated client snapshot loaded from `GET /api/bootstrap`.
- Persisted client actions should normally follow: UI/store action → API route → Prisma → `hydrate()`.
- Never import Prisma, `lib/server/*`, server secrets, or the generated Prisma client into Client Components.
- Route Handlers should reuse `lib/server/validation.ts`, `lib/server/auth.ts`, `lib/server/authorization.ts`, and `apiErrorResponse()` instead of duplicating request/auth/error logic.
- Authorize from the authenticated actor and group membership. Do not trust client-supplied member IDs or roles as authorization.
- Keep pure planning logic in `lib/`. Consensus, itinerary building/validation, and Rescue already have focused modules and tests; do not reimplement them in pages or Route Handlers.
- Preserve `Trip.itineraryRevision` optimistic-concurrency checks when changing itinerary or Rescue writes.
- Browser Google Places search is discovery only. Persisted Google place facts must be resolved server-side through `lib/server/google/places.ts`; the trip-place API intentionally rejects full place facts supplied by the client.

## Database, Auth, and Environment

Two Prisma schemas are intentional:

- `prisma/schema.sqlite.prisma`: local development, demo, and integration tests.
- `prisma/schema.prisma`: PostgreSQL production schema and migration source.

For shared model changes, keep both schemas aligned except for provider-specific differences. Production deployment uses committed migrations in `prisma/migrations/`. Both schemas generate to `lib/generated/prisma/`; that directory is ignored and must not be edited manually.

`prisma/seed.ts` deletes and recreates deterministic domain data from `lib/mock-data.ts`. Treat both local and production seed commands as destructive. Preserve stable fixture IDs unless the task intentionally changes demo data.

Auth.js provides the production session boundary. Google OAuth maps provider identities to TravPlanner `Member` records. Competition demo access is available only when `AUTH_DEMO_ENABLED=true` and uses one fixed seeded fictional `Member`; production configuration requires PostgreSQL and an explicit `AUTH_DEMO_MEMBER_ID` when demo mode is enabled.

Copy `.env.example` for environment names. Local demo use needs a SQLite `DATABASE_URL`, `AUTH_SECRET`, and `AUTH_DEMO_ENABLED=true`. Production validation also requires Google OAuth credentials plus separate browser and server Google Maps/Places keys. Do not commit `.env*` files other than `.env.example`.

## Commands

| Purpose | Command |
| --- | --- |
| Install exactly from lockfile | `npm ci` |
| Dev server | `npm run dev` |
| Full lint | `npm run lint` |
| Domain tests | `npm run test:domain` |
| Consensus/Rescue tests | `npm run test:consensus` |
| Integration tests | `npm run test:integration` |
| Next route/type generation | `npx next typegen` |
| Typecheck | `npx tsc --noEmit` |
| Production build | `npm run build` |
| Install demo browser | `npm run demo:browser-install` |
| Run headed deterministic demo | `npm run demo` |
| Generate local Prisma client | `npm run db:generate` |
| Push local SQLite schema | `npm run db:push` |
| Reset/seed local DB | `npm run db:seed` |
| Generate production Prisma client | `npm run db:generate:production` |
| Deploy production migrations | `npm run db:migrate:production` |

CI on `version1.1` runs, in order: `npm ci`, `npm run test:domain`, `npm run test:integration`, `npx next typegen`, `npx tsc --noEmit`, `npx eslint auth.ts lib/server app/api`, `npm run build`, and `git diff --check`.

There is no formatter script. Preserve the existing TypeScript style and use the configured `@/` import alias for cross-root imports.

## Change and Test Expectations

- Add or update colocated `lib/*.test.ts` tests when changing pure domain behavior.
- Run `npm run test:integration` for Route Handler, auth/authorization, persistence, or cross-layer workflow changes. Its runner creates and removes `prisma/integration.db`; do not prepare that DB manually.
- Run `npm run demo` when changing the main seeded browser flow. It uses an isolated `prisma/demo.db` and does not modify the normal development DB.
- For Prisma model changes, validate both schemas and regenerate the appropriate client. Do not replace production migrations with `db push`.
- Run full `npm run lint` for frontend/component changes; CI runs the same full repository lint.
- Avoid unrelated lockfile churn. Change `package-lock.json` only when dependencies change.
