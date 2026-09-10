import assert from "node:assert/strict";
import test from "node:test";
import { getActivePlanPlaceIds } from "./plan-places";
import { applyRescueReplacement } from "./rescue";
import type { ItineraryDay } from "./types";

const activity = (id: string, placeId: string | null, type: "place" | "meal" = "place") => ({
  id,
  placeId,
  label: id,
  time: "10:00",
  durationMinutes: 60,
  travelFromPrevMinutes: 0,
  estimatedCost: 0,
  type,
});

const itinerary = (activities: ItineraryDay["activities"]): ItineraryDay[] => [{ day: 1, date: "2026-01-01", title: "Day", activities }];

test("falls back to unique shortlist IDs without itinerary place activities", () => {
  assert.deepEqual(getActivePlanPlaceIds({ shortlistPlaceIds: ["A", "B", "A"], itinerary: [] }), ["A", "B"]);
  assert.deepEqual(getActivePlanPlaceIds({ shortlistPlaceIds: ["A", "B"], itinerary: itinerary([activity("meal", null, "meal")]) }), ["A", "B"]);
});

test("uses unique itinerary place IDs without appending historical shortlist IDs", () => {
  assert.deepEqual(
    getActivePlanPlaceIds({ shortlistPlaceIds: ["A", "B", "C"], itinerary: itinerary([activity("1", "B"), activity("2", "B"), activity("3", "C")]) }),
    ["B", "C"]
  );
});

test("Rescue replacement becomes active while the historical shortlist stays unchanged", () => {
  const original = itinerary([activity("target", "original"), activity("other", "other")]);
  const updated = applyRescueReplacement(original, "target", {
    placeId: "replacement",
    label: "Replacement",
    extraTravelMinutes: 10,
    available: true,
    cost: 22,
    note: "Prepared",
  });
  assert.deepEqual(getActivePlanPlaceIds({ shortlistPlaceIds: ["original", "other"], itinerary: updated }), ["replacement", "other"]);
});
