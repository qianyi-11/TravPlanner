Phase completed: Phase 40 — Google Places Autocomplete
Commit: 5dcb976
Objective completed: Replaced normal Create Trip and candidate submission Place ID/coordinate entry with browser-side Google Places selection.

Files added:
- components/places/PlaceAutocomplete.tsx

Files modified:
- app/trips/new/page.tsx
- app/trips/[tripId]/places/page.tsx
- Plan.txt

Files moved/renamed: None.
Files deleted: None.

Frontend files compared with `frontend` branch:
- app/trips/new/page.tsx
- app/trips/[tripId]/places/page.tsx

Important UI-preservation decisions:
- Kept the existing form cards, spacing, date/time controls, preference controls, and candidate card layout.
- Replaced only the unsupported manual provider fields with the provider-owned autocomplete widget.

Important implementation decisions:
- Uses the current Google Maps JavaScript `PlaceAutocompleteElement`, `gmp-select`, and `fetchFields` flow through a native loader; no new package was added.
- Normalizes selection to placeId, name, lat, lng, and optional formattedAddress.
- Missing or failed browser Maps configuration is shown as a clear inline state and never crashes the page.
- The callable API still receives the Place ID and backend validation remains authoritative.

Backend/contracts used:
- createTrip input contract and submitCandidate input contract; backend place resolution/validation remains unchanged.

Validation performed:
- build: Passed `npm.cmd run build:frontend`.
- typecheck: Passed `npm.cmd run typecheck:frontend` after final fix.
- lint: Passed `npm.cmd run lint -- --quiet` after final fix; full lint has only existing repository warnings.
- tests: Not rerun; this phase changes browser wiring only and Phase 39 unit validation passed.
- emulator/security checks: Not run; no backend or rule changes.

Known issues or blockers:
- Live selection requires a configured browser key and enabled Places API (New); this environment has no production provider credentials.
- README.md contains unrelated pre-existing working-tree changes and remains uncommitted.

External configuration still required:
- `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`, HTTP referrer/API restrictions, and Places API (New) enablement.

Important context for next phase:
- Add `build:web` and deployment documentation without exposing `GOOGLE_MAPS_API_KEY` to the browser.

Next phase:
- Phase 41 — Deployment Readiness
