import type {
  ConfirmCriticalFactInput,
  ProposeCriticalFactInput,
} from "@travel-planner/shared";
import {
  authError,
  requireCurrentVersion,
  requirePlanningCycle,
  type TripAuthContext,
} from "../auth";

export function requireCriticalFactExpectedAuthority(
  context: TripAuthContext,
  input: ProposeCriticalFactInput | ConfirmCriticalFactInput,
): void {
  if (context.trip.phase === "FINALIZED") {
    if (!("expectedItineraryVersionId" in input)) {
      throw authError(
        "INVALID_INPUT",
        "FINALIZED Critical Fact actions require expectedItineraryVersionId.",
        { tripId: context.tripId },
      );
    }
    requireCurrentVersion(context, input.expectedItineraryVersionId);
    return;
  }

  if (!("expectedPlanningCycle" in input)) {
    throw authError(
      "INVALID_INPUT",
      "Pre-finalization Critical Fact actions require expectedPlanningCycle.",
      { tripId: context.tripId },
    );
  }
  requirePlanningCycle(context, input.expectedPlanningCycle);
}
