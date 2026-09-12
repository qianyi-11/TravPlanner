import type { ItineraryDay, TripRescueEvent } from "./types";

export function applyRescueReplacement(
  itinerary: ItineraryDay[],
  affectedActivityId: string,
  alternative: NonNullable<TripRescueEvent["alternative"]>
): ItineraryDay[] {
  let found = false;
  const updated = itinerary.map((day) => ({
    ...day,
    activities: day.activities.map((activity) => {
      if (activity.id !== affectedActivityId) return activity;
      found = true;
      const updated = { ...activity, placeId: alternative.placeId, label: alternative.label, estimatedCost: alternative.cost };
      if ("backupPlaceId" in activity) updated.backupPlaceId = null;
      return updated;
    }),
  }));
  if (!found) throw new Error("Affected itinerary activity not found");
  return updated;
}
