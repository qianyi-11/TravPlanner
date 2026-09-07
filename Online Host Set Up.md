For CodeNection prototype, the cleanest route is:

**Frontend:** Vercel  
**Backend:** Firebase Auth + Firestore + Cloud Functions + App Check  
**Travel data:** Google Places / Routes

# 1. Finish local validation first

Before touching production services, make sure the branch is stable locally.

From the project root:

```bash
git checkout codex/combine
npm install

npm run typecheck
npm run lint
npm run build
npm test
```

If available, also run:

```bash
npm run test:security:emulator
npm run test:emulator
```

Do not deploy while you still have phase-related build/type errors.

---

# 2. Create a Firebase project

Go to Firebase Console and create a project specifically for the prototype.

For example:

```text
travplanner-codenection-2026
```

Use one project for the hackathon prototype unless you specifically need separate staging/production environments.

Your app deploys Cloud Functions, so the Firebase project will need billing enabled on the **Blaze plan** for Functions deployment. Firebase documents this requirement for deployed Cloud Functions runtimes. 

For a hackathon prototype, also set a Google Cloud billing budget alert.

---

# 3. Register the Firebase web app

Inside Firebase Console:

```text
Project Settings
→ General
→ Your apps
→ Add app
→ Web
```

Register something like:

```text
Trippy Web
```

Firebase will give you values similar to:

```js
apiKey
authDomain
projectId
storageBucket
messagingSenderId
appId
```

These correspond to your existing environment variables.

Create locally:

```text
.env.local
```

with:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=

NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY=

NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=

NEXT_PUBLIC_USE_FIREBASE_EMULATORS=false
```

Do not commit `.env.local`.

---

# 4. Enable Google Authentication

In Firebase Console:

```text
Authentication
→ Sign-in method
→ Google
→ Enable
```

Select the project support email and save.

Your current backend expects Google-authenticated users, so this is required for the live prototype.

Firebase's web auth flow supports Google sign-in and requires the relevant deployment/custom domains to be authorized. 

For now, localhost will normally already work.

You will add the Vercel domain later.

---

# 5. Create Firestore

In Firebase Console:

```text
Build
→ Firestore Database
→ Create database
```

Choose the region carefully.

Your Functions client currently points to:

```text
us-central1
```

for callable Functions, so for a prototype I would avoid introducing unnecessary geographic separation unless you have a reason.

Do **not** manually recreate the security rules in the console.

Your repository already contains:

```text
firebase/firestore.rules
firebase/firestore.indexes.json
```

Those should be deployed from source.

---

# 6. Connect Firebase CLI to the project

Your repo already contains `firebase.json`, so you do not need to rebuild the Firebase project structure.

Install/login if necessary:

```bash
npm install -g firebase-tools
firebase login
```

From the `TravPlanner` repository:

```bash
firebase use --add
```

Select your Firebase project.

You can alternatively use:

```bash
firebase use YOUR_PROJECT_ID
```

or pass `--project` during deployment.

Firebase's CLI supports project aliases and also notes that public/open-source repositories often should not commit `.firebaserc`. 

---

# 7. Deploy Firestore rules and indexes

Before Functions, deploy your database security model:

```bash
firebase deploy --only firestore
```

That deploys the Firestore configuration referenced by your existing `firebase.json`.

Firebase documents `--only firestore` as deploying Firestore rules and indexes. 

After deployment, check Firebase Console:

```text
Firestore
→ Rules
```

and confirm the rules match your repo.

---

# 8. Configure Google Maps Platform

Your backend uses Google Places and Google Routes.

Go to Google Cloud Console for the **same Firebase/Google Cloud project**.

Enable the APIs actually needed by the application.

At minimum:

```text
Places API (New)
Routes API
```

For browser autocomplete, depending on the implementation used in Phase 40, you may also need the relevant Maps JavaScript/Places browser functionality.

Google requires billing for Maps Platform APIs and recommends restricting API keys to only the necessary APIs. 

---

# 9. Create TWO Google API keys

Do not use one key everywhere.

You should have:

```text
Browser key
Server key
```

## Browser key

Used by:

```env
NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY
```

This key is visible to the browser by design.

Restrict it by:

**Application restriction:**

```text
Websites / HTTP referrers
```

Initially allow:

```text
http://localhost:3000/*
```

Later add:

```text
https://YOUR-VERCEL-DOMAIN/*
```

Also apply API restrictions so the key can only use the browser APIs required by your implementation.

Google explicitly recommends both application restrictions and API restrictions, and separate keys for separate applications/use cases. 

---

## Server key

Used by Cloud Functions as:

```text
GOOGLE_MAPS_API_KEY
```

This must **not** be added to `.env.local` as a `NEXT_PUBLIC_` variable.

Restrict this key to the server-side APIs actually used:

```text
Places API (New)
Routes API
```

Google warns that web-service API keys should not be publicly exposed. 

---

# 10. Store the server Google key as a Firebase secret

Your backend already uses:

```ts
defineSecret("GOOGLE_MAPS_API_KEY")
```

Set it from the project root:

```bash
firebase functions:secrets:set GOOGLE_MAPS_API_KEY
```

Paste the **server key**, not the browser key.

Firebase's official secret workflow uses exactly this CLI command; functions referencing a changed secret must then be redeployed. 

---

# 11. Build Functions locally

Before deploying:

```bash
npm run build:functions
```

Also run:

```bash
npm run typecheck
```

Do not deploy if the Functions build fails.

---

# 12. Deploy Cloud Functions

Then:

```bash
firebase deploy --only functions
```

Firebase officially supports this command for deploying all Functions. 

Your project has many Functions, so the first deployment may be substantial.

After deployment, inspect the output and verify there are no failed Functions.

---

# 13. Test the backend locally against production Firebase

Before Vercel, run the frontend locally:

```bash
npm run dev
```

with:

```env
NEXT_PUBLIC_USE_FIREBASE_EMULATORS=false
```

Now test:

```text
localhost
  ↓
real Firebase Google Auth
  ↓
real Firestore
  ↓
real Cloud Functions
```

Try at minimum:

```text
Google login
Create trip
Open My Trips
```

If Places Autocomplete has already been implemented, test that as well.

This intermediate stage is valuable because it separates **Firebase problems** from **Vercel problems**.

---

# 14. Configure Firebase App Check

Your current frontend uses App Check and currently initializes a reCAPTCHA v3 provider.

In Firebase Console:

```text
Build / Security
→ App Check
→ Apps
→ Select your Web app
```

Register the web application.

For your current code, create/configure the required reCAPTCHA site key and put the public site key into:

```env
NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY=
```

Firebase's current docs support registering the web app and configuring the reCAPTCHA provider before enabling enforcement. 

## Important for prototype deployment

Do **not** immediately enable strict App Check enforcement everywhere.

Use:

```text
Register
→ Deploy
→ Test
→ Observe metrics
→ Enable enforcement
```

Otherwise you can accidentally block your own demo.

And never put this in production:

```env
NEXT_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN=
```

---

# 15. Add a frontend-only Vercel build command

Your root `npm run build` also builds Firebase Functions.

That is unnecessary for Vercel.

Add this script if Phase 41 has not already done it:

```json
"build:web": "npm run build:shared && npm run build:frontend"
```

Then test:

```bash
npm run build:web
```

This should be the Vercel build command.

---

# 16. Push the branch to GitHub

Make sure your latest working branch is pushed:

```bash
git status
git push origin codex/combine
```

Do not merge into `main` yet.

For the first hosted prototype, deploy `codex/combine` as a **preview/testing deployment**.

---

# 17. Create the Vercel project

Go to Vercel.

Choose:

```text
Add New
→ Project
→ Import Git Repository
```

Select:

```text
qianyi-11/TravPlanner
```

Vercel has native Next.js support and Git-based preview deployments. 

Configure:

```text
Framework Preset:
Next.js

Root Directory:
.

Install Command:
npm install

Build Command:
npm run build:web
```

Do not use:

```text
npm run build
```

for Vercel unless you intentionally want it building the Firebase Functions too.

---

# 18. Add Vercel environment variables

Before the final deployment, add:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=

NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY=

NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=

NEXT_PUBLIC_USE_FIREBASE_EMULATORS=false
```

Use the actual Firebase web config and browser Google Maps key.

Do **not** add:

```env
GOOGLE_MAPS_API_KEY=
```

to Vercel.

That secret belongs only in Firebase Functions.

---

# 19. Deploy the frontend

Trigger a Vercel deployment.

You should receive something like:

```text
https://travplanner-xxxx.vercel.app
```

Open it.

At this stage, Google login may fail until you configure the domain.

That is expected.

---

# 20. Add Vercel to Firebase Auth authorized domains

Go back to Firebase Console:

```text
Authentication
→ Settings
→ Authorized domains
```

Add your production Vercel hostname.

For example:

```text
travplanner-xxxx.vercel.app
```

If you later add a custom domain:

```text
trippy.example.com
```

add that too.

Firebase's Google authentication documentation requires relevant custom OAuth domains to be authorized. 

---

# 21. Update the browser Maps API key restriction

Go to Google Cloud Console:

```text
APIs & Services
→ Credentials
→ Browser API key
```

Add your deployed URL to the HTTP referrer list:

```text
https://travplanner-xxxx.vercel.app/*
```

Keep:

```text
http://localhost:3000/*
```

if you still want local development.

If you use Vercel preview deployments with changing hostnames, decide whether you want to support those or restrict the key only to the stable production domain.

---

# 22. Verify Places Autocomplete online

Now test:

```text
Create Trip
→ search Tokyo
→ choose Tokyo, Japan
```

You should not need to enter:

```text
Place ID
latitude
longitude
```

Then add a candidate:

```text
Tokyo Skytree
```

and confirm the selected place reaches the backend correctly.

---

# 23. Check App Check after deployment

Open:

```text
Firebase Console
→ App Check
→ Metrics
```

Use the hosted app and perform several valid actions.

Verify valid traffic appears.

Only after you are confident that the deployed app is producing valid App Check tokens should you enable/confirm enforcement for the resources you are protecting.

Firebase App Check is intended to reject requests not originating from legitimate app instances once enforcement is enabled. 

---

# 24. Run the real two-user test

This is the most important test.

Use:

```text
normal Chrome
+
Incognito / another browser
```

or two different devices.

### User A

```text
Google login
→ Create trip
→ Copy invite
```

### User B

```text
Google login
→ Join invite
```

Then:

```text
Both see trip
    ↓
Both suggest places
    ↓
Both set budgets
    ↓
Owner starts voting
    ↓
Both vote
    ↓
Owner closes voting
    ↓
Generate itinerary
    ↓
Vote/select option
    ↓
Review
    ↓
Approve
    ↓
Finalize
    ↓
Refresh both browsers
    ↓
Final plan still exists
```

This should become your main demo acceptance test.

---

# 25. Test solo travel too

The competition explicitly requires both solo and group travel. 

Create another trip with one user only.

Verify they can progress through the supported workflow without adding another member.

---

# 26. Test failure cases before judging

At minimum:

```text
invalid invite
duplicate invite join
trip > 7 days
invalid dates
candidate submission outside COLLECTING
voting outside VOTING
non-owner attempting owner action
refresh after login
logout and login again
```

Also check the application on:

```text
desktop
phone-sized viewport
```

because design and usability are part of the competition rubric. 

---

# 27. Add basic legal/provider pages if you expose Google Places publicly

This is easy to overlook.

Google's Places API policies require applications using Places data to provide appropriate attribution, and their documentation also calls for publicly accessible Terms of Use and Privacy Policy that incorporate the relevant Google terms/privacy requirements. 

Routes API has similar attribution/policy requirements. 

For a public hackathon prototype, at minimum review these requirements before final presentation.

Do not copy legal text blindly; make simple prototype-appropriate pages if required.

---

# 28. Monitor usage and quotas

Before giving judges the URL, check:

```text
Firebase Functions usage
Firestore usage
Google Maps Platform quotas
Google Cloud billing
```

Google strongly recommends restricting API keys because owners are financially responsible for unauthorized usage. 

For the hackathon:

- restrict keys;
- keep traffic small;
- set budget alerts;
- avoid making the URL widely public unnecessarily.

---

# 29. Freeze a demo-ready version

Once the hosted flow works, do not keep making large changes immediately before judging.

Tag or commit the known-good version:

```bash
git status
git add .
git commit -m "chore: prepare hosted CodeNection prototype"
git tag codenection-demo-v1
```

You do not need to push a tag if your workflow does not need one, but having a known-good commit SHA is useful.

---

# 30. Prepare a fallback

Even with an online deployment, keep a local fallback.

For presentation day, have:

```text
Hosted Vercel URL
+
localhost working copy
+
Firebase project already deployed
+
demo accounts/browsers ready
```

If venue Wi-Fi fails, you still have options.

The competition accepts demonstrations using an actual device, emulator, or hosted environment, but the project needs to be deployable rather than purely local. 

---

## Recommended minimal prototype deployment

You do **not** need production-grade infrastructure.

For CodeNection, I would target this:

| Area | Prototype target |
|---|---|
| Frontend | Vercel |
| Auth | Firebase Google Auth |
| Database | Firestore |
| Business logic | Firebase Functions |
| Security | Existing Firestore rules |
| App Check | Configured and tested |
| Places | Restricted browser key |
| Routes/Places backend | Firebase secret |
| Domain | Vercel domain is enough |
| Custom domain | Not necessary |
| CI/CD | Not necessary |
| Monitoring | Basic console/quota checks |
| Production scaling | Not necessary |
| Real E2E | Required before demo |

## Short version

The critical path is:

```text
Local tests pass
    ↓
Create Firebase project + Blaze
    ↓
Enable Google Auth + Firestore
    ↓
Enable Places / Routes APIs
    ↓
Create browser + server Google keys
    ↓
Set GOOGLE_MAPS_API_KEY secret
    ↓
Deploy Firestore
    ↓
Deploy Functions
    ↓
Test localhost against real Firebase
    ↓
Configure App Check
    ↓
Create Vercel project
    ↓
Add frontend env variables
    ↓
Deploy
    ↓
Authorize Vercel domain in Firebase
    ↓
Restrict Maps browser key to Vercel
    ↓
Two-user E2E test
    ↓
Freeze demo build
```

That is the level of hosting I would aim for: **real enough to prove feasibility, but not over-engineered beyond what the competition needs.**