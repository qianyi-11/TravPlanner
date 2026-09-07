import type { TripPhase } from "@travel-planner/shared";
import { authError } from "./errors";
import type { TripAuthContext } from "./types";

export function requirePhase(
  context: TripAuthContext,
  allowed: readonly TripPhase[],
): void {
  if (!allowed.includes(context.trip.phase)) {
    throw authError(
      "INVALID_PHASE",
      `Action is not allowed in phase ${context.trip.phase}.`,
      {
        tripId: context.tripId,
        phase: context.trip.phase,
        allowedPhases: allowed,
      },
    );
  }
}
