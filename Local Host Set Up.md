For a **local-host prototype**, the goal is simpler:

> Run the Next.js frontend locally, and choose whether the backend also runs locally through Firebase emulators or uses the real Firebase project.

The competition allows demonstration on an actual device, emulator, or hosted environment, as long as the solution is deployable and not fundamentally tied only to one local machine. 

I recommend keeping **two local modes**:

- **Mode A — Fully local with Firebase emulators**: best for development and safe testing.
- **Mode B — Local frontend + real Firebase backend**: best final rehearsal before deployment.

# Option A — Fully local with Firebase Emulators

This is the best default during development.

## 1. Checkout the correct branch

```bash
git checkout codex/combine
```

Confirm:

```bash
git branch --show-current
```

Expected:

```text
codex/combine
```

---

# 2. Install dependencies

From:

```text
C:\Users\ziyu.cha-c\Documents\GitHub\TravPlanner
```

run:

```bash
npm install
```

Then verify the project builds:

```bash
npm run typecheck
npm run lint
npm run build
```

---

# 3. Install Firebase CLI

If not already installed:

```bash
npm install -g firebase-tools
```

Check:

```bash
firebase --version
```

Your repository already includes Firebase CLI as a dev dependency too, so you can alternatively use:

```bash
npx firebase --version
```

---

# 4. Create `.env.local`

Copy:

```text
.env.example
```

to:

```text
.env.local
```

On Windows CMD:

```bat
copy .env.example .env.local
```

PowerShell:

```powershell
Copy-Item .env.example .env.local
```

---

# 5. Configure emulator mode

For fully local development, use:

```env
NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true

NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
NEXT_PUBLIC_FIREBASE_FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
NEXT_PUBLIC_FIREBASE_FUNCTIONS_EMULATOR_HOST=127.0.0.1:5001
```

You still need Firebase web config values because the Firebase SDK expects an initialized app:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=demo-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=localhost
NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-travplanner
NEXT_PUBLIC_FIREBASE_APP_ID=demo-app-id
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
```

For emulator development, these can be non-production values if your current Firebase bootstrap accepts them.

Use:

```env
NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY=
```

unless your emulator/debug workflow specifically requires App Check.

---

# 6. App Check locally

Your current code only applies the debug token when:

```text
NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true
```

and a debug token exists.

For normal emulator development, the simplest configuration is usually:

```env
NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY=
NEXT_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN=
```

If a callable still enforces App Check in a way that affects emulator testing, use the project's documented debug-token workflow instead of disabling App Check permanently.

Never commit a debug token.

---

# 7. Google Places locally

This depends on what you want to test.

## If Places Autocomplete is not needed

Leave:

```env
NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=
```

The UI should show its graceful missing-key state.

## If testing real Google Places in localhost

Create a Google browser API key and restrict it to:

```text
http://localhost:3000/*
```

Then:

```env
NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=YOUR_BROWSER_KEY
```

This means the frontend is local, but Places API calls are still real external requests.

---

# 8. Backend Google API key for emulated Functions

Your Functions backend uses:

```text
GOOGLE_MAPS_API_KEY
```

for real Places/Routes provider calls.

You have two choices.

### Choice 1 — Use mocked provider behavior

Best for most automated tests.

Your existing backend tests already use test/provider replacement patterns.

This avoids API charges and network dependency.

### Choice 2 — Use a real Google server key locally

Only do this for manual integration testing.

Do not put it in a public `NEXT_PUBLIC_*` variable.

Store it using the Functions emulator-supported local secrets/environment mechanism documented by your project/Firebase tooling.

Do not commit it.

---

# 9. Start Firebase emulators

Your repository has scripts for emulator-backed tests, but for interactive frontend development you want the emulator processes running continuously.

From the project root:

```bash
firebase emulators:start
```

If the current `firebase.json` only declares Firestore and Functions, and Auth emulator configuration is not present yet, inspect the project emulator config first.

Ideally, you want:

```text
Auth       9099
Firestore  8080
Functions  5001
```

You may also see Emulator UI on something like:

```text
http://127.0.0.1:4000
```

depending on configuration.

---

# 10. Start Next.js separately

Open another terminal:

```bash
npm run dev
```

You should get:

```text
http://localhost:3000
```

So your local architecture becomes:

```text
Browser
   │
   ▼
localhost:3000
Next.js
   │
   ├── Auth emulator       :9099
   ├── Firestore emulator  :8080
   └── Functions emulator  :5001
```

---

# 11. Test authentication locally

If the Auth emulator is connected correctly, Google sign-in may be emulated rather than using real Google OAuth.

Depending on how your auth helper is written, you may need a local test-user flow.

Important: your backend checks for a Google-authenticated profile.

So the emulator user must contain whatever provider metadata the backend expects.

If your current emulator workflow does not support that easily, use **Mode B** for final authentication testing.

---

# 12. Test the local workflow

Run through:

```text
Create user
    ↓
Create trip
    ↓
Join trip
    ↓
Submit candidates
    ↓
Set budgets
    ↓
Start voting
    ↓
Vote
    ↓
Close voting
    ↓
Generate plans
    ↓
Select option
    ↓
Review
    ↓
Finalize
```

Use two browser profiles if possible:

```text
Chrome normal
Chrome Incognito
```

This helps simulate two users.

---

# 13. Use Emulator UI

The Firebase Emulator UI is useful for checking Firestore directly.

Verify collections such as:

```text
users/
trips/
trips/{tripId}/members/
trips/{tripId}/candidates/
trips/{tripId}/submissions/
trips/{tripId}/itineraryOptions/
trips/{tripId}/reviewDrafts/
trips/{tripId}/itineraryVersions/
```

This is much better than debugging through frontend state alone.

---

# Option B — Local frontend + real Firebase backend

This is what I would use for your **final local demo rehearsal**.

The browser remains:

```text
http://localhost:3000
```

but it connects to:

```text
real Firebase Auth
real Firestore
real Cloud Functions
real App Check
real Google APIs
```

This catches issues that the emulators cannot fully reproduce.

---

# 14. Configure `.env.local` for real Firebase

Use:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=REAL_VALUE
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=REAL_VALUE
NEXT_PUBLIC_FIREBASE_PROJECT_ID=REAL_VALUE
NEXT_PUBLIC_FIREBASE_APP_ID=REAL_VALUE
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=REAL_VALUE
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=REAL_VALUE

NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY=REAL_SITE_KEY
NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=REAL_BROWSER_KEY

NEXT_PUBLIC_USE_FIREBASE_EMULATORS=false
```

Do not include emulator host variables if they are not used.

---

# 15. Ensure localhost is authorized

Firebase Authentication must allow localhost.

For local development, Firebase normally supports:

```text
localhost
```

Check:

```text
Firebase Console
→ Authentication
→ Settings
→ Authorized domains
```

Ensure:

```text
localhost
```

is present.

---

# 16. Restrict the browser Maps key

Allow:

```text
http://localhost:3000/*
```

Do not leave the key unrestricted.

---

# 17. Deploy backend first

Before using real Firebase locally:

```bash
firebase deploy --only firestore
firebase deploy --only functions
```

Then make sure the backend Google secret exists:

```bash
firebase functions:secrets:set GOOGLE_MAPS_API_KEY
```

Redeploy Functions after changing the secret.

---

# 18. Start only Next.js

Now:

```bash
npm run dev
```

Do **not** run the Firebase emulator.

The local browser should connect to production/project Firebase because:

```env
NEXT_PUBLIC_USE_FIREBASE_EMULATORS=false
```

---

# 19. Test real Google Auth

Open:

```text
http://localhost:3000
```

Click:

```text
Continue with Google
```

Sign in with a real Google account.

Then test:

```text
My Trips
Create Trip
Join
Candidates
Voting
Planning
Review
Finalize
```

This is the closest local test to the hosted version.

---

# 20. Test two users locally

Use:

```text
Chrome
+
Edge
```

or:

```text
Chrome normal
+
Chrome Incognito
```

User A:

```text
Google account A
```

User B:

```text
Google account B
```

Then test the entire collaborative workflow.

---

# 21. Test persistence

This is important.

After finalization:

```text
refresh browser
close tab
open again
logout
login again
```

The trip should still exist.

That confirms Firebase, not frontend memory, owns the state.

---

# 22. Local network demo on another device

If you want to demo from your laptop but open the app on a phone/tablet on the same Wi-Fi, start Next.js on all interfaces.

Try:

```bash
npm run dev -- --hostname 0.0.0.0
```

or, depending on Next CLI:

```bash
next dev -H 0.0.0.0
```

Then find your computer's LAN IP.

On Windows:

```bat
ipconfig
```

You may see something like:

```text
IPv4 Address: 192.168.1.25
```

Then open from your phone:

```text
http://192.168.1.25:3000
```

Both devices must be on the same network.

---

# 23. Important limitation with Firebase Auth over LAN IP

Google OAuth and App Check may behave differently when using:

```text
192.168.x.x
```

instead of:

```text
localhost
```

You may need to add that hostname/domain where supported or use a secure tunnel.

For a competition demo, I would not rely on LAN-IP Google login unless you have tested it beforehand.

Safer options:

- use the laptop browser;
- deploy to Vercel;
- or use a development tunnel with HTTPS.

---

# 24. Development tunnel option

If you want your local Next.js app publicly accessible temporarily, use a tunnel such as:

```text
Cloudflare Tunnel
ngrok
```

Architecture:

```text
Internet
   ↓
temporary HTTPS URL
   ↓
localhost:3000
```

Then you would need to add the tunnel domain to:

- Firebase Auth authorized domains;
- Google Maps browser key referrers;
- potentially App Check configuration.

For a prototype, this is useful but more configuration-heavy than Vercel.

---

# 25. Recommended local workflow

For everyday development:

```text
Firebase Emulators
+
Next.js localhost
```

For realistic testing:

```text
Next.js localhost
+
Real Firebase
+
Real Google APIs
```

For final judging:

```text
Hosted Vercel
+
Real Firebase
```

---

# 26. Local startup checklist

## Fully local

Terminal 1:

```bash
firebase emulators:start
```

Terminal 2:

```bash
npm run dev
```

Environment:

```env
NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true
```

Open:

```text
http://localhost:3000
```

---

## Real backend

Environment:

```env
NEXT_PUBLIC_USE_FIREBASE_EMULATORS=false
```

Then:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

---

# 27. Before every local demo

Run:

```bash
npm run typecheck
npm run lint
npm run build
```

Then verify:

```text
Google login works
Create trip works
Invite works
Second user joins
Places work
Budget works
Voting works
Planning works
Finalization works
Refresh preserves state
```

---