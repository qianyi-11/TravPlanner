# Deployment

TravPlanner deploys the Next.js frontend to Vercel and keeps Firebase Auth, Firestore, and Cloud Functions as the backend. The browser reads Firestore through the Firebase SDK and calls domain mutations through callable Functions; there is no Next.js API proxy.

## Prerequisites

- Node.js 22 for Functions and a current npm version.
- Firebase CLI: `firebase login`.
- A Firebase project on the Blaze plan for Cloud Functions and secret-backed provider calls.
- Google Cloud APIs required by the backend and browser Places integration enabled only for the keys that use them.

## Build locally

```text
npm install
npm run typecheck
npm run lint
npm run build:web
npm run build:functions
npm test
```

`build:web` builds the shared package and frontend only. Functions are built and deployed separately.

## Firebase project setup

Bind the Firebase CLI to the intended project; do not commit a developer-specific `.firebaserc` unless that is deliberate:

```text
firebase login
firebase use --add
```

Deploy Firestore rules and indexes before backend functions:

```text
firebase deploy --only firestore
```

The frontend client and Functions client use the `us-central1` Functions region. Deploy Functions with:

```text
firebase deploy --only functions
```

The Functions predeploy hook builds the Functions workspace. The callable exports are defined in `functions/src/index.ts`.

## Google provider configuration

Set the server-only secret in the Firebase project:

```text
firebase functions:secrets:set GOOGLE_MAPS_API_KEY
```

`GOOGLE_MAPS_API_KEY` is used by Functions for provider validation and Routes/Places calls. Never put it in Vercel variables or any `NEXT_PUBLIC_*` variable.

Create a separate browser key for `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`. Restrict it by HTTP referrer to the Vercel preview/production domains and by API to the browser Maps/Places APIs required by the frontend. Enable Places API (New) for the autocomplete widget.

## Firebase Authentication and App Check

In Firebase Console:

1. Enable Google under Authentication → Sign-in method.
2. Add the deployed Vercel and custom domains to Authentication authorized domains.
3. Register the web app with App Check using the current reCAPTCHA v3 provider.
4. Set the production site key as `NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY`.
5. Observe legitimate traffic before tightening enforcement.

`NEXT_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN` is for emulator development only and must not be configured in Vercel production or preview environments.

## Vercel setup

Create a Vercel project for the repository with:

| Setting | Value |
| --- | --- |
| Framework | Next.js |
| Root directory | `.` |
| Install command | `npm install` |
| Build command | `npm run build:web` |

Configure the following frontend variables for the relevant Vercel environment:

| Variable | Scope |
| --- | --- |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Browser Firebase config |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Browser Firebase config |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Browser Firebase config |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Browser Firebase config |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Browser Firebase config |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Browser Firebase config |
| `NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY` | Production App Check site key |
| `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` | Restricted browser Maps/Places key |
| `NEXT_PUBLIC_USE_FIREBASE_EMULATORS` | `false` in production |

Do not add `GOOGLE_MAPS_API_KEY` to this table. It belongs in Firebase Functions Secrets.

After the first deployment, add the Vercel domain to Firebase Auth authorized domains and to the browser Maps key HTTP referrer restrictions. Verify preview and production environment scopes separately.

## Production validation

Before calling production ready, verify:

- Google sign-in and session restoration.
- Create Trip and candidate submission with Places Autocomplete.
- Firestore reads and callable mutations for two users.
- App Check-backed callable requests.
- Owner/member permissions, private budgets, and private votes.
- The finalized itinerary after a browser refresh.

Record external validation separately from local build/test results. A successful local build does not prove that provider keys, App Check, OAuth domains, billing, or deployed Functions are configured.

## Rollback considerations

- Vercel can roll back the frontend to a prior deployment without changing Firestore data.
- Review Firebase Functions and Firestore changes before rollback; backend phase transitions and persisted documents are authoritative.
- Keep the previous working frontend deployment available until the deployed two-user workflow is verified.
- If a provider key is exposed or misconfigured, revoke/restrict that key and rotate the Functions secret immediately.
