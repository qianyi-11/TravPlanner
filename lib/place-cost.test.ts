import assert from "node:assert/strict";
import test from "node:test";
import { estimatedMealSpend, estimatedMealSpendMidpoint, estimatedMealSpendRange } from "./place-cost";

test("meal spend maps relative price levels to Trippy ranges", () => {
  assert.deepEqual([1, 2, 3, 4].map((level) => estimatedMealSpend(level as 1 | 2 | 3 | 4)), [
    "RM 5–15",
    "RM 15–35",
    "RM 35–70",
    "RM 70–150",
  ]);
  assert.deepEqual([1, 2, 3, 4].map((level) => estimatedMealSpendRange(level as 1 | 2 | 3 | 4)), [[5, 15], [15, 35], [35, 70], [70, 150]]);
  assert.deepEqual([1, 2, 3, 4].map((level) => estimatedMealSpendMidpoint(level as 1 | 2 | 3 | 4)), [10, 25, 53, 110]);
});
