# Trippy — Collaborative Travel Planning

> **CodeNection 2026 — Planning an Escape**  
> Track: **Lifestyle & Personal Productivity**  
> Solution type: **Travel Planner**

Trippy is a collaborative travel-planning application that helps solo travellers and groups move from scattered ideas to one shared itinerary.

Instead of coordinating destinations, budgets, activity ideas, votes, and itinerary decisions across multiple chats and tools, Trippy keeps the planning workflow in one place.

The application combines a **Next.js frontend** with an authoritative **Firebase backend**. Trip state is stored in Firestore, business rules are enforced through callable Cloud Functions, and shared schemas keep the frontend and backend aligned.

---

## The Problem

Planning a trip becomes difficult when information is spread across:

- group chats;
- maps;
- budgeting tools;
- itinerary tools;
- booking platforms;
- individual notes.

For group trips, the problem becomes harder because members may have different:

- budgets;
- activity preferences;
- priorities;
- schedules;
- opinions about what should be included.

This often leads to repeated discussion, duplicated work, unclear decisions, and planning fatigue.

Trippy is designed to turn that coordination process into a structured workflow.

---

# What Trippy Does

A trip moves through an authoritative backend-controlled lifecycle:

```text
Create Trip
    ↓
Invite / Join
    ↓
Collect Places & Budgets
    ↓
Candidate Voting
    ↓
Generate Itinerary Options
    ↓
Option Selection
    ↓
Group Review
    ↓
Finalise Trip
    ↓
Shared Final Itinerary
```

The frontend never manually advances the trip state.

Firebase Cloud Functions validate every domain mutation and determine when the trip can move to the next phase.

---

# Core Features

## Google Authentication

Users sign in using Firebase Authentication with Google.

Authentication provides the identity used by the backend for:

- trip ownership;
- membership;
- permissions;
- private votes;
- private budgets;
- review actions.

---

## Trip Creation

A user can create a trip with:

- trip name;
- destination;
- travel dates;
- default daily planning window;
- primary transport mode;
- activity-budget currency.

The backend validates trip setup and creates the trip owner, membership projection, and invite.

Trips currently support a maximum of **7 inclusive calendar days**.

---

## Solo and Group Travel

A trip begins with one owner, so the same workflow can be used by a solo traveller.

For group travel, the owner can share an invite and additional users can join the same trip.

Membership and ownership are controlled by the backend rather than client-side state.

Supported membership operations include:

- joining a trip;
- resetting an invite;
- leaving a trip;
- removing a member;
- transferring ownership.

---

## Collaborative Place Collection

During the collection phase, members can submit real places they want the group to consider.

Each submission can contain:

- place;
- preference;
- preferred time of day;
- estimated visit duration;
- optional notes.

Preferences include:

```text
INTERESTED
MUST_DO
```

Preferred periods include:

```text
ANYTIME
MORNING
AFTERNOON
EVENING
```

The backend resolves and validates provider place information before treating it as authoritative trip data.

---

## Personal Activity Budgets

Each member can provide a private personal activity budget.

Individual budgets remain private.

The backend derives safe shared budget information for trip planning without exposing another member's private budget directly.

This allows the itinerary workflow to account for financial constraints while preserving member privacy.

---

## Group Preference Synchronisation

Instead of trying to infer group preferences from unstructured chat messages, Trippy provides explicit group decision points.

During candidate voting, members can vote:

```text
WANT
NEUTRAL
AVOID
```

This converts individual opinions into structured planning input.

The backend controls:

- when voting starts;
- when voting closes;
- which phase the trip is in;
- which actions are valid.

---

## Itinerary Planning

After candidate voting is complete, the backend can generate multiple itinerary alternatives.

A planning cycle may produce up to **three itinerary options**.

Options contain structured days and activities with information such as:

- activity title;
- date;
- start time;
- end time;
- duration;
- location.

Backend planning scores can consider dimensions such as:

- must-do coverage;
- group vote preference;
- travel efficiency;
- gap efficiency;
- budget efficiency;
- preferred-period matching.

Members can then compare and vote on itinerary options.

---

## Review and Approval

After an itinerary option is selected, the trip enters review.

The current workflow supports:

- viewing the review draft;
- group approval/rejection;
- permitted minor itinerary edits;
- owner finalisation.

Finalisation is backend-controlled.

The frontend cannot mark an itinerary as final unless backend validation and approval requirements are satisfied.

---

## Final Shared Itinerary

Once finalised, the authoritative itinerary is stored as a Firestore itinerary version.

The final plan remains available after:

- page refresh;
- sign-out/sign-in;
- reopening the trip later.

The final itinerary therefore does not depend on browser memory or local mock state.

---

# Competition Requirement Alignment

| CodeNection requirement | Trippy approach |
|---|---|
| End-to-end trip planning | Structured workflow from trip creation to final itinerary |
| Budgeting | Private member activity budgets with backend-derived safe planning values |
| Itinerary building | Backend-generated itinerary options and final itinerary versions |
| Group preference synchronisation | Candidate submissions, MUST_DO preferences, WANT/NEUTRAL/AVOID voting and option voting |
| Adjustment to unexpected changes | Backend includes trip reopening and change-request capabilities; the current primary UI exposes limited review-time adjustment rather than a complete live-disruption experience |
| Reduce planning effort | Centralises collection, voting, planning and review into one workflow |
| Reduce planning stress | Makes decisions explicit instead of relying on repeated group-chat negotiation |
| Solo travel | A single owner can complete a trip without additional members |
| Group travel | Invite-based membership, group voting and group review |

---

# Current Scope

Trippy intentionally focuses on the core collaborative planning workflow.

The current application does **not** pretend to provide data that the backend cannot verify.

Features intentionally hidden or limited include:

- live booking availability;
- live pricing;
- fake ratings or review counts;
- fake booking recommendations;
- price-pressure indicators;
- live trip-rescue UI;
- fabricated map or route information.

Some corresponding backend capabilities may exist but are not exposed as primary user-facing features until there is a clear and reliable read model.

---

# Unexpected Changes — Current Status

Handling unexpected changes is part of the competition problem.

The backend already contains mechanisms for:

- reopening trip phases;
- creating change requests;
- reviewing change requests;
- applying approved changes.

The current primary frontend, however, focuses mainly on planning and review-time adjustment.

A complete production-quality experience for live disruptions such as cancelled activities, transport disruption, or failed bookings is **not yet exposed as a full user-facing workflow**.

This is a known product gap rather than a feature represented with mock data.

---

# Architecture

```text
                         Trippy
                           │
                     Next.js UI
                           │
              ┌────────────┼─────────────┐
              │            │             │
              ▼            ▼             ▼
        Firebase Auth   Firestore   Callable Functions
                         Reads            │
                      / realtime          │
                                          ▼
                                  Validation &
                                  Business Logic
                                          │
                              ┌───────────┴───────────┐
                              ▼                       ▼
                         Firestore             Google Services
                                                Places / Routes
```

---

# Backend Authority Model

Trippy uses a strict separation between reads and mutations.

### Reads

The browser reads authorised data from Firestore using repository abstractions and realtime listeners.

Examples:

```text
users/{uid}/tripMemberships
trips/{tripId}
trips/{tripId}/members
trips/{tripId}/candidates
trips/{tripId}/submissions
trips/{tripId}/itineraryOptions
trips/{tripId}/reviewDrafts
trips/{tripId}/itineraryVersions
```

### Writes

Domain mutations are performed through callable Cloud Functions.

The browser does not directly write authoritative trip documents.

```text
Next.js
   │
   ▼
Typed Callable API
   │
   ▼
Firebase Cloud Function
   │
   ├── authentication
   ├── authorisation
   ├── shared-schema validation
   ├── phase validation
   ├── transaction
   └── provider validation
         │
         ▼
      Firestore
```

---

# State Management

Authoritative application state lives in:

```text
Firebase Auth
Firestore
Cloud Functions
```

Client-side state is limited to presentation concerns such as:

- tabs;
- dialogs;
- filters;
- temporary forms;
- selections;
- map viewport.

Trip state, votes, budgets, membership and itinerary state are not persisted as authoritative Zustand/localStorage data.

---

# Repository Structure

```text
TravPlanner/
│
├── app/                      # Next.js App Router
│   ├── my-trips/
│   ├── join/
│   └── trips/
│       ├── new/
│       └── [tripId]/
│           ├── places/
│           ├── vote/
│           ├── generating/
│           ├── itinerary/
│           └── plan/
│
├── components/               # Reusable frontend UI
│
├── lib/
│   ├── api/                  # Typed callable Function wrappers
│   ├── auth/                 # Authentication context/hooks
│   ├── errors/               # User-facing error mapping
│   ├── firebase/             # Firebase client bootstrap
│   ├── hooks/                # React data hooks
│   ├── navigation/           # Phase-aware navigation
│   ├── repositories/         # Firestore read layer
│   └── trips/                # Trip UI mapping/validation
│
├── functions/                # Firebase Cloud Functions backend
│
├── shared/                   # Shared schemas, contracts and types
│
├── firebase/
│   ├── firestore.rules
│   └── firestore.indexes.json
│
├── tests/
│
└── docs/
```

---

# Technology Stack

### Frontend

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- Zustand for transient UI state
- Lucide icons

### Backend

- Firebase Authentication
- Cloud Firestore
- Firebase Cloud Functions
- Firebase App Check
- Firebase Admin SDK

### Validation and Contracts

- Zod
- shared TypeScript package: `@travel-planner/shared`

### External Provider Integration

- Google Places
- Google Routes

### Testing

- Vitest
- Firebase Rules Unit Testing
- Firebase Emulator Suite

---

# Main Routes

| Route | Purpose |
|---|---|
| `/` | Entry point and authentication |
| `/my-trips` | Current user's trips |
| `/trips/new` | Create a trip |
| `/join` | Join with an invite |
| `/trips/[tripId]` | Trip dashboard |
| `/trips/[tripId]/places` | Place collection |
| `/trips/[tripId]/vote` | Candidate voting |
| `/trips/[tripId]/generating` | Planning and itinerary-option comparison |
| `/trips/[tripId]/itinerary` | Review and approval |
| `/trips/[tripId]/plan` | Finalised itinerary |

Older routes may remain as compatibility redirects but do not own a separate trip model.

---

# Trip Lifecycle

The backend uses five authoritative trip phases:

```text
COLLECTING
    ↓
VOTING
    ↓
PLANNING
    ↓
REVIEW
    ↓
FINALIZED
```

The frontend derives its available actions and navigation from these phases.

The client does not manually advance a trip.

---

# Security Model

Firestore security follows a default-deny approach.

Key principles include:

- only authenticated users participate;
- trip reads require active membership;
- individual candidate votes are private;
- personal budgets are private;
- approval responses are private;
- invite hashes and server-only provider data are never readable by the browser;
- authoritative domain writes are denied from the browser;
- Cloud Functions perform mutations using backend privileges.

---

# Getting Started

## Requirements

Install:

- Node.js 22 for Firebase Functions compatibility;
- npm;
- Firebase CLI for emulator/deployment workflows.

Clone the repository and select the integration branch:

```bash
git clone https://github.com/qianyi-11/TravPlanner.git
cd TravPlanner
git checkout codex/combine
```

Install dependencies:

```bash
npm install
```

---

# Environment Configuration

Copy:

```bash
copy .env.example .env.local
```

On macOS/Linux:

```bash
cp .env.example .env.local
```

Configure:

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

Development-only variables are also available for Firebase emulator hosts.

Never commit:

```text
.env
.env.local
service-account files
private keys
App Check debug tokens
Google server API keys
```

---

# Google API Keys

The project separates browser and backend provider credentials.

### Browser

```text
NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY
```

Used only for browser-side Places/Maps functionality.

### Backend

```text
GOOGLE_MAPS_API_KEY
```

Stored as a Firebase Functions secret.

The backend key is used by server-side Google provider integrations and must never be exposed through `NEXT_PUBLIC_*` variables.

---

# Local Development

Start Next.js:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

---

# Build and Validation

Run type checking:

```bash
npm run typecheck
```

Run lint:

```bash
npm run lint
```

Run the complete build:

```bash
npm run build
```

Run tests:

```bash
npm test
```

Run Firestore security tests with the emulator:

```bash
npm run test:security:emulator
```

Run the emulator-backed test suite:

```bash
npm run test:emulator
```

---

# Current Validation Status

At the latest completed integration validation:

- Next.js build passed;
- frontend/shared/Functions type checking passed;
- lint passed;
- local tests passed;
- Firestore security emulator tests passed;
- the emulator-backed integration suite passed except for one existing budget-concurrency timeout;
- the issue was reproducible independently of the frontend integration.

A complete live two-user production workflow has **not yet been treated as validated** without the required deployed Firebase, App Check and external provider configuration.

---

# Deployment

The intended production architecture is:

```text
Vercel
  └── Next.js frontend

Firebase
  ├── Authentication
  ├── Firestore
  ├── Cloud Functions
  └── App Check

Google Cloud / Maps Platform
  ├── Places
  └── Routes
```

The repository's current `firebase.json` manages:

- Cloud Functions;
- Firestore rules;
- Firestore indexes.

Frontend hosting is handled separately.

See:

```text
docs/integration.md
docs/deployment.md
```

when available for detailed deployment instructions.

---

# Competition Alignment

This project was created for **CodeNection 2026 — Planning an Escape**.

The competition problem focuses on reducing the coordination burden involved in planning solo and group travel.

Trippy's central design decision is to treat collaborative trip planning as a **shared decision workflow**, rather than only an itinerary editor.

The main differentiating workflow is:

```text
Individual Ideas
       ↓
Structured Preferences
       ↓
Private Budget Constraints
       ↓
Group Candidate Voting
       ↓
Alternative Itineraries
       ↓
Group Option Decision
       ↓
Review & Approval
       ↓
One Authoritative Plan
```

This approach focuses on the coordination problem that appears before a group can agree on an itinerary.

---

# Design Principles

## One Shared Source of Truth

Everyone sees the same backend-owned trip state.

## Structured Decisions

Important group decisions are explicit rather than buried inside chat messages.

## Privacy Where It Matters

Personal budgets and individual voting records are not exposed unnecessarily.

## Backend-Enforced Workflow

The browser cannot bypass trip phases or permission rules.

## No Fake Travel Data

The interface should not display fabricated ratings, availability, pricing or provider information.

## Preserve Simplicity

Competition example features are treated as options, not requirements. Features are added when they meaningfully improve the travel-planning workflow.

---

# Current Limitations

The current implementation should not be interpreted as a complete commercial travel platform.

Known limitations include:

- production Google/Firebase configuration is environment-specific;
- the deployed two-user workflow still requires production validation;
- full live disruption/replanning UX is limited;
- booking and payment integration is not part of the current core workflow;
- live pricing and availability are not presented;
- provider quotas and API access must be configured by the deploying team.

These limitations are intentionally documented rather than hidden behind mock behaviour.

---

# Competition Documentation

Competition requirements are maintained separately from implementation details.

See:

```text
docs/competition/CODENECTION_2026_COMPETITION_REQUIREMENTS.md
```

That document defines competition-level requirements.

Project architecture, contracts and implementation details belong in the repository's technical documentation.

---

# Documentation

Additional technical documentation:

```text
docs/integration.md
docs/final-validation-report.md
```

The repository also contains:

- shared domain contracts;
- Firestore security rules;
- backend integration tests;
- frontend workflow tests;
- implementation checkpoints.

---

# Team Development Notes

When modifying Trippy:

1. treat shared contracts and backend functions as authoritative for domain behaviour;
2. treat the original frontend design as the visual source of truth where compatible;
3. read Firestore from repository abstractions;
4. perform domain writes through callable Functions;
5. do not move authoritative state back into Zustand;
6. do not weaken Firestore rules to simplify frontend implementation;
7. do not expose server credentials;
8. do not fabricate unsupported travel information.

---

# Project Status

**Current stage:** Integrated full-stack prototype

Implemented:

- Firebase Google authentication architecture;
- Firestore-backed trips;
- membership/invite workflow;
- candidate collection;
- personal activity budgets;
- group candidate voting;
- itinerary generation workflow;
- itinerary-option voting;
- review and approval;
- finalised persisted itinerary;
- backend security rules;
- emulator and integration testing.

Still requiring production/environment validation:

- deployed Google authentication;
- App Check production enforcement;
- production Google provider credentials;
- hosted two-user end-to-end test;
- complete user-facing unexpected-change/replanning experience.

---

## CodeNection 2026

**Problem Statement:** Planning an Escape  
**Track:** Lifestyle & Personal Productivity  
**Project:** Trippy / TravPlanner

**Goal:** make collaborative trip planning more structured, faster, and less stressful without sacrificing individual preferences or budget constraints.