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
  assert.equal(computeBudgetBreakdown(trip).perPerson, 70);
});
