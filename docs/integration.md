# TravPlanner integration

## Architecture

```text
Next.js UI
  |
  +-- Firebase Auth
  +-- Firestore repositories (reads and realtime state)
  +-- Typed callable API (domain mutations)
          |
          v
    Firebase Cloud Functions
          |
          +-- shared Zod contracts
          +-- Firestore authoritative state
```

The browser does not write backend-owned trip documents directly. Firebase Auth identifies the user, repositories subscribe to Firestore projections, and callable functions validate and apply mutations. The shared package supplies the schemas used by the frontend and backend.

## Responsibilities

| Layer | Responsibility |
| --- | --- |
| Next.js | Authenticated screens, transient form state, loading/error presentation, and route navigation |
| Firebase Auth | Google sign-in and the current user identity |
| Firestore repositories | Read-only trip, member, candidate, vote, budget, option, approval, and itinerary state |
| Callable API | Typed wrappers for create/join, submissions, budgets, votes, planning, review, and finalization |
| Cloud Functions | Authorization, validation, phase transitions, provider calls, and transactional writes |
| Shared package | Zod contracts and shared domain types |

## Environment

Copy `.env.example` to `.env.local` and provide the Firebase web configuration:

```text
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_APP_ID
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
```

Optional values:

- `NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY` enables browser App Check.
- `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` enables the browser Places autocomplete integration.
- `NEXT_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN` is for local emulator debugging only and must not be committed.
- `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true` points Auth, Firestore, and Functions at the local emulators. The host variables in `.env.example` can be changed when needed.

Google Maps server calls use the Functions secret configured for the Firebase project. Keep that secret out of source control.

## Local development

```bash
npm run dev
npm run typecheck
npm run lint
npm run build
npm test
```

The repository uses `npm` scripts from the root workspace. The build covers the shared package, Next.js frontend, packaged shared Functions code, and Functions TypeScript build.

For Firestore-backed tests, use the Firebase CLI emulator command:

```bash
npm run test:security:emulator
npm run test:emulator
```

The frontend emulator hosts default to Auth `127.0.0.1:9099`, Firestore `127.0.0.1:8080`, and Functions `127.0.0.1:5001`. Firebase rules and indexes are configured in `firebase/firestore.rules` and `firebase/firestore.indexes.json`.

## Main trip workflow

1. Sign in with Google.
2. Create a trip or join with an invite code.
3. Add candidates and personal activity budgets during `COLLECTING`.
4. Vote on candidates during `VOTING`.
5. Generate and vote on itinerary options during `PLANNING`.
6. Review the selected itinerary during `REVIEW`.
7. Approve and finalize the trip; the final itinerary remains available after refresh in `FINALIZED`.

Trip phase and permissions are backend-controlled. The UI disables or redirects actions that are not valid for the current phase or member role.

## Canonical routes

| Route | Purpose |
| --- | --- |
| `/my-trips` | Firestore-backed trip list |
| `/trips/new` | Create a trip through the callable API |
| `/join` | Join a trip with an invite code |
| `/trips/[tripId]` | Trip dashboard and phase summary |
| `/trips/[tripId]/places` | Candidate collection and submissions |
| `/trips/[tripId]/vote` | Candidate voting |
| `/trips/[tripId]/generating` | Planning generation, option comparison, and option voting |
| `/trips/[tripId]/itinerary` | Review and approval |
| `/trips/[tripId]/plan` | Finalized itinerary |

Older route shims remain only where they redirect users to the canonical flow; they do not create a second domain model.

## Deployment notes

- Deploy Firestore rules and indexes with the Firebase CLI.
- Build the root workspace before deploying Functions.
- Callable functions use the `us-central1` client region and enforce App Check on domain mutations.
- Configure Google OAuth authorized domains and the Firebase App Check site key in the deployed environment.
- Configure the Functions Google Maps secret separately from browser environment variables.
- Verify Firestore indexes and provider quotas in the target Firebase project.
- Live Google sign-in, deployed App Check, provider credentials, and two-user browser testing require project-specific configuration and are not replaced by emulator tests.
