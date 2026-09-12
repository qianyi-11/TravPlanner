import assert from "node:assert/strict";
import test from "node:test";
import { estimatedMealSpend } from "./place-cost";

test("meal spend maps relative price levels to TravPlanner ranges", () => {
  assert.deepEqual([1, 2, 3, 4].map((level) => estimatedMealSpend(level as 1 | 2 | 3 | 4)), [
    "RM 5–15",
    "RM 15–35",
    "RM 35–70",
    "RM 70–150",
  ]);
});
