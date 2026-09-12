import type { ItineraryActivity, ItineraryDay, Place, TransportMode } from "./types";
import { daysBetween, isFoodPlace } from "./utils";
import { travelMinutes } from "./geo";

/**
 * Turns a route-ordered shortlist into a real day-by-day plan.
 *
 * Deterministic and explainable, on purpose — no black-box "AI schedules your
 * trip" step. Each day walks forward through breakfast/lunch/dinner anchors;
 * the open time between them is filled with sightseeing stops in the given
 * order (already area-clustered by the route step) until a window runs out,
 * carrying the rest into the next window/day. Travel time between consecutive
 * stops comes from real coordinates.
 *
 * If the group actually shortlisted a restaurant/cafe, it fills the meal
 * slot itself — shown as a real stop with its own photo, rating and cost —
 * instead of sitting next to a separate generic "Lunch" block. That's real
 * time freed up for another stop, which is the whole point: a place you're
 * already going to eat at IS that meal, not an extra thing bolted onto it.
 */

interface TripLike {
  startDate: string;
  endDate: string;
  dailyStart: string;
  dailyEnd: string;
  transport: TransportMode;
}

const PRICE_ESTIMATE: Record<1 | 2 | 3 | 4, number> = { 1: 10, 2: 25, 3: 50, 4: 90 };

/**
 * A hard ceiling on non-meal stops per day, independent of whether the clock
 * technically has room for more. Real days have traffic, queueing, and people
 * who get tired — "it fits on paper" isn't the same as "it's a good day."
 * With 3 meals on top, that's still up to 7 stops in a day, which is already
 * a full one.
 */
export const MAX_SIGHTS_PER_DAY = 4;

/** Cap on travel minutes for the one bonus evening stop past that ceiling — a
 * quick nearby stop after dinner, not a night-time trek across the city. */
const EVENING_BONUS_MAX_TRAVEL = 30;

function parseTime(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

function formatTime(minutes: number): string {
  const h = Math.floor((minutes % 1440) / 60);
  const m = Math.round(minutes % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function addDays(iso: string, n: number): string {
  // Pure UTC calendar arithmetic — parsing as local time and then serializing
  // via toISOString() (UTC) would shift the date whenever the server's
  // timezone isn't UTC (e.g. a day earlier at UTC+8).
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + n);
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function areaLabel(place: Place): string {
  const area = place.area?.trim();
  if (!area || /\d/.test(area) || area.length > 22) return titleCase(place.destination);
  return titleCase(area);
}

let uidCounter = 0;
function activityId() {
  uidCounter += 1;
  return `act-${Date.now().toString(36)}-${uidCounter}`;
}

interface MealAnchor {
  type: "breakfast" | "lunch" | "dinner";
  target: number; // minutes — the open-window fill stops here at the latest
  acceptableStart: number; // a real restaurant arriving in [start, end] can fill this meal
  acceptableEnd: number;
  duration: number;
  cost: number;
  label: string;
}

function mealAnchorsFor(dailyStart: number, dailyEnd: number): MealAnchor[] {
  const anchors: MealAnchor[] = [];

  if (dailyStart <= 9 * 60 + 30) {
    anchors.push({
      type: "breakfast",
      target: Math.max(dailyStart, 8 * 60),
      acceptableStart: dailyStart,
      acceptableEnd: 11 * 60,
      duration: 40,
      cost: 12,
      label: "Breakfast",
    });
  }
  if (dailyEnd > 13 * 60) {
    anchors.push({
      type: "lunch",
      target: 12 * 60 + 30,
      acceptableStart: 10 * 60 + 30,
      acceptableEnd: Math.min(dailyEnd, 16 * 60),
      duration: 60,
      cost: 18,
      label: "Lunch",
    });
  }
  if (dailyEnd >= 20 * 60) {
    anchors.push({
      type: "dinner",
      target: 19 * 60,
      acceptableStart: 16 * 60 + 30,
      acceptableEnd: dailyEnd,
      duration: 75,
      cost: 28,
      label: "Dinner",
    });
  }

  return anchors;
}

export function buildItinerary(trip: TripLike, orderedPlaces: Place[]): ItineraryDay[] {
  const totalDays = Math.max(1, daysBetween(trip.startDate, trip.endDate));
  const dailyStart = parseTime(trip.dailyStart);
  const dailyEnd = parseTime(trip.dailyEnd);

  // Two streams, each preserving the original (already area-clustered) order.
  // Meals are filled from the food stream; open time from the sightseeing one.
  const foodQueue = orderedPlaces.filter(isFoodPlace);
  const sightQueue = orderedPlaces.filter((p) => !isFoodPlace(p));

  const days: ItineraryDay[] = [];
  let lastPlace: Place | null = null;

  for (let dayNum = 1; dayNum <= totalDays; dayNum++) {
    const activities: ItineraryActivity[] = [];
    const areasToday = new Set<string>();
    let cursor = dailyStart;
    let placedAny = false;
    let sightsToday = 0;

    const anchors = mealAnchorsFor(dailyStart, dailyEnd);
    // Every open segment ends at the next meal's target time, or at day's end
    // once all of today's meals are placed.
    const segmentEnds = [...anchors.map((a) => a.target), dailyEnd];

    // If dinner leaves a real evening window afterward, the day shouldn't stop
    // dead the moment dinner ends just because the daytime cap is already
    // spent — "after dinner can go to other place" is part of the shape of
    // the day. Grant the post-dinner segment one stop on top of the normal
    // cap instead of carving a slot out of daytime (that would risk pushing
    // the daytime queue's last stop late enough to blow through the window
    // that lets a real place fill dinner in the first place).
    const dinnerAnchor = anchors.find((a) => a.type === "dinner");
    const reserveEveningSlot = !!dinnerAnchor && dailyEnd - dinnerAnchor.target >= 60;

    for (let i = 0; i < segmentEnds.length; i++) {
      const windowEnd = segmentEnds[i];
      const isFinalSegment = i === segmentEnds.length - 1;
      const segmentCap = isFinalSegment && reserveEveningSlot ? MAX_SIGHTS_PER_DAY + 1 : MAX_SIGHTS_PER_DAY;

      // Fill the open segment with sightseeing stops, up to the daily cap.
      while (sightQueue.length > 0 && sightsToday < segmentCap) {
        // The bonus stop past the normal cap only exists for something easy to
        // reach after a full day, not whatever the route order queued up next —
        // a night-time trek across town isn't "one more place", it's a second
        // outing. Look a little further ahead in the (already route-ordered)
        // queue for the nearest thing that actually fits nearby; anything found
        // is pulled out of turn, leaving the rest of the order intact for
        // whichever day catches up to it geographically.
        const isBonusStop = isFinalSegment && sightsToday >= MAX_SIGHTS_PER_DAY;
        let index = 0;
        if (isBonusStop && lastPlace) {
          // Only peek a few stops ahead — far enough to catch something the
          // route happened to queue slightly out of turn, not so far that a
          // later day gets raided for a place it was meant to anchor.
          const lookahead = sightQueue.slice(0, 6);
          index = lookahead.findIndex(
            (p) => travelMinutes(lastPlace!.coordinates, p.coordinates, trip.transport) <= EVENING_BONUS_MAX_TRAVEL
          );
          if (index === -1) break;
        }

        const candidate = sightQueue[index];
        const travel = lastPlace ? travelMinutes(lastPlace.coordinates, candidate.coordinates, trip.transport) : 20;
        const arrival = cursor + travel;
        const finish = arrival + candidate.estimatedDurationMinutes;
        if (finish > windowEnd) break;

        activities.push({
          id: activityId(),
          placeId: candidate.id,
          label: candidate.name,
          time: formatTime(arrival),
          durationMinutes: candidate.estimatedDurationMinutes,
          travelFromPrevMinutes: travel,
          estimatedCost: PRICE_ESTIMATE[candidate.priceLevel],
          type: "place",
        });

        areasToday.add(areaLabel(candidate));
        cursor = finish;
        lastPlace = candidate;
        placedAny = true;
        sightsToday += 1;
        sightQueue.splice(index, 1);
      }

      // Then handle the meal this segment led up to, if any.
      const anchor = anchors[i];
      if (!anchor) continue;

      const candidate = foodQueue[0];
      const travel = candidate && lastPlace ? travelMinutes(lastPlace.coordinates, candidate.coordinates, trip.transport) : 20;
      const arrival = cursor + travel;

      if (candidate && arrival >= anchor.acceptableStart && arrival <= anchor.acceptableEnd) {
        // A real place the group chose covers this meal.
        activities.push({
          id: activityId(),
          placeId: candidate.id,
          label: candidate.name,
          time: formatTime(arrival),
          durationMinutes: candidate.estimatedDurationMinutes,
          travelFromPrevMinutes: travel,
          estimatedCost: PRICE_ESTIMATE[candidate.priceLevel],
          type: "place",
        });
        areasToday.add(areaLabel(candidate));
        cursor = arrival + candidate.estimatedDurationMinutes;
        lastPlace = candidate;
        placedAny = true;
        foodQueue.shift();
      } else {
        // Nothing suitable queued (or it doesn't fit the timing) — a generic
        // meal placeholder still holds the slot so the day isn't left hungry.
        const mealTime = Math.max(cursor, anchor.target);
        activities.push({
          id: activityId(),
          placeId: null,
          label: anchor.label,
          time: formatTime(mealTime),
          durationMinutes: anchor.duration,
          travelFromPrevMinutes: 0,
          estimatedCost: anchor.cost,
          type: "meal",
        });
        cursor = mealTime + anchor.duration;
      }
    }

    if (placedAny) {
      const last = activities[activities.length - 1];
      const returnTravel = lastPlace ? 20 : 0;
      activities.push({
        id: activityId(),
        placeId: null,
        label: "Return to hotel",
        time: formatTime(parseTime(last.time) + last.durationMinutes + returnTravel),
        durationMinutes: 0,
        travelFromPrevMinutes: returnTravel,
        estimatedCost: 6,
        type: "transit",
      });
    }

    const title =
      areasToday.size > 0
        ? Array.from(areasToday).slice(0, 2).join(" & ")
        : dayNum === totalDays
        ? "Departure"
        : "Free day";

    days.push({ day: dayNum, date: addDays(trip.startDate, dayNum - 1), title, activities });
  }

  return days;
}
