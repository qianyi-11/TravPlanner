# TravPlanner Agent Guide

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project Purpose

TravPlanner is a collaborative travel-planning prototype.

```text
Preferences → Suggestions → Voting → Group Consensus
→ Shortlist → Validation → Route → Itinerary
→ Final Plan → Trip Rescue
```

Prioritize deterministic demo behavior, explainability, refresh-safe persistence, and small changes.

Current code on the checked branch is the source of truth. Documentation and UI copy may describe capabilities more strongly than the implementation does.

## Architecture

```text
Client pages/components
        ↓
Zustand — lib/store.ts
        ↓
Route Handlers — app/api/
        ↓
validation + domain authorization
        ↓
focused server service — lib/server/
        ↓
Prisma — lib/server/prisma.ts
        ↓
SQLite
```

Initial hydration:

```text
AppShell
→ store.hydrate()
→ GET /api/bootstrap
→ Prisma
→ lib/server/mappers.ts
→ Zustand
```

Normal persisted mutation:

```text
UI
→ store action
→ API route
→ Prisma
→ hydrate()
```

Google Maps and Places run in the browser through:

```text
lib/google-maps-loader.ts
lib/google-places-client.ts
```

## Technology

| Concern | Stack |
| --- | --- |
| Framework | Next.js 16.3.4 |
| React | 19.2.8 |
| TypeScript | strict |
| State | Zustand 5 |
| ORM | Prisma 5.22 |
| Database | SQLite |
| Styling | Tailwind CSS 4 |
| Maps/Places | Google Maps JavaScript API |
| Tests | `node:test` via `tsx` |
| Package manager | npm |

For unfamiliar Next.js behavior, inspect `node_modules/next/dist/docs/`.

## Sources of Truth

| Concern | Canonical location |
| --- | --- |
| Domain types | `lib/types.ts` |
| Database schema | `prisma/schema.prisma` |
| DB → app mapping | `lib/server/mappers.ts` |
| Client state/actions | `lib/store.ts` |
| Consensus | `lib/group-consensus.ts` |
| Rescue mutation | `lib/rescue.ts` |
| Demo fixtures | `lib/mock-data.ts` |
| Seed behavior | `prisma/seed.ts` |
| Google Places mapping | `lib/google-places-client.ts` |
| Map rendering | `components/trip/MapView.tsx` |
| Itinerary travel display | `components/trip/ItineraryTimeline.tsx` |

When behavior crosses layers, fix the canonical source rather than patching only the UI.

## Data and State Rules

### Preferences

Preferences are persisted in:

```text
Member.preferencesJson
```

They are global per Member, not per trip.

### Suggestions and voting

Votes are persisted by `tripPlaceId + memberId`.

Keep voter identities available; consensus uses `votedBy`, not only a vote count.

Some current member submission flags and mapped place activity are global rather than fully trip-scoped. Do not assume otherwise.

### Shortlist

`buildConsensus()` derives ranking and explanations.

Only selected IDs are persisted in:

```text
Trip.shortlistJson
```

Scores, Group Match, fairness bonuses, and explanations are derived values.

### Itinerary

Canonical itinerary state is:

```text
Trip.itineraryJson
```

The complete Japan itinerary comes from seed data. A deterministic server builder also creates an itinerary from a confirmed shortlist; there is no general automatic planning engine.

### Zustand

`lib/store.ts` is a hydrated client snapshot, not the persistence source of truth.

Persisted changes should normally:

```text
API mutation → DB → hydrate()
```

Await writes before success navigation when navigation depends on persistence.

## Server / Client Boundary

Keep server-side:

- Prisma;
- `DATABASE_URL`;
- DB access;
- `lib/server/*`.

Keep browser-side where currently designed:

- Zustand;
- interactive pages;
- Google Maps loader;
- Google Places integration;
- map rendering.

Never import Prisma into Client Components.

The demo-user cookie selects a demo member; it is not production authentication or authorization.

## Prisma and Seed Data

Current schema workflow uses `prisma db push`; there is no committed migrations directory.

Useful commands:

```bash
npx prisma validate
npm run db:generate
npm run db:push
npm run db:seed
```

`npm run db:seed` is destructive. It deletes existing domain data before recreating deterministic fixtures.

`lib/generated/` is generated and ignored. Do not edit it manually.

The main seeded flows are:

```text
trip-japan → itinerary stage + open Rescue event
trip-kl    → voting stage
trip-bali  → ideas stage
```

The Japan fixture is the primary end-to-end demo. Preserve stable IDs and relationships unless the task explicitly requires fixture changes.

## Group Consensus

Canonical implementation:

```text
lib/group-consensus.ts
```

Important invariants:

- deterministic regardless of input ordering;
- stable IDs break final ties;
- votes and preference matches increase score;
- dislikes reduce score;
- exact must-dos are protected;
- must-dos may expand shortlist capacity;
- fairness uses a bounded `+3` representation bonus;
- Rescue reuses the same evaluator.

Base score:

```text
2 × votes + preference matches - 2 × conflicts
```

Do not duplicate consensus logic in React.

Domain tests:

```bash
npm run test:consensus
```

Integration tests call the actual Route Handler functions against a disposable `prisma/integration.db`:

```bash
npm run test:domain
npm run test:integration
```

## Places and Google Data

Live place flow:

```text
Google textSearch
→ Place mapping
→ Google getDetails
→ /api/trips/[tripId]/places
→ Prisma
→ bootstrap
```

When adding a Place field, trace the full path:

```text
Google response
→ lib/google-places-client.ts
→ lib/types.ts
→ Prisma
→ import API
→ lib/server/mappers.ts
→ UI
```

Important prototype limitations:

- Google `price_level` is relative venue pricing, not admission price;
- imported duration defaults to 60 minutes;
- Google-imported place availability is saved as `"unknown"`; no live availability check is performed.
- missing geometry may become `0,0`.

Do not present defaults as verified live facts.

## Maps and Routing

`components/trip/MapView.tsx` supports:

- Google Maps when available;
- offline SVG fallback.

Current route visualization is not route optimization.

The map draws a polyline through supplied coordinates. It does not call Directions or Routes APIs.

`ItineraryTimeline` displays persisted `travelFromPrevMinutes`; it does not calculate travel times.

Preserve the offline fallback unless the task explicitly replaces it.

## Trip Rescue

Important files:

```text
lib/rescue.ts
lib/rescue.test.ts
lib/group-consensus.ts
app/trips/[tripId]/live/page.tsx
app/api/trips/[tripId]/rescue/[eventId]/resolve/route.ts
```

Accepting a Rescue:

```text
verify event
→ load persisted itinerary
→ applyRescueReplacement()
→ update itinerary
→ mark event resolved
→ Prisma transaction
→ hydrate()
```

`applyRescueReplacement()` changes:

```text
placeId
label
estimatedCost
```

while preserving schedule metadata such as time, duration, travel minutes, and lock state.

The live-page search/revalidation phases are simulated. Alternatives are already stored in the Rescue event.

## Prototype Boundaries

Do not assume the project currently has:

- production authentication;
- real-time collaboration;
- live availability validation;
- route optimization;
- Directions API travel-time calculation;
- automatic itinerary generation beyond the confirmed-shortlist builder;
- automatic disruption detection;
- live Rescue alternative search.

Split Bill is browser-local prototype state using `localStorage`, not shared Prisma state.

## Environment Variables

| Variable | Scope |
| --- | --- |
| `DATABASE_URL` | server-only |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | browser-visible |

There is no `.env.example`.

Missing Maps credentials should not break the seeded/offline demo.

## Coding Conventions

- Use `@/` imports.
- Keep domain types in `lib/types.ts`.
- Keep pure domain logic in `lib/`.
- Keep Prisma helpers/mappers in `lib/server/`.
- Reuse existing UI primitives and design tokens.
- Follow existing JSON API patterns.
- Use npm.
- Avoid broad refactors and formatting-only churn.
- Change `package-lock.json` only when dependencies change.

## Validation Commands

| Purpose | Command |
| --- | --- |
| Dev | `npm run dev` |
| Domain tests | `npm run test:consensus` |
| Typecheck | `npx tsc --noEmit` |
| Lint | `npm run lint` |
| Build | `npm run build` |
| Prisma validate | `npx prisma validate` |
| Prisma generate | `npm run db:generate` |

The deterministic browser demo uses Playwright via `npm run demo`.

## Agent Checklist

Use this checklist for every change instead of repeating rules throughout the guide.

### Before editing

- [ ] Run `git status --short --branch`.
- [ ] Inspect the canonical files for the affected behavior.
- [ ] Check relevant Next.js local docs when framework behavior is uncertain.
- [ ] Identify whether affected data is persisted, derived, seeded, client-local, or externally fetched.
- [ ] Preserve unrelated user changes and untracked work.

### While editing

- [ ] Make the smallest change that solves the task.
- [ ] Follow the existing client → store → API → Prisma → hydrate architecture.
- [ ] Keep Prisma and secrets server-side.
- [ ] Do not duplicate domain logic in UI components.
- [ ] Do not persist values that are intentionally derived unless requirements changed.
- [ ] Preserve deterministic IDs and demo behavior unless explicitly changing fixtures.
- [ ] Do not treat prototype defaults or simulated UI states as live verified data.
- [ ] Do not introduce unrelated refactors, dependencies, branding changes, or architecture.
- [ ] Never hand-edit generated Prisma output.
- [ ] Never commit secrets or `.env` files.
- [ ] Use destructive DB/seed commands only against a known disposable database.

### Before completion

- [ ] Run the relevant targeted tests.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build` when applicable.
- [ ] Run Prisma validation/generation if the schema changed.
- [ ] Verify persistence survives refresh when persistence changed.
- [ ] Recheck the affected seeded demo flow when fixtures, consensus, itinerary, maps, or Rescue changed.
- [ ] For Rescue, verify acceptance updates both itinerary and event status after refresh.
- [ ] For Maps/Places, verify both normal and missing-key/fallback behavior when affected.
- [ ] Run `git status --short` and inspect `git diff`.
- [ ] Confirm no unrelated changes, generated files, DB binaries, secrets, or accidental lockfile churn remain.
