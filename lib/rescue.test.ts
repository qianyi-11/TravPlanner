import assert from "node:assert/strict";
import test from "node:test";
import { applyRescueReplacement } from "./rescue";
import type { ItineraryDay } from "./types";

const itinerary: ItineraryDay[] = [{
  day: 1,
  date: "2026-01-01",
  title: "Test day",
  activities: [{
    id: "activity-1",
    placeId: "old-place",
    label: "Old place",
    time: "10:00",
    durationMinutes: 60,
    travelFromPrevMinutes: 15,
    estimatedCost: 10,
    locked: true,
    type: "place",
  }],
}];

test("a Rescue replacement survives serialization and preserves schedule metadata", () => {
  const updated = applyRescueReplacement(itinerary, "activity-1", {
    placeId: "new-place",
    label: "New place",
    extraTravelMinutes: 5,
    available: true,
    cost: 25,
    note: "Prepared replacement",
  });
  const reloaded = JSON.parse(JSON.stringify(updated)) as ItineraryDay[];
  assert.deepEqual(reloaded[0].activities[0], {
    ...itinerary[0].activities[0],
    placeId: "new-place",
    label: "New place",
    estimatedCost: 25,
  });
  assert.equal(itinerary[0].activities[0].placeId, "old-place");
});

test("a missing affected activity fails instead of producing a false resolution", () => {
  assert.throws(
    () => applyRescueReplacement(itinerary, "missing", {
      placeId: "new-place",
      label: "New place",
      extraTravelMinutes: 5,
      available: true,
      cost: 25,
      note: "Prepared replacement",
    }),
    /not found/
  );
});

test("using a saved Plan B clears it from the replaced activity", () => {
  const withBackup = [{
    ...itinerary[0],
    activities: [{ ...itinerary[0].activities[0], backupPlaceId: "backup-place" }],
  }];
  const updated = applyRescueReplacement(withBackup, "activity-1", {
    placeId: "backup-place",
    label: "Backup place",
    extraTravelMinutes: 0,
    available: true,
    cost: 25,
    note: "Your saved Plan B",
  });
  assert.equal(updated[0].activities[0].backupPlaceId, null);
});
