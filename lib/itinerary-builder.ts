import type { ItineraryActivity, ItineraryDay, Place, TransportMode } from "./types";
import { daysBetween } from "./utils";
import { timeToMinutes } from "./date-time";
import { isFoodPlace } from "./place-category";

interface ItineraryBuildInput {
  trip: {
    startDate: string;
    endDate: string;
    dailyStart: string;
    dailyEnd: string;
    transport: TransportMode;
  };
  selectedPlaceIds: string[];
  places: Place[];
}

export interface ItineraryBuildResult {
  itinerary: ItineraryDay[];
  unscheduledPlaceIds: string[];
}

const FALLBACK_TRAVEL_MINUTES = 20;
const SPEED_KMH: Record<TransportMode, number> = {
  Walking: 4.5,
  "Public Transport": 18,
  Car: 22,
  Taxi: 24,
  Mixed: 16,
};

function formatTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function addDays(iso: string, offset: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + offset));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function validCoordinates({ lat, lng }: Place["coordinates"]): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);
}

function travelMinutes(from: Place, to: Place, transport: TransportMode): number {
  if (!validCoordinates(from.coordinates) || !validCoordinates(to.coordinates)) return FALLBACK_TRAVEL_MINUTES;
  const radians = Math.PI / 180;
  const dLat = (to.coordinates.lat - from.coordinates.lat) * radians;
  const dLng = (to.coordinates.lng - from.coordinates.lng) * radians;
  const lat1 = from.coordinates.lat * radians;
  const lat2 = to.coordinates.lat * radians;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const distanceKm = 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return Math.min(90, Math.max(10, Math.round(((distanceKm / SPEED_KMH[transport]) * 60) / 5) * 5));
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (character) => character.toUpperCase());
}

function areaLabel(place: Place): string {
  const area = place.area.trim();
  return titleCase(!area || /\d/.test(area) || area.length > 22 ? place.destination : area);
}

function groupedPlaces(selectedPlaceIds: string[], places: Place[]): { ordered: Place[]; selectedIds: string[] } {
  const selectedIds = [...new Set(selectedPlaceIds)];
  const placesById = new Map(places.map((place) => [place.id, place]));
  const groups = new Map<string, Place[]>();
  for (const id of selectedIds) {
    const place = placesById.get(id);
    if (!place) continue;
    const key = `${place.destination}\u0000${place.area}`;
    const group = groups.get(key) ?? [];
    group.push(place);
    groups.set(key, group);
  }
  return { ordered: [...groups.values()].flat(), selectedIds };
}

interface MealAnchor {
  type: "breakfast" | "lunch" | "dinner";
  label: string;
  target: number;
  acceptableStart: number;
  acceptableEnd: number;
  duration: number;
  cost: number;
}

function mealAnchors(dailyStart: number, dailyEnd: number): MealAnchor[] {
  const anchors: MealAnchor[] = [];
  if (dailyStart <= 9 * 60 + 30) {
    anchors.push({ type: "breakfast", label: "Breakfast", target: Math.max(dailyStart, 8 * 60), acceptableStart: dailyStart, acceptableEnd: 11 * 60, duration: 40, cost: 12 });
  }
  if (dailyEnd > 13 * 60) {
    anchors.push({ type: "lunch", label: "Lunch", target: 12 * 60 + 30, acceptableStart: 10 * 60 + 30, acceptableEnd: Math.min(dailyEnd, 16 * 60), duration: 60, cost: 18 });
  }
  if (dailyEnd >= 20 * 60) {
    anchors.push({ type: "dinner", label: "Dinner", target: 19 * 60, acceptableStart: 16 * 60 + 30, acceptableEnd: dailyEnd, duration: 75, cost: 28 });
  }
  return anchors;
}

function activityId(day: number, sequence: number, token: string): string {
  return `it-${day}-${sequence}-${token.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

export function buildItinerary({ trip, selectedPlaceIds, places }: ItineraryBuildInput): ItineraryBuildResult {
  const { ordered, selectedIds } = groupedPlaces(selectedPlaceIds, places);
  const foodQueue = ordered.filter(isFoodPlace);
  const sightQueue = ordered.filter((place) => !isFoodPlace(place));
  const scheduledIds = new Set<string>();
  const itinerary: ItineraryDay[] = [];
  const dailyStart = timeToMinutes(trip.dailyStart);
  const dailyEnd = timeToMinutes(trip.dailyEnd);
  if (dailyStart === null || dailyEnd === null || dailyStart >= dailyEnd) throw new Error("Invalid trip daily window");
  const planningEnd = dailyEnd - FALLBACK_TRAVEL_MINUTES;
  const totalDays = Math.max(1, daysBetween(trip.startDate, trip.endDate));

  for (let day = 1; day <= totalDays; day += 1) {
    const activities: ItineraryActivity[] = [];
    const areas = new Set<string>();
    const anchors = mealAnchors(dailyStart, dailyEnd);
    const segmentEnds = [...anchors.map((anchor) => anchor.target), planningEnd];
    let cursor = dailyStart;
    let previousPlace: Place | null = null;
    let sequence = 0;

    const addPlace = (place: Place, arrival: number, travel: number) => {
      sequence += 1;
      activities.push({
        id: activityId(day, sequence, place.id),
        placeId: place.id,
        label: place.name,
        time: formatTime(arrival),
        durationMinutes: place.estimatedDurationMinutes,
        travelFromPrevMinutes: travel,
        estimatedCost: 0,
        type: "place",
      });
      areas.add(areaLabel(place));
      scheduledIds.add(place.id);
      previousPlace = place;
      cursor = arrival + place.estimatedDurationMinutes;
    };

    for (let index = 0; index < segmentEnds.length; index += 1) {
      const windowEnd = segmentEnds[index];
      while (sightQueue.length) {
        const place = sightQueue[0];
        const travel = previousPlace ? travelMinutes(previousPlace, place, trip.transport) : FALLBACK_TRAVEL_MINUTES;
        const arrival = cursor + travel;
        if (arrival + place.estimatedDurationMinutes > windowEnd) break;
        addPlace(place, arrival, travel);
        sightQueue.shift();
      }

      const anchor = anchors[index];
      if (!anchor) continue;
      const place = foodQueue[0];
      const travel = place ? (previousPlace ? travelMinutes(previousPlace, place, trip.transport) : FALLBACK_TRAVEL_MINUTES) : 0;
      const arrival = Math.max(cursor + travel, anchor.target);

      if (
        place &&
        arrival >= anchor.acceptableStart &&
        arrival <= anchor.acceptableEnd &&
        arrival + place.estimatedDurationMinutes <= planningEnd
      ) {
        addPlace(place, arrival, travel);
        foodQueue.shift();
        continue;
      }

      const mealTime = Math.max(cursor, Math.min(anchor.target, planningEnd - anchor.duration));
      if (mealTime + anchor.duration <= planningEnd) {
        sequence += 1;
        activities.push({
          id: activityId(day, sequence, anchor.type),
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

    if (previousPlace && cursor + FALLBACK_TRAVEL_MINUTES <= dailyEnd) {
      sequence += 1;
      activities.push({
        id: activityId(day, sequence, "return-to-hotel"),
        placeId: null,
        label: "Return to hotel",
        time: formatTime(cursor + FALLBACK_TRAVEL_MINUTES),
        durationMinutes: 0,
        travelFromPrevMinutes: FALLBACK_TRAVEL_MINUTES,
        estimatedCost: 0,
        type: "transit",
      });
    }

    const title = areas.size ? [...areas].slice(0, 2).join(" & ") : day === totalDays ? "Departure" : "Free day";
    itinerary.push({ day, date: addDays(trip.startDate, day - 1), title, activities });
  }

  return { itinerary, unscheduledPlaceIds: selectedIds.filter((id) => !scheduledIds.has(id)) };
}
