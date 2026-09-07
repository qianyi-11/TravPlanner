import { authError } from "./errors";
import type { TripAuthContext } from "./types";

export function requirePlanningCycle(
  context: TripAuthContext,
  expectedPlanningCycle: number,
): void {
  if (context.trip.planningCycle !== expectedPlanningCycle) {
    throw authError(
      "STALE_PLANNING_CYCLE",
      "The trip planning cycle has changed.",
      {
        tripId: context.tripId,
        expectedPlanningCycle,
        currentPlanningCycle: context.trip.planningCycle,
      },
    );
  }
}
