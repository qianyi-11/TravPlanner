import assert from "node:assert/strict";
import test from "node:test";
import { compareSameDayIntervals, createSameDayInterval, intervalContains, intervalsOverlap, sameDayIntervalFromTimes } from "./time-intervals";

test("same-day half-open intervals validate, contain, overlap, and sort", () => {
  const first = sameDayIntervalFromTimes("2026-09-11", "08:00", "09:00")!;
  const touching = sameDayIntervalFromTimes("2026-09-11", "09:00", "10:00")!;
  const overlapping = sameDayIntervalFromTimes("2026-09-11", "08:30", "09:30")!;
  assert.equal(intervalsOverlap(first, touching), false);
  assert.equal(intervalsOverlap(first, overlapping), true);
  assert.equal(intervalContains(first, createSameDayInterval("2026-09-11", 500, 520)!), true);
  assert.ok(compareSameDayIntervals(first, touching) < 0);
  assert.equal(intervalsOverlap(first, { ...first, date: "2026-09-12" }), false);
});

test("same-day intervals reject invalid dates, minutes, and windows", () => {
  assert.equal(createSameDayInterval("2026-02-30", 0, 1), null);
  assert.equal(createSameDayInterval("2026-09-11", -1, 1), null);
  assert.equal(createSameDayInterval("2026-09-11", 1, 1), null);
  assert.equal(createSameDayInterval("2026-09-11", 2, 1), null);
  assert.equal(createSameDayInterval("2026-09-11", 0, 1441), null);
  assert.equal(sameDayIntervalFromTimes("2026-09-11", "8:00", "09:00"), null);
});
