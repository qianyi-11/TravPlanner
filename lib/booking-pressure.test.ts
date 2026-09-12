import assert from "node:assert/strict";
import { test } from "node:test";
import { computeBookingPressure } from "./booking-pressure";

test("planning urgency uses calendar-day thresholds", () => {
  const cases = [
    ["2026-12-31", "2026-10-01", "LOW"],
    ["2026-12-30", "2026-10-01", "MEDIUM"],
    ["2026-10-31", "2026-10-01", "HIGH"],
    ["2026-10-08", "2026-10-01", "VERY HIGH"],
    ["2026-09-30", "2026-10-01", "VERY HIGH"],
  ] as const;
  for (const [startDate, now, level] of cases) assert.equal(computeBookingPressure(startDate, now).level, level);
  assert.throws(() => computeBookingPressure("2026-02-30", "2026-01-01"));
  assert.equal(computeBookingPressure("2026-09-30", "2026-10-01").reasons[0].includes("demand"), false);
});
