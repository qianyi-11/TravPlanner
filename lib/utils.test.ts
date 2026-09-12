import assert from "node:assert/strict";
import test from "node:test";
import { computeBudgetBreakdown } from "./utils";
import type { Trip } from "./types";

test("current membership drives traveler calculations", () => {
  const trip = {
    budgetTotal: 600,
    groupSize: 5,
    memberIds: ["a", "b", "c"],
    itinerary: [],
  } as unknown as Trip;
  const result = computeBudgetBreakdown(trip);
  assert.equal(result.knownEstimatedSpend, 0);
  assert.equal(result.remainingBudget, 600);
  assert.equal(result.perPersonKnownSpend, 0);
  assert.equal(result.transportEstimate, null);
  assert.equal(result.activityEstimate, 0);
});

test("budget breakdown separates known meals from unknown activity and transport costs", () => {
  const trip = {
    budgetTotal: 600,
    memberIds: ["a", "b"],
    itinerary: [{ activities: [
      { type: "meal", estimatedCost: 25 },
      { type: "place", estimatedCost: 0 },
      { type: "transit", estimatedCost: 0 },
    ] }],
  } as unknown as Trip;
  assert.deepEqual(computeBudgetBreakdown(trip), {
    foodEstimate: 25,
    transportEstimate: null,
    activityEstimate: null,
    knownEstimatedSpend: 25,
    remainingBudget: 575,
    perPersonKnownSpend: 13,
    unknownCostActivityCount: 2,
  });
});
