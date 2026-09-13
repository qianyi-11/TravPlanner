import assert from "node:assert/strict";
import test from "node:test";
import { applyRescueReplacement } from "./rescue";
import { getActivePlanPlaceIds } from "./plan-places";
import { buildItinerary } from "./itinerary-builder";
import { isFoodPlace } from "./place-category";
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
  for (const category of ["Museum", "Park", "Shrine", "Kitchen Appliance Store", "Restaurant Supply Store", "Equipment Store"]) {
    assert.equal(isFoodPlace(place("sight", category)), false, category);
  }
});

test("real food venues fill breakfast, lunch, and dinner with deterministic meal estimates", () => {
  const places = [
    place("breakfast", "Cafe", { estimatedDurationMinutes: 40, priceLevel: 1 }),
    place("lunch", "Restaurant", { estimatedDurationMinutes: 60, priceLevel: 2 }),
    place("dinner", "Sushi", { estimatedDurationMinutes: 75, priceLevel: 3 }),
  ];
  const result = buildItinerary({ trip: trip(), selectedPlaceIds: places.map(({ id }) => id), places });
  const activities = result.itinerary[0].activities;
  assert.deepEqual(placeActivities(result).map(({ placeId }) => placeId), ["breakfast", "lunch", "dinner"]);
  assert.equal(activities.some(({ type }) => type === "meal"), false);
  assert.ok(minutes(activities[0].time) <= 11 * 60);
  assert.ok(minutes(activities[1].time) >= 10 * 60 + 30 && minutes(activities[1].time) <= 16 * 60);
  assert.ok(minutes(activities[2].time) >= 16 * 60 + 30);
  assert.deepEqual(placeActivities(result).map(({ estimatedCost }) => estimatedCost), [10, 25, 53]);
  assert.deepEqual(result.unscheduledPlaceIds, []);
});

test("ordinary attractions do not infer ticket cost from price level", () => {
  const result = buildItinerary({ trip: trip(), selectedPlaceIds: ["museum"], places: [place("museum", "Museum", { priceLevel: 4 })] });
  assert.equal(placeActivities(result)[0].estimatedCost, 0);
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

test("invalid persisted daily windows fail deterministically", () => {
  for (const overrides of [{ dailyStart: "8:00" }, { dailyEnd: "25:00" }, { dailyStart: "12:00", dailyEnd: "12:00" }]) {
    assert.throws(() => buildItinerary({ trip: trip(overrides), selectedPlaceIds: [], places: [] }), /Invalid trip daily window/);
  }
});

test("sightseeing respects duration, destination grouping, proximity, and database order", () => {
  const places = [
    place("b", "Park", { area: "West", estimatedDurationMinutes: 30 }),
    place("a", "Museum", { area: "East", estimatedDurationMinutes: 30 }),
    place("c", "Shrine", { area: "East", estimatedDurationMinutes: 30 }),
  ];
  const selectedPlaceIds = ["a", "b", "c"];
  const first = buildItinerary({ trip: trip({ dailyStart: "10:00", dailyEnd: "18:00" }), selectedPlaceIds, places });
  const shuffled = buildItinerary({ trip: trip({ dailyStart: "10:00", dailyEnd: "18:00" }), selectedPlaceIds, places: [...places].reverse() });
  assert.deepEqual(first, shuffled);
  assert.deepEqual(placeActivities(first).map(({ placeId }) => placeId), ["a", "b", "c"]);
  const [a, b] = placeActivities(first);
  assert.equal(minutes(b.time), minutes(a.time) + a.durationMinutes + b.travelFromPrevMinutes);
  assert.deepEqual(first.unscheduledPlaceIds, []);
});

test("proximity ordering keeps nearby clusters together", () => {
  const places = [
    place("start", "Museum", { coordinates: { lat: 35, lng: 139 }, estimatedDurationMinutes: 30 }),
    place("far", "Museum", { coordinates: { lat: 35.1, lng: 139.1 }, estimatedDurationMinutes: 30 }),
    place("near-a", "Museum", { coordinates: { lat: 35.001, lng: 139.001 }, estimatedDurationMinutes: 30 }),
    place("near-b", "Museum", { coordinates: { lat: 35.002, lng: 139.002 }, estimatedDurationMinutes: 30 }),
  ];
  const result = buildItinerary({ trip: trip({ dailyStart: "10:00", dailyEnd: "18:00" }), selectedPlaceIds: ["start", "far", "near-a", "near-b"], places });
  assert.deepEqual(placeActivities(result).map(({ placeId }) => placeId), ["start", "near-a", "near-b", "far"]);
});

test("same-distance proximity ties use stable place IDs", () => {
  const places = [
    place("start", "Museum", { coordinates: { lat: 35, lng: 139 }, estimatedDurationMinutes: 20 }),
    place("b-right", "Museum", { coordinates: { lat: 35, lng: 139.01 }, estimatedDurationMinutes: 20 }),
    place("a-left", "Museum", { coordinates: { lat: 35, lng: 138.99 }, estimatedDurationMinutes: 20 }),
  ];
  const result = buildItinerary({ trip: trip({ dailyStart: "10:00", dailyEnd: "16:00" }), selectedPlaceIds: ["start", "b-right", "a-left"], places });
  assert.deepEqual(placeActivities(result).map(({ placeId }) => placeId), ["start", "a-left", "b-right"]);
});

test("invalid coordinates remain deterministic and do not drop places", () => {
  const places = [
    place("start", "Museum", { coordinates: { lat: 35, lng: 139 }, estimatedDurationMinutes: 20 }),
    place("invalid-b", "Museum", { coordinates: { lat: 0, lng: 0 }, estimatedDurationMinutes: 20 }),
    place("invalid-a", "Museum", { coordinates: { lat: Number.NaN, lng: 139 }, estimatedDurationMinutes: 20 }),
    place("near", "Museum", { coordinates: { lat: 35.001, lng: 139.001 }, estimatedDurationMinutes: 20 }),
  ];
  const result = buildItinerary({ trip: trip({ dailyStart: "10:00", dailyEnd: "18:00" }), selectedPlaceIds: ["start", "invalid-b", "invalid-a", "near"], places });
  assert.deepEqual(placeActivities(result).map(({ placeId }) => placeId), ["start", "near", "invalid-a", "invalid-b"]);
  assert.deepEqual(result.unscheduledPlaceIds, []);
});

test("proximity ordering preserves destination boundaries and selected place membership", () => {
  const places = [
    place("tokyo-start", "Museum", { destination: "Tokyo", coordinates: { lat: 35, lng: 139 }, estimatedDurationMinutes: 20 }),
    place("kyoto", "Museum", { destination: "Kyoto", coordinates: { lat: 35.01, lng: 139.01 }, estimatedDurationMinutes: 20 }),
    place("tokyo-near", "Museum", { destination: "Tokyo", coordinates: { lat: 35.001, lng: 139.001 }, estimatedDurationMinutes: 20 }),
    place("osaka", "Museum", { destination: "Osaka", coordinates: { lat: 35.02, lng: 139.02 }, estimatedDurationMinutes: 20 }),
  ];
  const result = buildItinerary({ trip: trip({ dailyStart: "10:00", dailyEnd: "18:00" }), selectedPlaceIds: ["tokyo-start", "kyoto", "tokyo-near", "osaka", "tokyo-near", "missing"], places });
  const activities = placeActivities(result);
  assert.deepEqual(activities.map(({ placeId }) => placeId), ["tokyo-start", "tokyo-near", "kyoto", "osaka"]);
  assert.equal(new Set(activities.map(({ placeId }) => placeId)).size, 4);
  assert.deepEqual(result.unscheduledPlaceIds, ["missing"]);
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
