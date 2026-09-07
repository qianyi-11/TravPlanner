import type { TripPhase } from "@travel-planner/shared";

export const PHASE_LABELS: Record<TripPhase, string> = { COLLECTING: "Collecting ideas", VOTING: "Candidate voting", PLANNING: "Planning options", REVIEW: "Review", FINALIZED: "Finalized" };
const PHASE_ROUTES: Record<TripPhase, string> = { COLLECTING: "/places", VOTING: "/vote", PLANNING: "/generating", REVIEW: "/itinerary", FINALIZED: "/plan" };

export function getPrimaryTripRoute(trip: { id: string; phase: TripPhase }) { return `/trips/${trip.id}${PHASE_ROUTES[trip.phase]}`; }
export function getPhaseLabel(phase: TripPhase) { return PHASE_LABELS[phase]; }
export function getAvailableTripActions(trip: { phase: TripPhase }, membership: { role?: "OWNER" | "MEMBER" } | null) {
  const owner = membership?.role === "OWNER";
  return { openPrimary: true, canStartVoting: owner && trip.phase === "COLLECTING", canCloseVoting: owner && trip.phase === "VOTING", canGenerate: owner && trip.phase === "PLANNING", canFinalize: owner && trip.phase === "REVIEW" };
}
