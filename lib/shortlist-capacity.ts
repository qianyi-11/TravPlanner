import { daysBetween } from "./utils";
import { timeToMinutes } from "./date-time";
import { isFoodPlace } from "./place-category";
import type { Place, Trip } from "./types";

const TRAVEL_BUFFER_MINUTES = 25;
const END_OF_DAY_BUFFER_MINUTES = 30;

export function recommendShortlistCapacity({
  trip,
  candidates,
}: {
  trip: Pick<Trip, "startDate" | "endDate" | "dailyStart" | "dailyEnd">;
  candidates: Pick<Place, "category" | "estimatedDurationMinutes">[];
}) {
  const start = timeToMinutes(trip.dailyStart);
  const end = timeToMinutes(trip.dailyEnd);
  if (start === null || end === null || start >= end) throw new Error("Invalid trip daily window");

  const days = Math.max(1, daysBetween(trip.startDate, trip.endDate));
  const dailyMinutes = end - start;
  const hoursPerDay = Math.round((dailyMinutes / 60) * 10) / 10;
  const mealDurations = [start <= 9 * 60 + 30 ? 40 : 0, end > 13 * 60 ? 60 : 0, end >= 20 * 60 ? 75 : 0];
  const mealsPerDay = mealDurations.filter(Boolean).length;
  const mealSlots = mealsPerDay * days;
  const foodCount = candidates.filter(isFoodPlace).length;
  const sightseeing = candidates.filter((place) => !isFoodPlace(place));
  const averageVisitMinutes = sightseeing.length
    ? Math.round(sightseeing.reduce((sum, place) => sum + place.estimatedDurationMinutes, 0) / sightseeing.length)
    : 90;
  const usableMinutes = Math.max(0, dailyMinutes - mealDurations.reduce((sum, minutes) => sum + minutes, 0) - END_OF_DAY_BUFFER_MINUTES);
  const sightseeingCapacity = Math.min(sightseeing.length, Math.floor((usableMinutes * days) / (averageVisitMinutes + TRAVEL_BUFFER_MINUTES)));
  const recommendedCapacity = Math.min(candidates.length, Math.min(foodCount, mealSlots) + sightseeingCapacity);

  return {
    recommendedCapacity,
    days,
    hoursPerDay,
    mealSlots,
    sightseeingCapacity,
    averageVisitMinutes,
    estimatedTravelMinutes: TRAVEL_BUFFER_MINUTES,
    reasoning: [
      `${days}-day trip with about ${hoursPerDay} planned hours per day.`,
      `${mealSlots} meal windows reserved across the trip.`,
      `Average visit is about ${averageVisitMinutes} minutes, plus a ${TRAVEL_BUFFER_MINUTES}-minute travel buffer.`,
    ],
  };
}
