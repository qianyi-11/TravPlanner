import assert from "node:assert/strict";
import test from "node:test";
import { applyRescueReplacement } from "./rescue";
import { getActivePlanPlaceIds } from "./plan-places";
import { buildItinerary, isFoodPlace } from "./itinerary-builder";
import type { Place, Trip } from "./types";

const trip = (overrides: Partial<Pick<Trip, "startDate" | "endDate" | "dailyStart" | "dailyEnd" | "transport">> = {}) => ({
  startDate: "2026-01-01",
  endDate: "2026-01-01",
  dailyStart: "08:00",
  dailyEnd: "21:00",
  transport: "Walking" as const,
  ...overrides,
});

function place(id: string, category = "Museum", overrides: Partial<Place> = {}): Place {
  return {
    id,
    source: "catalog",
    name: id,
    category,
    area: "Central",
    destination: "Test City",
    coordinates: { lat: 3.139, lng: 101.687 },
    address: "",
    photo: "",
    rating: 0,
    reviewCount: 0,
    priceLevel: 4,
    priceLabel: "",
    description: "",
    openingHours: [],
    isOpenNow: false,
    estimatedDurationMinutes: 60,
    reviews: [],
    availability: "unknown",
    suggestedBy: [],
    voteCount: 0,
    votedBy: [],
    ...overrides,
  };
}

const placeActivities = (result: ReturnType<typeof buildItinerary>) => result.itinerary.flatMap((day) => day.activities).filter((activity) => activity.type === "place");
const minutes = (value: string) => {
  const [hours, mins] = value.split(":").map(Number);
  return hours * 60 + mins;
};

test("food classification is word-aware and category-only", () => {
  for (const category of ["Restaurant", "Cafe", "Bakery", "Ramen", "Sushi", "Dessert", "Seafood", "Food Market"]) {
    assert.equal(isFoodPlace(place("food", category)), true, category);
  }
  for (const category of ["Museum", "Park", "Shrine", "Kitchen Supply Store"]) {
    assert.equal(isFoodPlace(place("sight", category)), false, category);
  }
});

test("real food venues fill breakfast, lunch, and dinner without duplicate meals or cost inference", () => {
  const places = [
    place("breakfast", "Cafe", { estimatedDurationMinutes: 40 }),
    place("lunch", "Restaurant", { estimatedDurationMinutes: 60 }),
    place("dinner", "Sushi", { estimatedDurationMinutes: 75 }),
  ];
  const result = buildItinerary({ trip: trip(), selectedPlaceIds: places.map(({ id }) => id), places });
  const activities = result.itinerary[0].activities;
  assert.deepEqual(placeActivities(result).map(({ placeId }) => placeId), ["breakfast", "lunch", "dinner"]);
  assert.equal(activities.some(({ type }) => type === "meal"), false);
  assert.ok(minutes(activities[0].time) <= 11 * 60);
  assert.ok(minutes(activities[1].time) >= 10 * 60 + 30 && minutes(activities[1].time) <= 16 * 60);
  assert.ok(minutes(activities[2].time) >= 16 * 60 + 30);
  assert.ok(placeActivities(result).every(({ estimatedCost }) => estimatedCost === 0));
  assert.deepEqual(result.unscheduledPlaceIds, []);
});

test("generic meals fill available anchors and never cross the daily boundary", () => {
  const result = buildItinerary({ trip: trip(), selectedPlaceIds: [], places: [] });
  assert.deepEqual(result.itinerary[0].activities.map(({ label }) => label), ["Breakfast", "Lunch", "Dinner"]);
  assert.deepEqual(result.itinerary[0].activities.map(({ estimatedCost }) => estimatedCost), [12, 18, 28]);
  for (const activity of result.itinerary[0].activities) {
    assert.ok(minutes(activity.time) >= 8 * 60);
    assert.ok(minutes(activity.time) + activity.durationMinutes <= 21 * 60);
  }

  const tight = buildItinerary({ trip: trip({ dailyStart: "19:30", dailyEnd: "20:00" }), selectedPlaceIds: [], places: [] });
  assert.equal(tight.itinerary[0].activities.some(({ label }) => label === "Dinner"), false);
});

test("sightseeing respects duration, area grouping, selected order, and database order", () => {
  const places = [
    place("b", "Park", { area: "West", estimatedDurationMinutes: 45 }),
    place("a", "Museum", { area: "East", estimatedDurationMinutes: 90 }),
    place("c", "Shrine", { area: "East", estimatedDurationMinutes: 30 }),
  ];
  const selectedPlaceIds = ["a", "b", "c"];
  const first = buildItinerary({ trip: trip({ dailyStart: "10:00", dailyEnd: "18:00" }), selectedPlaceIds, places });
  const shuffled = buildItinerary({ trip: trip({ dailyStart: "10:00", dailyEnd: "18:00" }), selectedPlaceIds, places: [...places].reverse() });
  assert.deepEqual(first, shuffled);
  assert.deepEqual(placeActivities(first).map(({ placeId }) => placeId), ["a", "c", "b"]);
  const [a, c] = placeActivities(first);
  assert.equal(minutes(c.time), minutes(a.time) + a.durationMinutes + c.travelFromPrevMinutes);
  assert.deepEqual(first.unscheduledPlaceIds, []);
});

test("multi-day builds are deterministic, use stable IDs, and reset travel context", () => {
  const places = [
    place("day-one", "Museum", { coordinates: { lat: 1, lng: 1 }, estimatedDurationMinutes: 120 }),
    place("day-two", "Museum", { coordinates: { lat: 50, lng: 50 }, estimatedDurationMinutes: 120 }),
  ];
  const input = { trip: trip({ endDate: "2026-01-02", dailyStart: "10:00", dailyEnd: "13:00" }), selectedPlaceIds: places.map(({ id }) => id), places };
  const first = buildItinerary(input);
  assert.deepEqual(first, buildItinerary(input));
  assert.deepEqual(placeActivities(first).map(({ travelFromPrevMinutes }) => travelFromPrevMinutes), [20, 20]);
  assert.match(placeActivities(first)[0].id, /^it-1-1-day-one$/);
  assert.match(placeActivities(first)[1].id, /^it-2-1-day-two$/);
});

test("placeholder geometry uses fallback travel and impossible schedules report overflow", () => {
  const places = [
    place("valid", "Museum", { coordinates: { lat: 1, lng: 1 }, estimatedDurationMinutes: 30 }),
    place("placeholder", "Park", { coordinates: { lat: 0, lng: 0 }, estimatedDurationMinutes: 30 }),
  ];
  const result = buildItinerary({ trip: trip({ dailyStart: "10:00", dailyEnd: "13:00" }), selectedPlaceIds: places.map(({ id }) => id), places });
  assert.equal(placeActivities(result)[1].travelFromPrevMinutes, 20);

  const overflow = buildItinerary({ trip: trip({ dailyStart: "10:00", dailyEnd: "11:00" }), selectedPlaceIds: ["too-long", "missing"], places: [place("too-long", "Museum", { estimatedDurationMinutes: 90 })] });
  assert.deepEqual(overflow.unscheduledPlaceIds, ["too-long", "missing"]);
  assert.equal(placeActivities(overflow).length, 0);
});

test("generated IDs remain compatible with Rescue and active-plan selection", () => {
  const places = [place("a"), place("b")];
  const result = buildItinerary({ trip: trip({ dailyStart: "10:00", dailyEnd: "18:00" }), selectedPlaceIds: ["a", "b"], places });
  const target = placeActivities(result)[0];
  const updated = applyRescueReplacement(result.itinerary, target.id, {
    placeId: "replacement",
    label: "Replacement",
    extraTravelMinutes: 5,
    available: true,
    cost: 25,
    note: "Prepared",
  });
  assert.deepEqual(updated[0].activities.find(({ id }) => id === target.id), { ...target, placeId: "replacement", label: "Replacement", estimatedCost: 25 });
  assert.deepEqual(getActivePlanPlaceIds({ itinerary: result.itinerary, shortlistPlaceIds: ["a", "b"] }), ["a", "b"]);
});
