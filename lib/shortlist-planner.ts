import type { Place, Trip } from "./types";
import { daysBetween, isFoodPlace } from "./utils";

/**
 * Decides how many places a trip should actually commit to — and which of them
 * are the meals — instead of asking the group to guess a number on a slider.
 *
 * The reasoning is deliberately explicit and shown in the UI: a group should be
 * able to see *why* the system landed on a number and disagree with it, rather
 * than be handed an unexplained figure.
 *
 * It plans two budgets separately, because they compete for different time:
 *   - Meal slots: breakfast/lunch/dinner that exist whether or not you plan
 *     them, so a restaurant filling one costs no sightseeing time.
 *   - Sightseeing capacity: how many visits actually fit in the open hours
 *     left over, allowing for travel between stops.
 */

export interface ShortlistPlan {
  /** Everything that makes the cut, kept in vote-rank order. */
  placeIds: string[];
  foodIds: string[];
  sightIds: string[];
  days: number;
  hoursPerDay: number;
  mealsPerDay: number;
  mealSlots: number;
  sightCapacity: number;
  reasoning: string[];
}

const AVG_TRAVEL_MINUTES = 25;
const END_OF_DAY_BUFFER = 30;

function parseTime(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** Which meals genuinely fit inside the group's daily window. */
function mealsInWindow(dailyStart: number, dailyEnd: number): { count: number; minutes: number } {
  let count = 0;
  let minutes = 0;
  if (dailyStart <= 9 * 60 + 30) {
    count += 1;
    minutes += 40;
  }
  if (dailyEnd > 13 * 60) {
    count += 1;
    minutes += 60;
  }
  if (dailyEnd >= 20 * 60) {
    count += 1;
    minutes += 75;
  }
  return { count, minutes };
}

export function planShortlist(
  trip: Pick<Trip, "startDate" | "endDate" | "dailyStart" | "dailyEnd">,
  /** Candidate places already sorted best-first (by votes). */
  ranked: Place[]
): ShortlistPlan {
  const days = Math.max(1, daysBetween(trip.startDate, trip.endDate));
  const dailyStart = parseTime(trip.dailyStart);
  const dailyEnd = parseTime(trip.dailyEnd);
  const dailyMinutes = Math.max(60, dailyEnd - dailyStart);
  const hoursPerDay = Math.round((dailyMinutes / 60) * 10) / 10;

  const meals = mealsInWindow(dailyStart, dailyEnd);
  const mealSlots = days * meals.count;

  const foodCandidates = ranked.filter(isFoodPlace);
  const sightCandidates = ranked.filter((p) => !isFoodPlace(p));

  // How long a typical stop takes here, from the group's own candidates.
  const avgVisit =
    sightCandidates.length > 0
      ? Math.round(
          sightCandidates.reduce((s, p) => s + p.estimatedDurationMinutes, 0) / sightCandidates.length
        )
      : 90;

  const openMinutesPerDay = Math.max(0, dailyMinutes - meals.minutes - END_OF_DAY_BUFFER);
  const perStop = avgVisit + AVG_TRAVEL_MINUTES;
  const sightCapacity = Math.max(
    days, // at least one thing to do each day
    Math.floor((openMinutesPerDay * days) / perStop)
  );

  const foodIds = foodCandidates.slice(0, mealSlots).map((p) => p.id);
  const sightIds = sightCandidates.slice(0, sightCapacity).map((p) => p.id);

  const chosen = new Set([...foodIds, ...sightIds]);
  const placeIds = ranked.filter((p) => chosen.has(p.id)).map((p) => p.id);

  const reasoning = [
    `Your trip runs ${days} day${days > 1 ? "s" : ""} with about ${hoursPerDay} hours planned each day.`,
    `That leaves room for ${meals.count} meal${meals.count > 1 ? "s" : ""} a day — ${mealSlots} in total — so the ${
      foodIds.length === 1 ? "top place" : `top ${foodIds.length} places`
    } you voted for to eat at become your breakfasts, lunches and dinners.`,
    `After meals and travel, roughly ${Math.round(
      openMinutesPerDay / 60
    )} hours a day are free. At about ${avgVisit} minutes per visit plus travel, that fits ${sightCapacity} other stop${
      sightCapacity > 1 ? "s" : ""
    } across the trip.`,
    `So the group is committing to ${placeIds.length} place${placeIds.length > 1 ? "s" : ""}: ${
      foodIds.length
    } to eat at and ${sightIds.length} to visit.`,
  ];

  return {
    placeIds,
    foodIds,
    sightIds,
    days,
    hoursPerDay,
    mealsPerDay: meals.count,
    mealSlots,
    sightCapacity,
    reasoning,
  };
}
