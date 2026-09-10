import type { ItineraryActivity, ItineraryDay, Place, TransportMode } from "./types";
import { daysBetween } from "./utils";

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

const SPEED_KMH: Record<TransportMode, number> = {
  Walking: 4.5,
  "Public Transport": 18,
  Car: 22,
  Taxi: 24,
  Mixed: 16,
};

const PRICE_ESTIMATE: Record<1 | 2 | 3 | 4, number> = { 1: 10, 2: 25, 3: 50, 4: 90 };

// Category strings (ours, and Google's snake_case types title-cased by
// prettyCategory) that mean "you eat here" rather than "you go look at it".
const FOOD_KEYWORDS = [
  "food", "restaurant", "cafe", "café", "bakery", "ramen", "noodle", "dessert",
  "coffee", "tea", "bistro", "diner", "eatery", "kitchen", "grill", "sushi",
  "pizza", "burger", "buffet", "hot pot", "hotpot", "ice cream", "bagel",
  "brunch", "deli", "steakhouse", "seafood", "bar & grill", "meal",
];

export function isFoodPlace(place: Pick<Place, "category">): boolean {
  const c = place.category.toLowerCase();
  return FOOD_KEYWORDS.some((kw) => c.includes(kw));
}

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

function haversineKm(a: Place["coordinates"], b: Place["coordinates"]): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function travelMinutes(a: Place, b: Place, transport: TransportMode): number {
  const km = haversineKm(a.coordinates, b.coordinates);
  const speed = SPEED_KMH[transport] ?? SPEED_KMH.Mixed;
  const minutes = (km / speed) * 60;
  return Math.min(90, Math.max(10, Math.round(minutes / 5) * 5));
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

    const anchors = mealAnchorsFor(dailyStart, dailyEnd);
    // Every open segment ends at the next meal's target time, or at day's end
    // once all of today's meals are placed.
    const segmentEnds = [...anchors.map((a) => a.target), dailyEnd];

    for (let i = 0; i < segmentEnds.length; i++) {
      const windowEnd = segmentEnds[i];

      // Fill the open segment with sightseeing stops.
      while (sightQueue.length > 0) {
        const candidate = sightQueue[0];
        const travel = lastPlace ? travelMinutes(lastPlace, candidate, trip.transport) : 20;
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
        sightQueue.shift();
      }

      // Then handle the meal this segment led up to, if any.
      const anchor = anchors[i];
      if (!anchor) continue;

      const candidate = foodQueue[0];
      const travel = candidate && lastPlace ? travelMinutes(lastPlace, candidate, trip.transport) : 20;
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
