import assert from "node:assert/strict";
import test from "node:test";
import { validateBuiltItinerary } from "./itinerary-validation";
import type { ItineraryDay } from "./types";

const trip = { startDate: "2026-09-11", endDate: "2026-09-12", dailyStart: "08:00", dailyEnd: "18:00" };
const itinerary: ItineraryDay[] = [{
  day: 1,
  date: "2026-09-11",
  title: "Central",
  activities: [
    { id: "a", placeId: "a", label: "A", time: "09:00", durationMinutes: 60, travelFromPrevMinutes: 20, estimatedCost: 0, type: "place" },
    { id: "b", placeId: "b", label: "B", time: "10:00", durationMinutes: 60, travelFromPrevMinutes: 0, estimatedCost: 0, type: "place" },
    { id: "return", placeId: null, label: "Return", time: "11:20", durationMinutes: 0, travelFromPrevMinutes: 20, estimatedCost: 0, type: "transit" },
  ],
}];

test("validates the existing half-open builder timeline without changing it", () => {
  assert.deepEqual(validateBuiltItinerary({ trip, shortlistPlaceIds: ["a", "b"], itinerary }), { valid: true });
});

test("rejects structural itinerary defects", () => {
  const invalid: ItineraryDay[] = [{
    ...itinerary[0],
    date: "2026-09-13",
    activities: [itinerary[0].activities[0], { ...itinerary[0].activities[1], id: "a", placeId: "unknown", time: "09:30" }],
  }];
  const result = validateBuiltItinerary({ trip, shortlistPlaceIds: ["a", "b", "b"], itinerary: invalid });
  assert.equal(result.valid, false);
  if (!result.valid) {
    assert.ok(result.reasons.some((reason) => reason.includes("out-of-range")));
    assert.ok(result.reasons.some((reason) => reason.includes("duplicate")));
    assert.ok(result.reasons.some((reason) => reason.includes("overlaps")));
    assert.ok(result.reasons.some((reason) => reason.includes("unknown")));
    assert.ok(result.reasons.some((reason) => reason.includes("exactly once")));
  }
});
