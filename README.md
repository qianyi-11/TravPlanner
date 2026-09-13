# Trippy by OpenCrab

> Plan your trip together.

## Submission Information

| Item | Details |
|---|---|
| Team | OpenCrab |
| Team members | Lee Qian Yi, Cha Zi Yu |
| Problem statement | Planning an Escape - Travel Planner |
| Public UI prototype | TODO - required before submission |
| Video presentation | TODO - add a 3-5 minute unlisted YouTube link |
| Presentation slides | TODO - add a public link |
| Repository | [github.com/qianyi-11/TravPlanner](https://github.com/qianyi-11/TravPlanner) |
| Public deployment | To be finalized before submission |

---

# 1. Project Overview

## Problem

Group travel planning is difficult because the group must make one practical decision from many personal preferences.

- **Preference loss:** travellers have different interests, budgets, priorities, dislikes, must-do activities and preferred pace. Informal discussion can make some of those preferences invisible.
- **Decision overload:** votes show what is popular, but popularity alone does not answer what can realistically fit into the available trip.
- **Planning fragmentation:** suggestions, polling, itinerary building, budgeting and changes are often spread across chats and separate tools. One organiser must manually turn the discussion into the final plan.

This affects the organiser, every traveller whose preferences should be represented, and the providers whose opening hours, travel time and cost shape the plan. Established collaborative planners such as Wanderlog show the value of shared itineraries, maps and planning tools. Trippy focuses on the decision process that connects group input to a practical itinerary.

## Stakeholders

- University students and small friend groups planning leisure trips.
- The organiser, who currently carries most of the coordination work.
- Travellers who need to contribute preferences and understand how the final plan was formed.
- Solo travellers as a secondary audience using the same structured flow with one member.

## Existing Solution

Groups commonly combine chat, saved places, maps, polls, calendars, itinerary tools and expense calculators. This can collect information without making the reasoning from group choices to a feasible schedule visible.

Trippy does not claim that maps, voting or itinerary creation are individually new. Its product emphasis is the visible transition from individual input to a realistic shared plan.

## Our Solution

Trippy is an explainable group travel planner that turns individual preferences and group votes into a realistic shared itinerary while making the decision process visible rather than hiding it behind a black box.

```text
Individual preferences
        |
Shared suggestions
        |
Positive voting
        |
Capacity-aware shortlist
        |
Review and sequencing
        |
Shared itinerary
        |
Prepared Trip Rescue scenario
```

Travellers create a trip, record preferences, suggest places and positively vote on shared options. Trippy then converts those decisions into a capacity-aware shortlist using practical constraints such as trip duration, usable hours, meal periods, visit duration and estimated travel time. The selected places can be reviewed, sequenced and converted into a persisted day-by-day itinerary.

Trip Rescue is separate from the core planning calculation. It uses a prepared disruption event and prepared replacement to prototype how the same planning experience could continue when an activity becomes unsuitable during a trip. It does not claim live disruption detection.

## Main Prototype Features

- Persistent group and trip creation, editing and deletion.
- Traveller preference profiles for interests, food preferences, pace, must-do entries, dislikes and personal budget.
- Shared place suggestions and trip-scoped positive voting.
- Google Places search and Google Maps display when a browser API key is configured.
- Vote-ranked, capacity-aware shortlisting based on trip length, daily planning hours, meal slots, average visit duration and estimated geographic travel time.
- Shortlist review and validation before itinerary creation.
- Deterministic nearest-neighbour sequencing using saved coordinates; this is an understandable heuristic, not globally optimized routing.
- Persisted day-by-day itinerary and final-plan views.
- Prototype budget estimates and stored booking-pressure indicators; neither is live pricing.
- Split Bill and currency-conversion calculators stored in the current browser, not a shared expense ledger.
- Trip Rescue prototype using a prepared disruption event and prepared replacement, with the event's resolved status persisted.
- Prisma persistence backed by PostgreSQL.

## Core User Flow

```text
Preferences -> Suggestions -> Positive votes -> Capacity-aware shortlist
-> Review -> Deterministic sequencing -> Day-by-day itinerary
-> Prepared Trip Rescue prototype
```

---

# 2. Ideation & Iteration

## Ideas Considered

| Idea | Decision | Why |
|---|---|---|
| Collaborative group planner | **Kept** | Directly addresses fragmented planning and group coordination. |
| Preferences, suggestions and voting | **Kept** | Gives each traveller structured input before itinerary building. |
| Capacity-aware shortlist | **Kept** | Connects votes to the time, meal and travel capacity of the trip. |
| Deterministic itinerary builder | **Kept** | Produces an understandable schedule without an opaque AI dependency. |
| Trip Rescue prototype | **Kept in simplified form** | A prepared event and prepared replacement validate the response interaction before external integrations. |
| Budget and Split Bill | **Simplified** | The prototype estimates costs and calculates settlements without claiming live prices or a production ledger. |
| Fair Group Consensus | **Deferred on `main`** | Preference-weighted scoring and traveller-representation trade-offs are not implemented. |
| Group Availability Poll | **Deferred** | Useful for schedule overlap, but outside the core planning flow. |
| Meeting Point Recommendation | **Deferred** | Requires additional origin and travel-time data. |
| Flight, hotel and booking integrations | **Deferred** | Provider and operational complexity would distract from the core prototype. |
| AI-generated itinerary | **Deferred** | Deterministic behaviour is easier to explain, test and demonstrate reliably. |
| Large production platform | **Replaced** | A narrower end-to-end prototype is more achievable and persuasive. |

## Ideation Boards

### Problem Tree

```mermaid
flowchart TD
    P[Group trips take too much coordination]
    C1[Information split across tools] --> P
    C2[Different interests and budgets] --> P
    C3[Late replies and unclear decisions] --> P
    C4[Plans can change during the trip] --> P
    P --> E1[Organiser repeats manual work]
    P --> E2[Some preferences get overlooked]
    P --> E3[The final plan is hard to explain]
    P --> E4[Changes create more group confusion]
```

### Idea Map

```mermaid
mindmap
  root((Less group-trip coordination))
    Gather input
      Preferences
      Place suggestions
      Positive votes
    Reach a decision
      Ranked choices
      Capacity-aware shortlist
      Visible rationale
    Make it actionable
      Validation
      Sequence preview
      Day-by-day itinerary
      Budget estimate
    Handle change
      Prepared disruption event
      Prepared replacement
      Prototype simulation
    Deferred
      Availability poll
      Meeting point
      Bookings
      Live disruption signals
```

## Key Iterations

**Initial direction:** A broad production travel platform with booking integrations, approvals and itinerary history.

**Problem discovered:** The infrastructure and provider scope was too large for a short prototype.

**Decision:** Prove one end-to-end group-planning journey first.

**Result:** The current prototype uses one Next.js application and focuses on preferences, votes, capacity reasoning and an actionable itinerary.

**Initial direction:** Voting determines which destinations win.

**Feedback:** Voting alone is common and still leaves the organiser to decide what fits.

**Decision:** Connect votes to a capacity-aware shortlist.

**Result:** Popular choices flow into a planning stage that determines how many activities realistically fit.

**Initial direction:** A fixed shortlist size and a generated schedule.

**Problem discovered:** A fixed number can ignore trip length, meal periods and travel between places.

**Decision:** Use deterministic capacity reasoning and show the reasons beside the vote results.

**Result:** The group can review what fits before building the day-by-day plan.

**Initial direction:** A live rescue engine that detects changes and replaces activities.

**Problem discovered:** Live disruption, availability, routing and collaboration services are outside the prototype boundary.

**Decision:** Validate the interaction with a prepared disruption event and prepared replacement.

**Result:** Trip Rescue is demonstrated honestly as a prototype simulation, with dynamic replanning left to the build phase.

### Mentor Consultation

| Date | Mentor | Feedback received | Team decision |
|---|---|---|---|
| 09/09/2026 | Kueh Pang Teng | Consider calendar or availability input. | Considered a Group Availability Poll and deferred it to protect the core scope. |
| 09/09/2026 | Kueh Pang Teng | Consider travel time for practical meeting points. | Considered a Meeting Point Recommendation and deferred it because member-origin data is outside the MVP. |
| 09/09/2026 | Kueh Pang Teng | Study existing travel planners and clarify differentiation. | Focused Trippy on the visible group decision process before the itinerary. |
| 09/09/2026 | Kueh Pang Teng | Voting needed stronger differentiation. | Connected voting to capacity-aware shortlisting and deterministic planning. |
| 09/09/2026 | Jarod Tan | Group voting alone is common. | Made voting an input to a visible shortlist-and-planning workflow rather than the innovation itself. |
| 09/09/2026 | Jarod Tan | Explore a more memorable direction. | Kept the core realistic and added Trip Rescue as a focused prototype story. |

---

# 3. UI Prototype

## Public Prototype

**Public UI prototype:** TODO - add a URL that opens without a personal account.

The current `main` branch contains the screen flow, but a public deployment and final screenshot set are still submission work.

## Key Screens

Capture 4-8 screenshots from the deployed `main` build. The recommended final set is:

| Screen | Purpose | Evidence status |
|---|---|---|
| Traveller Preferences | Each traveller records interests, pace, budget and other planning signals before shared decisions begin. | TODO: Insert screenshot before final submission. |
| Shared Suggestions / Places | The group turns discussion into shared candidate places. | TODO: Insert screenshot before final submission. |
| Voting Results / Capacity-aware Planning | Positive votes are shown alongside the practical capacity of the trip. | TODO: Insert screenshot before final submission. |
| Shortlist Review | The group reviews selected places before itinerary creation. | TODO: Insert screenshot before final submission. |
| Day-by-day Itinerary / Final Plan | Confirmed places become a schedule with timing, travel and estimates. | TODO: Insert screenshot before final submission. |
| Trip Rescue Prepared Replacement | A prepared disruption and replacement demonstrate the intended recovery workflow without claiming live monitoring. | TODO: Insert screenshot before final submission. |

### UX Principles

- One stage at a time reduces cognitive load.
- Progress and participation remain visible.
- Explanations sit beside the decision they describe.
- Responsive layouts support desktop and mobile browsers.
- Semantic headings, labels and buttons provide a basic accessibility foundation; a formal audit is still required.

---

# 4. What Makes Trippy Different

## Votes Are Not the End of Planning

Voting indicates preference, but popularity alone does not determine what can realistically fit into the trip.

```text
Preferences -> Suggestions -> Votes -> Capacity reasoning
-> Shortlist -> Validation -> Sequence -> Itinerary
```

Trippy makes the transition from group choices to the final plan visible. The product does not present voting itself as novel; it presents voting as one understandable input to planning.

## Capacity-Aware Planning

The implemented shortlist asks not only “What does the group want?” but also “What can the trip realistically hold?” It uses:

- trip length;
- daily usable planning time;
- meal slots that fit the daily window;
- average visit duration from the candidates; and
- estimated geographic travel time between candidates.

The shortlist explains its reasoning, keeps candidates in vote order, and separates meal capacity from sightseeing capacity. It is deterministic and auditable, not AI consensus or fairness scoring.

## Trip Rescue as a Continuation of the Planning Experience

Trip Rescue keeps the response decision inside the trip flow:

```text
Prepared disruption -> affected activity -> prepared replacement
-> traveller review -> prototype resolution
```

The current prototype validates the Rescue interaction before introducing external disruption, availability and collaboration services. Live disruption detection, live alternative search, live availability verification, automatic itinerary replacement and real-time group synchronization are build-phase or future capabilities.

## Market Comparison

Wanderlog is retained as a named similar application because it is part of the team's existing market context. The table describes product emphasis, not exclusive capabilities.

| Dimension | Established collaborative planner, such as Wanderlog | Trippy emphasis |
|---|---|---|
| Shared itinerary | Strong | Strong |
| Collaborative planning | Strong | Strong |
| Group suggestions | Common | Integrated into the decision pipeline |
| Voting | Available in some planners | Feeds planning rather than ending it |
| Capacity reasoning | Usually not the main decision UX | Core planning step |
| Decision visibility | Often secondary | Core UX emphasis |
| Unexpected changes | Product-dependent | Prepared Trip Rescue prototype |

This comparison describes product emphasis rather than claiming that competing products lack every listed capability.

Trippy does not claim that voting, maps or itinerary creation are individually new. Its novelty is the combination of visible group decision-making, capacity-aware planning and a continuous planning-to-rescue experience. The prototype focuses on making the reasoning between group preferences and the final itinerary understandable to travellers.

---

# 5. Technical Architecture & Feasibility

## Technology Stack

| Layer | Technology | Role and reason | Current constraint |
|---|---|---|---|
| Frontend | Next.js 16 + React 19 | Responsive UI and file-based routing in one app | Requires a Node-compatible build/host |
| Language | TypeScript | Shared types across client and server | Type safety does not replace runtime validation |
| Styling | Tailwind CSS 4 | Fast, consistent responsive styling | Visual QA is still required across devices |
| Client state | Zustand | Small client store for hydrated planning state | Not a real-time collaboration layer |
| Backend | Next.js Route Handlers | Keeps API and UI in one repository | `main` does not yet enforce authenticated authorization |
| ORM | Prisma 5.22 | Structured access to the domain model | Schema migrations and connection limits must be managed in hosting |
| Database | PostgreSQL | Persistent, deployable relational storage | Requires a hosted database and `DATABASE_URL` |
| Maps and places | Google Maps JavaScript / Places | Search, place details and map presentation | API key restrictions, quota and billing configuration are required |
| Icons | Lucide React | Consistent interface icons | Icons still need text where meaning is not obvious |

## Architecture

```mermaid
flowchart TD
    U[Traveller] --> UI[Next.js / React UI]
    UI --> Z[Zustand client store]
    Z --> API[Next.js Route Handlers]
    API --> P[Prisma ORM]
    P --> DB[(PostgreSQL)]
    UI --> GM[Google Maps JavaScript / Places]
    API --> GP[Google place-photo proxy]
    DB --> DATA[Groups, members, trips, places, votes, itinerary and rescue events]
```

Trippy deliberately uses one Next.js application with route handlers and Prisma rather than introducing unnecessary microservices. This keeps deployment and debugging manageable for a small team while preserving a clear path for future external APIs and collaborative services.

## Hosting & Deployment Plan

| Layer | Deployment plan | Status |
|---|---|---|
| Web application | Node-compatible hosting platform | TBD before submission |
| PostgreSQL database | Managed PostgreSQL provider | TBD before submission |
| Google Maps / Places | Browser API key restricted to the deployed production origin | Required before submission |

The architecture is designed to deploy as one Next.js application connected to a managed PostgreSQL database. The final hosting and database providers will be selected and documented before submission. The production Google Maps / Places browser key will be restricted to the deployed origin and configured with appropriate API restrictions and quota controls.

## Prototype Scope & Boundaries

| Capability | Current status |
|---|---|
| Group and trip management | Implemented |
| Traveller preference profiles | Implemented; captured preferences do not currently weight shortlist ranking |
| Shared place suggestions | Implemented |
| Positive voting | Implemented |
| Capacity-aware shortlist | Implemented |
| Shortlist review | Implemented |
| Deterministic sequencing | Implemented; proximity heuristic, not globally optimized routing |
| Day-by-day itinerary | Implemented and persisted |
| Budget estimates | Implemented as prototype estimates |
| Split Bill calculator | Implemented, browser-local |
| Trip Rescue interaction | Prototype simulation with prepared event, prepared replacement and persisted resolution status |
| Live disruption detection | Build phase |
| Live availability and pricing | Build phase |
| Automatic itinerary replacement | Build phase |
| Authentication | Build phase |
| Real-time collaboration | Stretch |
| Preference-weighted fairness | Future enhancement |

## Constraints

| Constraint | Current response | Upgrade trigger |
|---|---|---|
| Three-week build window | Keep one end-to-end journey and defer provider-heavy features. | Add stretch work only after the core demo is stable. |
| Small team | One Next.js/TypeScript codebase for UI and API. | Split services only when scale or ownership requires it. |
| Google API quota and cost | Use restricted keys and monitor usage. | Add caching or paid quota after measured demand. |
| Database hosting | Use one managed PostgreSQL instance. | Add pooling or replicas when traffic data requires it. |
| Routing accuracy | Use a deterministic proximity heuristic. | Add a route provider when accurate travel-time optimization is required. |
| Trust and privacy | Use fictional demo data until authentication exists. | Accept personal trip data after authorization and privacy controls. |

## Build Scope

### Prototype Demonstrated Now

Preferences -> suggestions -> positive voting -> capacity-aware shortlist -> review -> deterministic sequencing -> persisted itinerary -> prepared Trip Rescue prototype.

Supporting prototype utilities include budget estimates, booking-pressure indicators, map/place display and a browser-local Split Bill calculator.

### Build-Phase Priority

- Public deployment and production database configuration.
- Authentication and server-side group authorization.
- Improved Trip Rescue persistence and target-user validation.
- Mobile-browser verification and final accessibility/visual checks.
- Production API configuration, key restrictions and quota checks.

### Stretch / Future

- Live disruption monitoring and live availability/pricing.
- Dynamic alternative generation and itinerary replacement.
- External routing provider integration and itinerary history.
- Real-time collaboration, invitations and notifications.
- Preference-weighted fair consensus, saved Plan B choices and a shared checklist.

### Future Enhancement - Explainable Fair Consensus

A future version could incorporate preference fit and bounded traveller representation into ranking while keeping the scoring deterministic, reproducible and explainable. This is a proposed extension, not current `main` functionality. No fairness formula or Group Match score is presented as implemented.

---

# 6. Impact

## Target Users

The primary users are university students, small friend groups and group organisers planning leisure trips. Solo travellers are a secondary audience using the same structured flow with one member.

## Before vs After

| Before Trippy | With Trippy |
|---|---|
| Ideas scattered across chat and saved-place lists | Suggestions collected inside one trip |
| Preferences are informal and easy to overlook | Each traveller records structured preferences |
| Poll results still require manual planning | Votes feed a capacity-aware shortlist |
| Winners are copied into a separate itinerary | Confirmed places feed a persisted itinerary builder |
| A change restarts discussion across tools | The Trip Rescue prototype keeps the prepared response decision in the trip flow |

The expected outcome is less manual coordination, clearer participation and a faster path from opinions to an actionable plan. These are hypotheses until target-user testing is completed.

## Validation Hypotheses

| Hypothesis | Future validation metric |
|---|---|
| Faster planning decisions | Time from suggestions to confirmed shortlist |
| Lower organiser workload | Manual coordination steps outside Trippy |
| Better preference visibility | Traveller preferences represented in selected activities |
| Easier disruption response | Steps and time needed to agree on a replacement |

These are validation hypotheses until target-user testing is completed. No user-test results are claimed here.

## Scalability

```text
Current prototype
        |
Public deployment
        |
Accounts and invitations
        |
Persistent collaborative trips
        |
External availability and routing services
        |
Dynamic Trip Rescue
        |
Reusable trip patterns and broader group use
```

Trippy does not need to become a booking platform. Its core role is the decision layer connecting traveller preferences, practical constraints and an actionable itinerary.

---

# 7. Competition Requirement Coverage

| Challenge requirement | Current evidence on `main` | Status |
|---|---|---|
| Budgeting | Trip budget estimates plus browser-local Split Bill calculator | Prototype |
| Itinerary building | Persisted day-by-day itinerary from the confirmed shortlist | Prototype |
| Combining group preferences | Preference profiles, shared suggestions and positive voting capture group input; preference profiles do not currently weight shortlist ranking. | Prototype / partial |
| Coordinating travellers | Shared stages, participation and one trip workspace | Prototype |
| Adjusting plans when something unexpected happens | A prepared Trip Rescue event and prepared replacement demonstrate the recovery decision flow; live disruption detection, dynamic alternative generation and automatic itinerary replacement are build-phase capabilities. | Prototype / partial |
| Faster, easier and less stressful planning | One visible flow reduces manual hand-offs; validation is still needed | Expected, not measured |
| Solo and group travel | The same structured trip flow works with one member or multiple members; the prototype does not yet provide a dedicated solo-specific UX. | Prototype / partial |
| Deployable solution | Node/PostgreSQL architecture is deployable; public URL is missing | Evidence needed |
| Responsive web experience | Responsive styles are present; final device QA is pending | Verify |
| Accessibility | Semantic foundation exists; formal audit is pending | Verify |

The two most important build-phase gaps are preference-aware decision logic and dynamic plan adjustment, because both map directly to the challenge's core outcomes. The current prototype already demonstrates the surrounding end-to-end flow, while these deeper behaviours remain clearly separated as future implementation work.

---

# 8. Presentation Plan

The presentation follows the same product story as the prototype:

```text
Problem -> Preferences -> Shared Suggestions -> Voting
-> Capacity-aware Shortlist -> Itinerary
-> Trip Rescue prototype -> Build plan -> Impact
```

Target **4 minutes 30 seconds** and do not exceed **5 minutes**. Upload the video as **Unlisted** and title it with the team name only.

| Time | Content | Evidence to show |
|---:|---|---|
| 0:00-0:35 | Problem and target user | Fragmented tools and group coordination cost |
| 0:35-1:05 | Solution and differentiator | Visible decision flow and capacity-aware shortlist |
| 1:05-3:10 | Prototype demo | Preferences -> suggestions -> votes -> shortlist -> itinerary -> rescue |
| 3:10-3:50 | Tech and feasibility | Next.js, Prisma, PostgreSQL, Google services and narrow scope |
| 3:50-4:30 | Impact and close | Before/after and measurable validation hypotheses |

**Trip Rescue presenter guardrail:** Describe it as a prepared disruption scenario and prepared replacement. Do not claim live disruption detection, live alternative search or real-time availability verification.

---

# 9. Local Development

## Requirements

- Node.js and npm
- PostgreSQL database
- Optional Google Maps JavaScript/Places API key

## Setup

```bash
git clone https://github.com/qianyi-11/TravPlanner.git
cd TravPlanner
git checkout main
npm install
```

Create `.env`:

```dotenv
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE"
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY="OPTIONAL_BROWSER_KEY"
```

Prepare and seed the database, then start the app:

```bash
npm run db:generate
npm run db:push
npm run db:seed
npm run dev
```

Open `http://localhost:3000`.

## Repository Structure

```text
TravPlanner/
├── app/
│   ├── api/          # Prototype API route handlers
│   ├── groups/       # Group and trip setup
│   └── trips/        # Planning stages, itinerary and rescue
├── components/
│   ├── trip/         # Trip UI and calculators
│   └── ui/            # Shared interface components
├── lib/
│   ├── server/       # Prisma mapping and server utilities
│   ├── store.ts      # Client state and API actions
│   └── *.ts          # Planning, geography and settlement logic
├── prisma/
│   ├── schema.prisma # PostgreSQL schema
│   └── seed.ts       # Deterministic prototype data
└── public/
```

## Design Reference

**Original Design Planning:** [CodeNection 2026 - Google Docs](https://docs.google.com/document/d/1fiUs3ogM99BjK-oBim_cT2xnQYW83PK6e-k9U4fCZr4/edit)

The current `main` implementation is the source of truth for prototype claims. Future designs and other branches are not described as implemented here.

---

# 10. Final Submission Checklist

- [ ] Add and incognito-test the public UI prototype link.
- [ ] Finalize public deployment and verify the hosted core flow.
- [ ] Finalize and document the web hosting and managed PostgreSQL providers.
- [ ] Add 4-8 current screenshots with captions.
- [ ] Record target-user validation and resulting refinements.
- [ ] Add and incognito-test the public slides link.
- [ ] Add and incognito-test the 3-5 minute unlisted YouTube link.
- [ ] Confirm the video title is the team name only.
- [ ] Verify the deployed flow on desktop and mobile browsers.
- [ ] Verify Google API restrictions, quota and demo data.
- [ ] Run accessibility and visual-consistency checks.

## Submission Links

- **GitHub:** [https://github.com/qianyi-11/TravPlanner](https://github.com/qianyi-11/TravPlanner)
- **Live Prototype:** TODO - required before submission
- **Video Presentation:** TODO - required before submission
- **Presentation Slides:** TODO - required before submission
- **UI / Design:** TODO - add only if a separate public design link is required

