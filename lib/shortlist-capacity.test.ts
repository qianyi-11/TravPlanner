import assert from "node:assert/strict";
import test from "node:test";
import { recommendShortlistCapacity } from "./shortlist-capacity";
import { buildConsensus } from "./group-consensus";
import type { Member } from "./types";

const candidates = [
  { category: "Museum", estimatedDurationMinutes: 90 },
  { category: "Park", estimatedDurationMinutes: 60 },
  { category: "Restaurant", estimatedDurationMinutes: 60 },
];
const trip = { startDate: "2026-01-01", endDate: "2026-01-02", dailyStart: "08:00", dailyEnd: "20:00" };

test("shortlist capacity is deterministic, order-independent, and schedule-aware", () => {
  const first = recommendShortlistCapacity({ trip, candidates });
  assert.deepEqual(first, recommendShortlistCapacity({ trip, candidates: [...candidates].reverse() }));
  assert.ok(recommendShortlistCapacity({ trip: { ...trip, endDate: "2026-01-03" }, candidates }).recommendedCapacity >= first.recommendedCapacity);
  assert.ok(recommendShortlistCapacity({ trip: { ...trip, dailyEnd: "16:00" }, candidates }).recommendedCapacity <= first.recommendedCapacity);
});

test("capacity recommendation feeds the unchanged consensus selector", () => {
  const capacity = recommendShortlistCapacity({ trip, candidates }).recommendedCapacity;
  const places = candidates.map((candidate, index) => ({ id: String(index), name: String(index), area: "A", description: "", votedBy: [], ...candidate }));
  const members = [] as Member[];
  assert.deepEqual(buildConsensus({ members, candidates: places, capacity }), buildConsensus({ members, candidates: places, capacity }));
});
