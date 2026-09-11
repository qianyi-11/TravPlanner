import { isValidDateRange, isValidDateString, timeToMinutes } from "./date-time";
import { createSameDayInterval, intervalContains, intervalsOverlap, type SameDayInterval } from "./time-intervals";
import type { ItineraryDay } from "./types";

export type ItineraryValidationResult = { valid: true } | { valid: false; reasons: string[] };

export function validateBuiltItinerary({
  trip,
  shortlistPlaceIds,
  itinerary,
}: {
  trip: { startDate: string; endDate: string; dailyStart: string; dailyEnd: string };
  shortlistPlaceIds: string[];
  itinerary: ItineraryDay[];
}): ItineraryValidationResult {
  const reasons: string[] = [];
  const dailyStart = timeToMinutes(trip.dailyStart);
  const dailyEnd = timeToMinutes(trip.dailyEnd);
  if (!isValidDateRange(trip.startDate, trip.endDate)) reasons.push("Trip date range is invalid");
  if (dailyStart === null || dailyEnd === null || dailyStart >= dailyEnd) reasons.push("Trip daily window is invalid");
  if (new Set(shortlistPlaceIds).size !== shortlistPlaceIds.length) reasons.push("Shortlist contains duplicate place IDs");

  const activityIds = new Set<string>();
  const placeCounts = new Map<string, number>();
  let previousDay = 0;
  let previousDate = "";
  for (const day of itinerary) {
    if (!Number.isInteger(day.day) || day.day <= previousDay) reasons.push("Itinerary day numbers must be positive, unique, and ordered");
    previousDay = day.day;
    if (!isValidDateString(day.date) || day.date < trip.startDate || day.date > trip.endDate || (previousDate && day.date < previousDate)) {
      reasons.push(`Itinerary day ${day.day} has an invalid or out-of-range date`);
    }
    previousDate = day.date;
    const scheduled: SameDayInterval[] = [];
    for (const activity of day.activities) {
      if (typeof activity.id !== "string" || !activity.id.trim() || activityIds.has(activity.id)) reasons.push("Activity IDs must be non-empty and unique");
      else activityIds.add(activity.id);
      const start = timeToMinutes(activity.time);
      const validDuration = Number.isInteger(activity.durationMinutes) && (activity.type === "transit" ? activity.durationMinutes >= 0 : activity.durationMinutes > 0);
      const zeroLengthTransit = activity.type === "transit" && activity.durationMinutes === 0;
      const interval = start === null || !validDuration || zeroLengthTransit ? null : createSameDayInterval(day.date, start, start + activity.durationMinutes);
      if (start === null || !validDuration || dailyStart === null || dailyEnd === null) reasons.push(`Activity ${activity.id} has an invalid time or duration`);
      else if (zeroLengthTransit) {
        if (start < dailyStart || start > dailyEnd) reasons.push(`Activity ${activity.id} falls outside the daily window`);
      }
      else if (!interval) reasons.push(`Activity ${activity.id} has an invalid time or duration`);
      else {
        const dayWindow = createSameDayInterval(day.date, dailyStart, dailyEnd);
        if (!dayWindow || !intervalContains(dayWindow, interval)) reasons.push(`Activity ${activity.id} falls outside the daily window`);
        if (activity.type !== "transit") {
          if (scheduled.some((existing) => intervalsOverlap(existing, interval))) reasons.push(`Activity ${activity.id} overlaps another activity`);
          scheduled.push(interval);
        }
      }
      if (activity.type === "place") {
        if (!activity.placeId || !shortlistPlaceIds.includes(activity.placeId)) reasons.push(`Activity ${activity.id} has an unknown place ID`);
        else placeCounts.set(activity.placeId, (placeCounts.get(activity.placeId) ?? 0) + 1);
      }
    }
  }
  for (const placeId of shortlistPlaceIds) {
    if (placeCounts.get(placeId) !== 1) reasons.push(`Shortlisted place ${placeId} must appear exactly once`);
  }
  return reasons.length ? { valid: false, reasons } : { valid: true };
}
