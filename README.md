# Trippy by OpenCrab

> Plan your trip together.

**Team:** OpenCrab

**Team Members:** Lee Qian Yi, Cha Zi Yu

**Problem Statement:** Planning an Escape — Travel Planner

**Video Presentation:** TODO — add a 3–5 minute unlisted YouTube link

**Presentation Slides:** TODO — add a public link

**UI Prototype:** TODO — add a public link that opens without a personal account

**Repository:** https://github.com/qianyi-11/TravPlanner

---

# 1. Project Overview

## The Problem

Trip information is fragmented across group chats, maps, polls, itineraries, budgets and expense tools. For small groups of friends and university students, the harder problem is coordination: travellers have different interests, budgets, priorities and schedules, but still need one practical plan. Organisers repeatedly copy information between tools, chase responses and resolve disagreements manually; unexpected changes add more coordination during the trip.

The people affected are the organiser, every traveller whose preferences must be represented, and activity or transport providers whose constraints shape the plan. Existing planners such as Wanderlog show the value of combining itineraries, maps, budgeting and collaboration. Trippy focuses on the decision process before the itinerary: **turning individual preferences, suggestions and votes into one visible shared plan**.

## Our Solution

Trippy is a collaborative web travel planner for solo travellers and small groups. Travellers create a trip, record preferences, suggest places and vote before the app creates a capacity-aware shortlist. The shortlist is reviewed, sequenced with a deterministic proximity heuristic and converted into a persisted day-by-day itinerary. A prepared Trip Rescue event demonstrates the decision flow for responding when a plan changes.

### Current `main` Prototype Features

- Group and trip creation, editing and deletion
- Member preference profiles
- Collaborative place suggestions and trip-scoped voting
- Google Places search and Google Maps display when a browser API key is configured
- Vote-ranked, capacity-aware shortlist based on trip length, daily hours, meals, visit duration and estimated travel time
- Shortlist review and validation stage
- Deterministic nearest-neighbour place sequencing using saved coordinates; this is a heuristic, not globally optimal routing
- Persisted day-by-day itinerary and final-plan views
- Prototype budget estimates and stored booking-pressure indicators; neither is live pricing
- Split Bill and currency-conversion calculators stored in the current browser, not a shared expense ledger
- Trip Rescue using prepared events and alternatives, with the event's resolved status persisted
- Prisma persistence backed by PostgreSQL

### Current Limitations

- No sign-in or server-side user/group authorization on `main`
- No Fair Group Consensus scoring, representation bonus or preference-weighted ranking; shortlist order is vote-based
- No saved Plan B per stop or shared checklist
- No real-time collaboration, live availability, live pricing, disruption monitoring or automatic rescue detection
- Resolving a Trip Rescue event does not replace the affected itinerary activity on `main`
- Google Places depends on a configured client-side key and service quota
- Split Bill data is local to one browser and is not persisted to the trip database
- No public deployment, public prototype link or current screenshot set has been supplied
- The dedicated multi-user flow is the product focus; solo travel uses the same flow with one member

### Core User Flow

```text
Create Group → Create Trip → Set Preferences → Suggest Places → Vote
→ Capacity-aware Shortlist → Validate → Sequence Preview
→ Build Itinerary → Final Plan → Review and Resolve Trip Rescue Event
```

### Submission Blockers

| Blocker | Evidence needed before submission |
|---|---|
| Team identity | Team name and member names in the header |
| Public prototype | Hosted URL that opens in an incognito window without a personal account |
| Prototype evidence | 4–8 current `main` screenshots with short captions |
| Impact validation | Short user sessions with target travellers; record task completion, understanding, friction and resulting changes |
| Presentation | Public slides and a 3–5 minute unlisted YouTube video titled with the team name |
| Link verification | Prototype, slides and video opened successfully in an incognito window |

---

# 2. Ideation & Process

## 2.1 Ideas We Considered

Chosen ideas are listed first, followed by simplified, deferred or replaced directions.

| Idea | Decision | Why |
|---|---|---|
| Collaborative group planner | **Kept** | Directly addresses fragmented planning and group coordination. |
| Preferences, suggestions and voting | **Kept** | Gives every traveller structured input before itinerary building. |
| Capacity-aware shortlist | **Kept** | Connects votes to the time, meal and travel capacity of the trip. |
| Deterministic itinerary builder | **Kept** | Produces an understandable schedule without an opaque AI dependency. |
| Trip Rescue | **Kept in simplified form** | A prepared event and alternative demonstrate the response decision without pretending to detect or apply itinerary changes automatically. |
| Budget and Split Bill | **Simplified** | The prototype estimates costs and calculates settlements without claiming live prices or a production ledger. |
| Fair Group Consensus | **Deferred on `main`** | Preference-weighted scoring and representation trade-offs are not implemented on this branch. |
| Group Availability Poll | **Deferred** | Useful for schedule overlap, but outside the core planning flow. |
| Meeting Point Recommendation | **Deferred** | Requires additional origin and travel-time data. |
| Saved Plan B per stop | **Deferred on `main`** | Prepared rescue alternatives cover the prototype story with less state. |
| Shared Checklist | **Deferred on `main`** | Helpful for preparation, but not required to prove group decision-making. |
| Flight and hotel integration | **Deferred** | Provider and operational complexity would distract from the core prototype. |
| URL-to-travel-data extraction | **Deferred** | Convenient input, but it does not strengthen the central concept enough. |
| AI-generated itinerary | **Deferred** | Deterministic behaviour is easier to explain, test and demonstrate reliably. |
| Large production platform | **Replaced** | A narrower end-to-end prototype is more achievable and persuasive. |

### Technical and Scope Decisions

| Direction | Decision | Reason |
|---|---|---|
| Firebase-oriented architecture | **Replaced by Next.js + Prisma** | One application keeps the prototype small and deployable. |
| PostgreSQL | **Kept on `main`** | Matches the current Prisma schema and a deployable server database. |
| Authentication and role workflow | **Deferred on `main`** | It needs a complete identity and authorization design, not a visual-only shortcut. |
| Itinerary history/versioning | **Deferred** | One persisted itinerary is enough for the core journey. |
| Live disruption monitoring | **Deferred** | Trip Rescue demonstrates response, not detection. |

## 2.2 Ideation Boards

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

This problem tree separates the causes of coordination overhead from its effects on organisers and travellers.

### Idea Map

```mermaid
mindmap
  root((Less group-trip coordination))
    Gather input
      Preferences
      Place suggestions
      Votes
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
      Prepared event
      Alternative
      Resolve prepared event
    Deferred
      Availability poll
      Meeting point
      Bookings
      Live disruption signals
```

The map shows both the selected concept and alternative directions that were intentionally left outside the prototype.

### Idea Evolution, Pivots and Dead Ends

```mermaid
flowchart TD
    A[Version 1: broad production travel platform]
    A --> A1[Firebase architecture]
    A --> A2[Flight and hotel integration]
    A --> A3[Approval and itinerary history]
    A1 -->|Dead end: too much infrastructure| B
    A2 -->|Dead end: provider complexity| B
    A3 -->|Dead end: outside core journey| B

    B[Version 2: suggestions and group voting]
    M[Mentor feedback: voting alone is common] --> B
    B -->|Pivot: make the decision process visible| C[Version 3: preferences → votes → shortlist]

    C --> C1[Availability poll]
    C --> C2[Meeting-point recommendation]
    C1 -->|Deferred: schedule logic outside MVP| D
    C2 -->|Deferred: needs member-origin data| D

    C --> D[Version 4: capacity-aware shortlist]
    D --> E[Deterministic itinerary]
    E --> F[Current main: complete planning flow + prepared Trip Rescue]
```

This diagram shows the discarded technical and product branches, the feedback that triggered the main pivot, and what survived into the current prototype. On `main`, voting remains the ranking input; richer fairness scoring is a later direction, not a current claim.

### Final User Flow

```mermaid
flowchart LR
    A[Create group and trip] --> B[Set preferences]
    B --> C[Suggest places]
    C --> D[Vote]
    D --> E[Review capacity-aware shortlist]
    E --> F[Validate selected places]
    F --> G[Preview proximity sequence]
    G --> H[Build day-by-day itinerary]
    H --> I[Review final plan and budget]
    I --> J[Review prepared Trip Rescue event]
```

The final flow shows how individual input becomes one actionable group plan. Each step corresponds to a screen in the current prototype.

## 2.3 Iteration and Idea Evolution

| Iteration | Trigger / problem discovered | What changed | Direction dropped or deferred | Result |
|---|---|---|---|---|
| Version 1 — broad platform | Authentication, integrations, approvals and versioning made the scope too large. | Reduced the concept to one demonstrable group-planning journey. | Firebase-oriented architecture, booking integrations, approval workflow and itinerary history. | A smaller prototype that could be completed end to end. |
| Version 2 — collaborative voting | Voting collected opinions but still left the organiser to turn winners into a practical schedule. | Connected suggestions and votes directly to shortlist creation. | Voting as a standalone feature. | Group input became a planning input rather than an isolated poll. |
| Version 3 — visible group decisions | Mentor feedback said voting alone was common and insufficiently distinctive. | Made every transition from preferences to itinerary visible. | An opaque or instantly generated itinerary. | Reviewers can follow how the plan was formed. |
| Version 4 — realistic shortlist | A simple top-vote list could select more places than the trip could hold. | Added deterministic capacity reasoning using days, daily hours, meals, visit duration and estimated travel. | A fixed shortlist size and AI-generated ranking. | The chosen places fit the shape of the trip and the reasoning is shown. |
| Version 5 — focused supporting features | Availability polling and meeting-point logic required more schedule and origin data than the MVP contained. | Deferred both and kept the itinerary journey primary. | Availability poll and meeting-point recommendation. | Scope remained achievable without hiding unfinished systems. |
| Current `main` — complete prototype | The agreed plan still needed a way to demonstrate response when circumstances change. | Added a prepared Trip Rescue event after the final plan. | Live disruption detection and automatic itinerary replacement. | Preferences → votes → capacity-aware shortlist → itinerary → prepared rescue decision. |

### What the Dead Ends Taught Us

| Dead end | Lesson carried into the final concept |
|---|---|
| Large production architecture | Prove the user journey before adding infrastructure. |
| Voting as the differentiator | A vote matters only when it changes the resulting plan. |
| Fixed shortlist size | Capacity should reflect the real trip window, not an arbitrary number. |
| AI-generated itinerary | Deterministic rules are easier to explain and demonstrate reliably. |
| Live disruption monitoring | Demonstrate the response decision honestly before adding external signals. |

## 2.4 Mentor Consultation

| Date | Mentor | Feedback received | Team decision / change |
|---|---|---|---|
| 09/09/2026 | Mentor 1 | Consider a calendar or availability input for groups with different schedules. | Considered a Group Availability Poll; deferred it to protect the core planning scope. |
| 09/09/2026 | Mentor 1 | Consider travel time when members need a practical meeting point. | Considered a Meeting Point Recommendation; deferred it because member-origin data is outside the MVP. |
| 09/09/2026 | Mentor 1 | Study existing travel planners such as Wanderlog and clarify why travellers would choose Trippy. | Focused Trippy on the visible group decision process before the itinerary. |
| 09/09/2026 | Mentor 1 | Voting needed stronger differentiation and deeper problem analysis. | Connected voting to a capacity-aware shortlist and deterministic planning flow; richer fairness scoring remains deferred on `main`. |
| 09/09/2026 | Mentor 1 | Compare the market and explain what makes Trippy stand out. | Added a conservative comparison centred on Trippy's product emphasis. |
| 09/09/2026 | Mentor 1 | Explore flight-ticket features and automatic travel-data extraction from URLs. | Recorded both ideas and deferred them because they do not strengthen the core MVP enough. |
| 09/09/2026 | Jarod Tan | Research previous hackathon travel and group-planning projects. | Recorded this as a research action; no completed findings are claimed. |
| 09/09/2026 | Jarod Tan | Group voting alone is common and not sufficiently distinctive. | Made voting an input to a visible shortlist-and-planning workflow rather than the innovation itself. |
| 09/09/2026 | Jarod Tan | Find a more memorable or ambitious product direction. | Kept the core realistic and added Trip Rescue as a focused secondary story. |

---

# 3. Design & Prototype

**UI Prototype:** TODO — use the public link from the submission header.

Trippy uses a responsive, stage-based interface so travellers can see what is complete and what happens next. The current `main` branch contains the full screen flow but does not contain submission screenshots. Capture the following 4–8 screens from the deployed `main` build before submission.

| Screen | Interaction to show | Why it matters | Evidence status |
|---|---|---|---|
| Group and trip dashboard | Create or open a group and trip | Gives the group one shared starting point | ⚠️ Capture needed |
| Preferences | Enter one member's interests, food preferences, pace, dislikes and budget | Shows how individual needs enter the plan | ⚠️ Capture needed |
| Suggestions | Search or select places and submit suggestions | Turns discussion into shared candidates | ⚠️ Capture needed |
| Voting results | Show votes, participation and shortlist reasoning | Makes the group decision visible | ⚠️ Capture needed |
| Validation and sequence preview | Review selected places and map order | Creates a checkpoint before scheduling | ⚠️ Capture needed |
| Itinerary and final plan | Show day-by-day timing, travel and estimates | Converts choices into an actionable plan | ⚠️ Capture needed |
| Split Bill | Enter a shared expense and show settlement | Supports coordination during the trip | ⚠️ Capture needed |
| Trip Rescue | Review a prepared alternative and resolve the event | Demonstrates the response decision when plans change | ⚠️ Capture needed |

### UX Principles

- One stage at a time reduces cognitive load.
- Progress and participation remain visible.
- Explanations sit beside the decision they describe.
- Responsive layouts support desktop and mobile browsers.
- Standard headings, labels and buttons provide a basic semantic foundation; a formal accessibility audit is still required.

---

# 4. What Makes It Different

## A Visible Decision Process

Trippy does not begin with an unexplained generated itinerary. It exposes the path:

**Preferences → Suggestions → Voting → Capacity-aware Shortlist → Validation → Sequence Preview → Itinerary**

The twist is not voting by itself; it is connecting a visible group decision to a practical schedule.

## Capacity-aware Shortlisting

Candidates are ranked by group votes, then the shortlist estimates how many meal and sightseeing stops fit. It uses trip dates, daily planning hours, typical visit duration and estimated travel time, and explains the resulting capacity. This is deterministic and auditable; it is not AI consensus or fairness scoring.

## Prepared Trip Rescue

Trip Rescue demonstrates the response decision after planning: a prepared event identifies an affected activity, presents a prepared alternative and can be marked resolved. On `main`, it does not persist the proposed replacement into the itinerary, monitor disruptions or detect them automatically.

## Existing Solution Comparison

| Capability | Common standalone approach | Trippy `main` prototype |
|---|---|---|
| Collecting opinions | Group chat or a separate poll | Preferences, suggestions and trip-scoped votes in the planning flow |
| Turning votes into a plan | Organiser manually copies winners | Capacity-aware shortlist feeds the itinerary builder |
| Explaining the result | Final list with limited context | Visible votes and shortlist-capacity reasoning |
| Sequencing stops | Manual ordering or a routing product | Transparent nearest-neighbour heuristic using saved coordinates |
| Handling a change | Return to chat and edit several tools | Prepared rescue event keeps the response decision in the trip flow; itinerary replacement remains deferred |

This comparison describes Trippy's emphasis; it does not claim that every competing product lacks these capabilities.

---

# 5. Technical Architecture & Feasibility

## 5.1 Tech Stack

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
| Icons | Lucide React | Consistent accessible icon components | Icons still need accompanying text where meaning is not obvious |

## 5.2 System Architecture

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

Prototype mutations use API routes and Prisma rather than relying only on hard-coded front-end state. Authentication and authorization are still missing on `main`, so the hosted prototype must be treated as demonstration data, not a private production service.

## 5.3 Three-Week Build Plan and Scope

### Core / Implemented on `main`

1. Group and trip setup with persistent data.
2. Preferences, collaborative suggestions and voting.
3. Capacity-aware shortlist and review stage.
4. Deterministic proximity sequencing and day-by-day itinerary.
5. Final-plan, budget and map views.
6. Prepared Trip Rescue with persisted event status.
7. Split Bill and currency-conversion calculators.

### Must Finish for Submission

1. Configure and verify a hosted PostgreSQL database and public deployment.
2. Protect and quota the Google API key for the deployed origin.
3. Complete the core journey on desktop and mobile-browser sizes.
4. Capture 4–8 current screenshots and add the public prototype link.
5. Run short target-user tests and document evidence-backed refinements.
6. Add team details, slides and the unlisted video link; verify every link in incognito mode.

### Optional / Stretch

- Authentication and server-side group authorization
- Fair Group Consensus with preference and representation scoring
- Saved Plan B choices and a shared checklist
- Shared, persisted Split Bill records
- Availability polling and meeting-point recommendations
- Live provider pricing, availability and disruption signals
- Route-provider optimisation, itinerary history and real-time collaboration

## 5.4 Resource, Cost and Risk Awareness

| Constraint | Current response | Upgrade trigger |
|---|---|---|
| Three-week build window | Keep one end-to-end journey and defer provider-heavy features | Add stretch work only after the core demo is stable |
| Small team | One Next.js/TypeScript codebase for UI and API | Split services only when scale or ownership requires it |
| Google API quota/cost | Use restricted keys and monitor usage | Add caching or a paid quota only after measured demand |
| Database hosting | Use one managed PostgreSQL instance | Add pooling/replicas when connection or traffic data requires it |
| Routing accuracy | Use a deterministic proximity heuristic | Add a routes provider when real travel-time optimisation is required |
| Trust and privacy | Use fictional demo data until authentication exists | Accept personal trip data only after authorization and privacy controls |

---

# 6. Competition Requirement Coverage

| Challenge requirement | Current evidence on `main` | Status |
|---|---|---|
| Budgeting | Trip budget estimates plus Split Bill calculator | ✅ Prototype |
| Itinerary building | Persisted day-by-day itinerary from confirmed shortlist | ✅ Prototype |
| Combining group preferences | Preferences, suggestions and voting; preferences do not yet affect ranking | ⚠️ Partial |
| Coordinating travellers | Shared stages, participation and one trip workspace | ✅ Prototype |
| Adjusting unexpected plans | Prepared Trip Rescue decision flow; itinerary replacement is not implemented | ⚠️ Partial |
| Faster/easier/less stressful | One visible flow reduces manual hand-offs; user validation is still needed | ⚠️ Expected, not measured |
| Solo and group travel | Group flow works with one member; dedicated solo UX is limited | ⚠️ Partial |
| Deployable solution | Node/PostgreSQL architecture is deployable; public URL is missing | ⚠️ Evidence needed |
| Responsive web experience | Responsive styles are present; final device QA is pending | ⚠️ Verify |
| Accessibility | Semantic foundation exists; formal audit is pending | ⚠️ Verify |

---

# 7. Impact

## Target Users and Stakeholders

The primary users are university students and small friend groups organising leisure trips together. The organiser needs less coordination work; group members need a clear way to contribute and see how the plan was formed. Solo travellers are a secondary audience using the same structured flow with one member.

## Before and After

| Before Trippy | With Trippy |
|---|---|
| Ideas scattered across chat and saved-place lists | Suggestions collected inside one trip |
| Preferences are informal and easy to overlook | Each member records structured preferences |
| Poll results still require manual planning | Votes feed a capacity-aware shortlist |
| Winners are copied into a separate itinerary | Confirmed places feed a persisted itinerary builder |
| A change restarts discussion across tools | Prepared Trip Rescue keeps the response decision in the trip flow |

The expected outcome is less manual coordination, clearer participation and a faster path from opinions to an actionable plan. These are product hypotheses until the target-user sessions listed in the submission blockers are completed.

## Reach and Scalability

The same workflow can extend from student trips to families, clubs and small tour groups. A credible growth path is: secure accounts and invitations → managed deployment → richer preference-aware consensus → live route/provider integrations → reusable templates for larger communities. Each step builds on the current data model without requiring the prototype to pretend those capabilities already exist.

---

# 8. Presentation Plan

Target **4 minutes 30 seconds**; do not exceed **5 minutes**. Upload to YouTube as **Unlisted** and title it with the team name only.

| Time | Content | Evidence to show |
|---:|---|---|
| 0:00–0:35 | Problem and target user | Fragmented tools and group coordination cost |
| 0:35–1:05 | Solution and differentiator | Visible decision flow and capacity-aware shortlist |
| 1:05–3:10 | Prototype demo | Preferences → suggestions → votes → shortlist → itinerary → rescue |
| 3:10–3:50 | Tech and feasibility | Next.js, Prisma, PostgreSQL, Google services and narrow scope |
| 3:50–4:30 | Impact and close | Concrete before/after and why the product is worth building |

Keep detailed ideation and mentor history in this README so the video can focus on the product, demo and impact.

---

# 9. Running the Prototype Locally

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

---

# 10. Repository Structure

```text
TravPlanner/
├── app/
│   ├── api/          # Prototype API route handlers
│   ├── groups/       # Group and trip setup
│   └── trips/        # Planning stages, itinerary and rescue
├── components/
│   ├── trip/         # Trip UI and calculators
│   └── ui/           # Shared interface components
├── lib/
│   ├── server/       # Prisma mapping and server utilities
│   ├── store.ts      # Client state and API actions
│   └── *.ts          # Planning, geography and settlement logic
├── prisma/
│   ├── schema.prisma # PostgreSQL schema
│   └── seed.ts       # Deterministic prototype data
└── public/
```

---

# 11. Design Reference

**Original Design Planning:** [CodeNection 2026 — Google Docs](https://docs.google.com/document/d/1fiUs3ogM99BjK-oBim_cT2xnQYW83PK6e-k9U4fCZr4/edit)

The current `main` implementation is the source of truth for prototype claims. Future designs and other branches are not described as implemented here.

---

# 12. Final Submission Checklist

- [ ] Replace team and member TODOs
- [ ] Add and incognito-test the public prototype link
- [ ] Add 4–8 current screenshots with captions
- [ ] Record target-user validation and resulting refinements
- [ ] Add and incognito-test the public slides link
- [ ] Add and incognito-test the 3–5 minute unlisted YouTube link
- [ ] Confirm the video title is the team name only
- [ ] Verify the deployed core flow on desktop and mobile browsers
- [ ] Verify Google API restrictions, quota and demo data
- [ ] Run accessibility and visual-consistency checks

---

# 13. Submission Links

- **GitHub:** https://github.com/qianyi-11/TravPlanner
- **Live Prototype:** TODO
- **Video Presentation:** TODO
- **Presentation Slides:** TODO
- **UI / Design:** TODO
