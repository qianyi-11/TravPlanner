Phase completed: Phase 26 — Unsupported Prototype Feature Cleanup
Commit: pending
Objective completed: Audited visible frontend features and confirmed unsupported prototype flows are removed or reduced to compatibility redirects.

Files added: None.
Files modified:
- Plan.txt

Files moved/renamed: None.
Files deleted: None.

Important implementation decisions:
- Live/Rescue, manual shortlist validation, fake ratings, availability, price pressure, generic preference profiles, and frontend-only stage mutations are no longer visible features.
- Legacy groups, route, live, shortlist, and validate paths remain redirects only for compatibility.
- Backend-supported candidate/place facts and finalized itinerary data remain the only displayed domain data.

Backend/contracts used:
- Existing trip phase, candidate, review, and itinerary version contracts.

Validation performed:
- build: Not run; no runtime code changed.
- typecheck: Existing frontend typecheck passed in Phase 25.
- lint: Existing lint passed in Phase 25.
- tests: Not run for this phase.

Known issues or blockers:
- Compatibility redirect files remain intentionally present; they contain no mock domain state.

Important context for next phase:
- Standardize callable/realtime error messages and stop exposing raw Firebase error text in core pages.

Next phase:
- Phase 27 — Error Handling
