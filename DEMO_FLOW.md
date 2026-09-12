# Trippy Demo Flow and Submission Run Sheet

This is the detailed walkthrough for the CodeNection 2026 **Planning an Escape - Travel Planner** submission. It follows the seeded `Japan Adventure` trip and demonstrates the complete MVP journey in a single story:

```text
Different wishes -> Fair Group Consensus -> Shared itinerary -> Prepared recovery
```

## Run the flow

From the repository root:

```bash
npm run demo
```

The deterministic demo creates `prisma/demo.db`, signs in through **Try Competition Demo**, seeds the fixture, and runs the browser flow on port 3100. It does not modify the normal development database.

For a 3-5 minute recording with readable pauses:

```cmd
set DEMO_PAUSE_MS=8500&& npm run demo:record
```

The local recording is written to `demo-output/travplanner-demo.webm`. The recommended YouTube video still needs a human voiceover, team-name title, and unlisted upload.

For the eight README screenshots (captured at 88% browser zoom):

```cmd
set DEMO_SCREENSHOTS=1&& npm run demo
```

They are saved under `public/submission-screenshots/` and cover the dashboard, preferences, Fair Group Consensus, itinerary, Plan B/checklist, Split Bill, Trip Rescue and final plan.

## Demo story

The audience is a student or friend group planning Japan together. Each traveller can have a different interest, budget, must-do and dislike. Trippy makes the group decision visible, shows when fairness changes a close choice, carries the result into an itinerary, and keeps a prepared backup available when plans change.

## Detailed walkthrough

The times below are targets for a roughly 4:30 presentation. They are cues, not automated test requirements.

| Time | Screen / action | What to show | Suggested narration and rubric evidence |
|---|---|---|---|
| 0:00-0:15 | Landing page `/` | Pause on “Build one fair plan from everyone's travel wishes”, the four-step strip, and **Try Competition Demo**. Click the demo entry. | “Group travel is not just booking; it is reconciling different people. Trippy turns preferences, must-dos, dislikes and votes into one fair plan.” Covers problem context, target user, clarity and the USP. |
| 0:15-0:35 | Trip setup `/trips/trip-japan` | Show `Japan Adventure`, destinations `Tokyo - Kyoto - Osaka`, dates, budget, group size and the visible planning stage. | “The trip has one shared workspace instead of separate chats, maps and spreadsheets.” Covers end-to-end scope and usability. |
| 0:35-0:55 | Preferences `/trips/trip-japan/preferences` | Show personal and group preferences, food choices, pace, personal budget and the group summary. Point at **Personal budget**. | “The decision starts with individual signals, not a majority vote alone.” Covers target-user fit, data inputs and design rationale. |
| 0:55-1:15 | Voting `/trips/trip-japan/vote` | Show trip-scoped place cards, vote count and the selected **Voted** state. Do not claim that voting itself is the novelty. | “Votes are one input. The important step is how Trippy combines them with preferences and representation.” Covers differentiation from ordinary polls. |
| 1:15-1:55 | Fair Group Consensus `/trips/trip-japan/vote/results` | Set shortlist capacity to `10`. Show selected and unselected candidates, base score, fair score, representation percentage, selection reasons and the trade-off panel. | “At capacity 10, a close choice changes because it represents a traveller who would otherwise be overlooked. The UI exposes the baseline choice, affected traveller and exact reason.” This is the primary creativity and novelty proof. |
| 1:55-2:10 | Consensus comparison | Change capacity from `10` to `11` and show the trade-off disappear; return to `10`. Click **Confirm shortlist**. | “At capacity 11, there is enough room for both choices. This makes the fairness adjustment testable rather than a hidden claim.” Covers explainability, technical viability and presentation structure. |
| 2:10-2:30 | Itinerary `/trips/trip-japan/itinerary` | Show day-by-day activities, then open **Day 3 - teamLab & Skytree** and show `teamLab Borderless`. | “The confirmed shortlist becomes a persisted day-by-day plan, with timing and estimated spend kept visible.” Covers feasibility, completeness and impact. |
| 2:30-2:55 | Plan B `/trips/trip-japan/plan` | Open Day 3, open Plan B for the teamLab stop, select `Tokyo Metropolitan Government Building`, save it, and show the saved summary. | “The group can prepare a backup before something goes wrong. This is a deliberate, feasible MVP boundary; it is not pretending to detect live disruptions.” Covers scope realism and the secondary twist. |
| 2:55-3:10 | Shared checklist | On the Plan page, check **Confirm Kyoto hotel** and show the completed state and assigned member. | “Preparation is shared with the group, so the organiser is not carrying every follow-up alone.” Covers coordination, usability and impact. |
| 3:10-3:30 | Split Bill `/trips/trip-japan/split-bill` | Show the seeded `Izakaya dinner`, total `RM 240.00`, click **Calculate**, and show the saved per-person breakdown. | “Known shared costs are divided in the same workspace. The prototype is explicit that this is a shared snapshot, not settlement-grade accounting.” Covers feasibility and honest constraints. |
| 3:30-3:55 | Trip Rescue `/trips/trip-japan/live` | Show the prepared event, **Your saved Plan B**, and `Tokyo Metropolitan Government Building`. Click **Accept replacement**. | “When the planned stop is affected, the group can accept the prepared alternative. One action updates the itinerary for everyone.” Covers effectiveness, resilience and the before/after story. |
| 3:55-4:15 | Updated itinerary | Return to `/trips/trip-japan/itinerary`, open Day 3, show `Tokyo Metropolitan Government Building` and that `teamLab Borderless` is gone. Reload and show the same result. | “The change is persisted, not just a front-end animation. The shared plan remains the source of truth after refresh.” Covers technical viability and trust. |
| 4:15-4:30 | Final plan `/trips/trip-japan/plan` | Show the final active plan, shared checklist and the completed hotel task. End on the complete workspace. | “Trippy replaces scattered negotiation with one visible, fair and adaptable group plan. The next production steps are live providers, real-time collaboration and a public deployment.” Covers impact, scalability and closing persuasiveness. |

## Claims to keep precise

- **Primary USP:** Fair Group Consensus is deterministic, server-authoritative and explainable. It can show when a representation adjustment changes a close shortlist decision.
- **Secondary feature:** Trip Rescue uses a prepared event and saved Plan B. It does not claim live disruption detection, live availability, or automatic booking.
- **Google data:** Saved place facts are provider snapshots. Opening hours, availability, price level and travel minutes are not guaranteed live values.
- **Budget:** The prototype shows known estimated spend and a shared Split Bill snapshot; it is not a payment or settlement ledger.
- **Routing:** The sequence preview is geographic grouping with estimated travel time, not live route optimisation.

## Rubric evidence map

| Category | Highest-band evidence to submit |
|---|---|
| Ideation (25%) | README alternatives table, problem/evolution/user-flow diagrams, documented pivots, and dated mentor feedback with the resulting decisions. |
| Creativity and novelty (15%) | Landing-page USP plus the capacity `10 -> 11 -> 10` comparison. Explain why visible representation trade-offs are different from ordinary voting. |
| Feasibility (15%) | README stack and architecture, deterministic seeded flow, isolated SQLite demo, PostgreSQL production direction, explicit limitations, and core-vs-stretch scope. |
| Presentation (15%) | Keep the problem -> solution -> consensus proof -> shared plan -> rescue -> impact order. Narrate the cues above and keep the final upload between 3:00 and 5:00. |
| Design (10%) | Show the complete flow, consistent visual system, stage progression, clear controls, saved states and persistence after refresh. |
| Impact (20%) | Name the target group (student/friend groups of roughly 3-8), explain the before/after reduction in negotiation overhead, and describe the path from a local seeded demo to a hosted collaborative product. |

## Submission checklist still requiring external evidence

- Replace the README `TODO` team name and member fields.
- Add a public deployed prototype URL and test it in an incognito window.
- Add a public slides link and the unlisted YouTube link; title the video with the team name only.
- Include 6-8 current screenshots or an equivalent public interactive prototype with captions.
- Add results from three short target-user sessions (completion, understanding, friction and resulting changes). Do not invent these results.
- Keep this run sheet and the README claims aligned with the actual implemented limitations.
