import assert from "node:assert/strict";
import test from "node:test";
import { estimateVisitDuration } from "./place-duration";

test("estimates common attraction durations by category", () => {
  assert.deepEqual(
    [
      estimateVisitDuration("Museum"),
      estimateVisitDuration("Theme Park"),
      estimateVisitDuration("Observation Deck"),
      estimateVisitDuration("Park"),
      estimateVisitDuration("Shopping Mall"),
    ],
    [120, 360, 60, 90, 120]
  );
});

test("duration matching is case-insensitive and covers food categories", () => {
  assert.deepEqual(
    [
      estimateVisitDuration("cAfE"),
      estimateVisitDuration("Restaurant"),
      estimateVisitDuration("Bar"),
      estimateVisitDuration("FAST FOOD"),
    ],
    [45, 60, 90, 45]
  );
});

test("unknown categories use the generic planning estimate", () => {
  assert.equal(estimateVisitDuration("Unclassified Place"), 75);
});
