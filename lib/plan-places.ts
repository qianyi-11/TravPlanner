import type { Trip } from "./types";

export function getActivePlanPlaceIds(trip: Pick<Trip, "itinerary" | "shortlistPlaceIds">): string[] {
  const itineraryIds = trip.itinerary.flatMap((day) =>
    day.activities.filter((activity) => activity.type === "place" && activity.placeId).map((activity) => activity.placeId as string)
  );
  return [...new Set(itineraryIds.length ? itineraryIds : trip.shortlistPlaceIds.filter(Boolean))];
}
