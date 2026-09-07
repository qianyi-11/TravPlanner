import { authError } from "./errors";
import type { TripAuthContext } from "./types";

export function requireCurrentVersion(
  context: TripAuthContext,
  expectedItineraryVersionId: string,
): void {
  if (
    !context.trip.currentItineraryVersionId ||
    context.trip.currentItineraryVersionId !== expectedItineraryVersionId
  ) {
    throw authError(
      "STALE_ITINERARY_VERSION",
      "The authoritative itinerary version has changed.",
      {
        tripId: context.tripId,
        expectedItineraryVersionId,
        currentItineraryVersionId:
          context.trip.currentItineraryVersionId ?? null,
      },
    );
  }
}
